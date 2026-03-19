# AI-Powered Agent Apps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified Agent App Runtime with capability-based DI, then implement three AI-powered native apps (Deep Researcher, Brainstorm Partner, Knowledge Linker).

**Architecture:** One runtime manages all apps. Apps declare `runtimeCapabilities` in their manifest — the runtime injects only the requested clients (shell, llm, tools, channel, pane, storage). Communication uses bidirectional channels with dispatch (request/response) and stream (real-time) modes. Interactive apps can open their own pane for direct user dialogue.

**Tech Stack:** TypeScript, Zustand, Tauri IPC (`invoke`), existing `streamChat` bridge, existing tool registry, existing event bus.

**Spec:** `docs/specs/2026-03-18-ai-agent-apps-design.md`

---

## Review Notes (Must-fix before/during implementation)

### Critical Fixes

**C1. `streamChat` type mismatch (Task 4):** The `LLMClient.chat()` uses `LLMMessage[]` but `streamChat` accepts `AgentMessage[]` (from `types/index.ts`). The context factory must map `LLMMessage` → `AgentMessage` properly, not cast via `as Record<string, unknown>[]`. Use `AgentMessage` directly or write a proper adapter.

**C2. Layout store missing `addPane`/`removePane` (Task 11):** The layout store (`stores/layout.ts`) only has `setWorkspaceLayout` and `deleteWorkspaceLayout`. Before Task 11, add `addPane(workspaceId, pane)` and `removePane(workspaceId, paneId)` methods to the layout store. This is a prerequisite step.

**C3. Knowledge Linker module-level mutable state (Task 9):** `pendingPaths` and `debounceTimer` must be moved **inside** the `createKnowledgeLinker()` closure. Module-level state is shared across workspaces and violates immutability conventions.

### Important Fixes

**I1. Debounce timing in Knowledge Linker test (Task 9):** `handleTrigger` calls `enqueueIndex` with 500ms debounce, but the test awaits `processingQueue` which resolves before the timer fires. Fix: use `vi.useFakeTimers()` + `vi.advanceTimersByTime(500)` in the test, or make `handleTrigger` index directly (no debounce) and only debounce event-bus triggers.

**I2. Shell app migration incomplete (Task 6):** Adding `runtimeCapabilities: { shell: true }` to manifests is not enough — the existing apps have no `activate()` method and use hardcoded commands in `runner.ts`. For Phase 1, keep existing shell apps running through `runner.ts` as-is. The runtime only handles new apps with `runtimeCapabilities`. Migration of shell apps to the runtime is deferred to a follow-up task.

**I3. Shared types placement (Tasks 2, 4):** Per CLAUDE.md, all shared types go in `src/types/index.ts`. Move `ChannelMessage`, `AppChannel`, `AppContext`, `ShellClient`, `LLMClient`, `ToolClient`, `PaneClient` type definitions to `types/index.ts`. The implementation files import from there.

**I4. Tasks 10-11 ordering:** Swap — implement PaneClient bridge (Task 11) before AppPaneChat component (Task 10), since the bridge creates the pane in the layout store.

**I5. Missing dispatch timeout:** Add `Promise.race` timeout wrapper in `runtime.dispatch()` — 120s for Researcher, 30s for Linker queries, skip for Brainstorm (pane-based). Add `dispatchTimeoutMs?: number` to `AgentAppManifest` or resolve from a config map.

### Minor Fixes

- Deep Researcher test should assert `storage.set` was called
- Brainstorm Partner should implement `deactivate()` to save in-progress pane state
- AppPaneChat should render assistant messages with `react-markdown` for consistency
- Task 12's `providerType` snippet needs completion: resolve from `useProviderStore.getState().providers.find(p => p.id === providerId)?.type`

---

## Phase 1: Foundation (Runtime + Clients)

### Task 1: Add RuntimeCapabilities to Types

**Files:**
- Modify: `src/types/index.ts:112-158`

- [ ] **Step 1: Write the failing test**

```typescript
// src/types/index.test.ts
import { describe, it, expect } from "vitest"

describe("RuntimeCapabilities type", () => {
  it("accepts valid runtimeCapabilities on manifest", () => {
    const manifest = {
      id: "test.app",
      name: "Test",
      version: "1.0.0",
      description: "test",
      kind: "native" as const,
      capabilities: { acceptsTasks: false },
      runtimeCapabilities: {
        llm: true,
        tools: ["read_file", "web_fetch"],
        channel: true,
        storage: { scope: "workspace" as const },
      },
      toolExposure: "isolated" as const,
      permissions: { filesystem: "none" as const, network: "none" as const, shell: false },
      lifecycle: { startup: "lazy" as const, persistence: "session" as const },
    }
    // Type-level test: if this compiles, the type is correct
    expect(manifest.runtimeCapabilities?.llm).toBe(true)
    expect(manifest.runtimeCapabilities?.tools).toEqual(["read_file", "web_fetch"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/types/index.test.ts`
Expected: FAIL — `runtimeCapabilities` not in type

- [ ] **Step 3: Add types to `src/types/index.ts`**

Add after line 157 (after `AgentAppManifest` closing brace), and add the field to the interface:

```typescript
// Add to AgentAppManifest interface (inside, after harness field):
  /** Runtime capabilities — DI injection targets. Separate from `capabilities` which describes what the app exposes. */
  runtimeCapabilities?: RuntimeCapabilities

// Add after AgentAppManifest:
export interface RuntimeCapabilities {
  shell?: boolean
  llm?: boolean
  tools?: string[]
  channel?: boolean
  pane?: boolean
  storage?: { scope: "workspace" | "global" }
}

export interface StorageFilter {
  keyPrefix?: string
  tags?: string[]
  since?: string
}

export type AppStatus = "inactive" | "activating" | "active" | "error" | "deactivating"

export interface AppHealth {
  appId: string
  status: AppStatus
  lastDispatch?: { timestamp: string; success: boolean; durationMs: number }
  errorCount: number
  totalDispatches: number
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/types/index.test.ts`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no existing code breaks)

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/types/index.test.ts
git commit -m "feat: add RuntimeCapabilities and AppHealth types"
```

---

### Task 2: Implement AppChannel

**Files:**
- Create: `src/services/agent-apps/channel.ts`
- Create: `src/services/agent-apps/channel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/agent-apps/channel.test.ts
import { describe, it, expect, vi } from "vitest"
import { createAppChannel } from "./channel"

describe("AppChannel", () => {
  it("send/onMessage delivers fire-and-forget messages", () => {
    const [agentSide, appSide] = createAppChannel("test-app")
    const handler = vi.fn()

    appSide.onMessage(handler)
    agentSide.send({ type: "update", from: "workspace-agent", payload: { status: "ok" } })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].type).toBe("update")
    expect(handler.mock.calls[0][0].id).toBeDefined() // auto-generated UUID
  })

  it("request/onRequest correlates request and response", async () => {
    const [agentSide, appSide] = createAppChannel("test-app")

    appSide.onRequest(async (msg) => ({
      id: crypto.randomUUID(),
      type: "result" as const,
      from: "test-app",
      payload: { answer: `re: ${msg.payload}` },
      replyTo: msg.id,
    }))

    const response = await agentSide.request({
      type: "dispatch",
      from: "workspace-agent",
      payload: "hello",
    })

    expect(response.type).toBe("result")
    expect(response.payload).toEqual({ answer: "re: hello" })
    expect(response.replyTo).toBeDefined()
  })

  it("request rejects on abort signal", async () => {
    const [agentSide, appSide] = createAppChannel("test-app")
    // No handler registered — request will hang
    appSide.onRequest(async () => new Promise(() => {})) // never resolves

    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)

    await expect(
      agentSide.request(
        { type: "dispatch", from: "workspace-agent", payload: "test" },
        controller.signal
      )
    ).rejects.toThrow()
  })

  it("close removes all listeners", () => {
    const [agentSide, appSide] = createAppChannel("test-app")
    const handler = vi.fn()
    appSide.onMessage(handler)

    agentSide.close()
    agentSide.send({ type: "update", from: "workspace-agent", payload: null })

    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/agent-apps/channel.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement channel**

```typescript
// src/services/agent-apps/channel.ts

export interface ChannelMessage {
  id: string
  type: "dispatch" | "result" | "query" | "update" | "chunk" | "error"
  from: string
  payload: unknown
  replyTo?: string
}

export interface AppChannel {
  request(msg: Omit<ChannelMessage, "id">, signal?: AbortSignal): Promise<ChannelMessage>
  onRequest(handler: (msg: ChannelMessage) => Promise<ChannelMessage>): void
  send(msg: Omit<ChannelMessage, "id">): void
  onMessage(handler: (msg: ChannelMessage) => void): void
  close(): void
}

/**
 * Create a linked pair of channels: [agentSide, appSide].
 * Messages sent on one side are received on the other.
 */
export function createAppChannel(appId: string): [AppChannel, AppChannel] {
  let closed = false
  const messageHandlersA: Array<(msg: ChannelMessage) => void> = []
  const messageHandlersB: Array<(msg: ChannelMessage) => void> = []
  let requestHandlerA: ((msg: ChannelMessage) => Promise<ChannelMessage>) | null = null
  let requestHandlerB: ((msg: ChannelMessage) => Promise<ChannelMessage>) | null = null

  function stamp(msg: Omit<ChannelMessage, "id">): ChannelMessage {
    return { ...msg, id: crypto.randomUUID() }
  }

  const agentSide: AppChannel = {
    send(msg) {
      if (closed) return
      const full = stamp(msg)
      for (const h of messageHandlersB) h(full)
    },
    onMessage(handler) {
      messageHandlersA.push(handler)
    },
    async request(msg, signal?) {
      if (closed) throw new Error("Channel closed")
      const full = stamp(msg)
      if (!requestHandlerB) throw new Error(`No request handler on app side: ${appId}`)
      if (signal?.aborted) throw new Error("Aborted")
      return new Promise<ChannelMessage>((resolve, reject) => {
        if (signal) {
          signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true })
        }
        requestHandlerB!(full).then(resolve, reject)
      })
    },
    onRequest(handler) {
      requestHandlerA = handler
    },
    close() {
      closed = true
      messageHandlersA.length = 0
      messageHandlersB.length = 0
      requestHandlerA = null
      requestHandlerB = null
    },
  }

  const appSide: AppChannel = {
    send(msg) {
      if (closed) return
      const full = stamp(msg)
      for (const h of messageHandlersA) h(full)
    },
    onMessage(handler) {
      messageHandlersB.push(handler)
    },
    async request(msg, signal?) {
      if (closed) throw new Error("Channel closed")
      const full = stamp(msg)
      if (!requestHandlerA) throw new Error(`No request handler on agent side: ${appId}`)
      if (signal?.aborted) throw new Error("Aborted")
      return new Promise<ChannelMessage>((resolve, reject) => {
        if (signal) {
          signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true })
        }
        requestHandlerA!(full).then(resolve, reject)
      })
    },
    onRequest(handler) {
      requestHandlerB = handler
    },
    close() {
      agentSide.close()
    },
  }

  return [agentSide, appSide]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/services/agent-apps/channel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-apps/channel.ts src/services/agent-apps/channel.test.ts
git commit -m "feat: implement AppChannel with dispatch and stream modes"
```

---

### Task 3: Implement StorageClient

**Files:**
- Create: `src/services/agent-apps/storage-client.ts`
- Create: `src/services/agent-apps/storage-client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/agent-apps/storage-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createStorageClient } from "./storage-client"

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

import { invoke } from "@tauri-apps/api/core"
const mockInvoke = vi.mocked(invoke)

describe("StorageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: empty store
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "read_file") return "{}"
      if (cmd === "write_file") return undefined
      return undefined
    })
  })

  it("get returns null for missing key", async () => {
    const client = createStorageClient("ws-1", "native.researcher", "workspace")
    const result = await client.get("missing")
    expect(result).toBeNull()
  })

  it("set then get returns the value", async () => {
    const store: Record<string, unknown> = {}
    mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "read_file") return JSON.stringify(store)
      if (cmd === "write_file") {
        Object.assign(store, JSON.parse(args?.content as string))
        return undefined
      }
      return undefined
    })

    const client = createStorageClient("ws-1", "native.researcher", "workspace")
    await client.set("key1", { topic: "test" })
    const result = await client.get("key1")
    expect(result).toEqual({ topic: "test" })
  })

  it("list returns all keys", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "read_file") return JSON.stringify({ a: 1, b: 2, c: 3 })
      return undefined
    })

    const client = createStorageClient("ws-1", "native.researcher", "workspace")
    const keys = await client.list()
    expect(keys).toEqual(["a", "b", "c"])
  })

  it("query filters by keyPrefix", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "read_file")
        return JSON.stringify({ "research:1": { x: 1 }, "research:2": { x: 2 }, "other:1": { x: 3 } })
      return undefined
    })

    const client = createStorageClient("ws-1", "native.researcher", "workspace")
    const results = await client.query({ keyPrefix: "research:" })
    expect(Object.keys(results)).toEqual(["research:1", "research:2"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/agent-apps/storage-client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement StorageClient**

```typescript
// src/services/agent-apps/storage-client.ts
import { invoke } from "@tauri-apps/api/core"
import type { StorageFilter } from "@/types"

export interface StorageClient {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  list(): Promise<string[]>
  delete(key: string): Promise<void>
  query(filter: StorageFilter): Promise<Record<string, unknown>>
}

export function createStorageClient(
  workspaceId: string,
  appId: string,
  scope: "workspace" | "global"
): StorageClient {
  const basePath =
    scope === "workspace"
      ? `~/.mindeck/workspaces/${workspaceId}/apps/${appId}`
      : `~/.mindeck/apps/${appId}`
  const filePath = `${basePath}/store.json`

  // In-memory cache to avoid repeated reads
  let cache: Record<string, unknown> | null = null

  async function load(): Promise<Record<string, unknown>> {
    if (cache) return cache
    try {
      const raw = await invoke<string>("read_file", { path: filePath })
      cache = JSON.parse(raw) as Record<string, unknown>
    } catch {
      cache = {}
    }
    return cache
  }

  async function save(): Promise<void> {
    if (!cache) return
    await invoke("write_file", { path: filePath, content: JSON.stringify(cache, null, 2) })
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      const store = await load()
      return (store[key] as T) ?? null
    },

    async set<T>(key: string, value: T): Promise<void> {
      const store = await load()
      cache = { ...store, [key]: value }
      await save()
    },

    async list(): Promise<string[]> {
      const store = await load()
      return Object.keys(store)
    },

    async delete(key: string): Promise<void> {
      const store = await load()
      const { [key]: _, ...rest } = store
      cache = rest
      await save()
    },

    async query(filter: StorageFilter): Promise<Record<string, unknown>> {
      const store = await load()
      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(store)) {
        if (filter.keyPrefix && !k.startsWith(filter.keyPrefix)) continue
        if (filter.since) {
          const entry = v as Record<string, unknown>
          const ts = entry.lastIndexed ?? entry.timestamp
          if (typeof ts === "string" && ts < filter.since) continue
        }
        result[k] = v
      }
      return result
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/services/agent-apps/storage-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-apps/storage-client.ts src/services/agent-apps/storage-client.test.ts
git commit -m "feat: implement StorageClient with scoped JSON file persistence"
```

---

### Task 4: Implement Context Factory

**Files:**
- Create: `src/services/agent-apps/context-factory.ts`
- Create: `src/services/agent-apps/context-factory.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/agent-apps/context-factory.test.ts
import { describe, it, expect, vi } from "vitest"
import { buildAppContext } from "./context-factory"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

describe("buildAppContext", () => {
  const baseParams = {
    appId: "native.researcher",
    workspaceId: "ws-1",
    workspaceRoot: "/tmp/workspace",
    providerId: "deepseek",
    providerType: "openai-compatible" as const,
    modelId: "deepseek-chat",
  }

  it("always includes appId, workspaceId, workspaceRoot", () => {
    const ctx = buildAppContext({ ...baseParams, capabilities: {} })
    expect(ctx.appId).toBe("native.researcher")
    expect(ctx.workspaceId).toBe("ws-1")
    expect(ctx.workspaceRoot).toBe("/tmp/workspace")
  })

  it("injects shell client when shell: true", () => {
    const ctx = buildAppContext({ ...baseParams, capabilities: { shell: true } })
    expect(ctx.shell).toBeDefined()
    expect(ctx.shell!.exec).toBeTypeOf("function")
  })

  it("injects llm client when llm: true", () => {
    const ctx = buildAppContext({ ...baseParams, capabilities: { llm: true } })
    expect(ctx.llm).toBeDefined()
    expect(ctx.llm!.chat).toBeTypeOf("function")
  })

  it("injects tool client with only declared tools", () => {
    const ctx = buildAppContext({
      ...baseParams,
      capabilities: { tools: ["read_file", "web_fetch"] },
    })
    expect(ctx.tools).toBeDefined()
    expect(ctx.tools!.call).toBeTypeOf("function")
  })

  it("injects storage client when storage declared", () => {
    const ctx = buildAppContext({
      ...baseParams,
      capabilities: { storage: { scope: "workspace" } },
    })
    expect(ctx.storage).toBeDefined()
    expect(ctx.storage!.get).toBeTypeOf("function")
  })

  it("does NOT inject capabilities that are not declared", () => {
    const ctx = buildAppContext({ ...baseParams, capabilities: {} })
    expect(ctx.shell).toBeUndefined()
    expect(ctx.llm).toBeUndefined()
    expect(ctx.tools).toBeUndefined()
    expect(ctx.channel).toBeUndefined()
    expect(ctx.pane).toBeUndefined()
    expect(ctx.storage).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/agent-apps/context-factory.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement context factory**

```typescript
// src/services/agent-apps/context-factory.ts
import { invoke } from "@tauri-apps/api/core"
import { streamChat } from "@/services/providers/bridge"
import { executeTool } from "@/services/tools/registry"
import { createStorageClient } from "./storage-client"
import type { RuntimeCapabilities } from "@/types"
import type { AppChannel } from "./channel"
import type { StorageClient } from "./storage-client"

export interface ShellClient {
  exec(command: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
}

export interface LLMMessage {
  role: "user" | "assistant" | "system" | "tool"
  content: string
  toolCalls?: unknown[]
  toolCallId?: string
}

export interface LLMChunk {
  type: "text" | "tool_call_start" | "tool_call_args" | "tool_call_end"
  content?: string
  toolCall?: { id: string; name: string; arguments: string }
}

export interface LLMClient {
  chat(messages: LLMMessage[], tools?: unknown[], signal?: AbortSignal): AsyncIterable<LLMChunk>
}

export interface ToolClient {
  call(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result: string }>
}

export interface PaneClient {
  open(options?: { title?: string; icon?: string }): void
  close(): void
  sendChunk(text: string): void
  sendMessage(message: { role: "assistant" | "system"; content: string }): void
  onUserMessage(handler: (text: string) => void): void
  onClose(handler: () => void): void
  isOpen(): boolean
}

export interface AppContext {
  appId: string
  workspaceId: string
  workspaceRoot: string
  shell?: ShellClient
  llm?: LLMClient
  tools?: ToolClient
  channel?: AppChannel
  pane?: PaneClient
  storage?: StorageClient
}

interface BuildParams {
  appId: string
  workspaceId: string
  workspaceRoot: string
  providerId: string
  providerType: string
  modelId: string
  capabilities: RuntimeCapabilities
  channel?: AppChannel
  pane?: PaneClient
}

export function buildAppContext(params: BuildParams): AppContext {
  const { appId, workspaceId, workspaceRoot, capabilities } = params

  const ctx: AppContext = { appId, workspaceId, workspaceRoot }

  if (capabilities.shell) {
    ctx.shell = {
      async exec(command: string, cwd?: string) {
        const result = await invoke<string>("bash_exec", {
          command,
          cwd: cwd ?? workspaceRoot,
        })
        // bash_exec returns stdout string; stderr/exitCode require stream variant
        return { stdout: typeof result === "string" ? result : String(result), stderr: "", exitCode: 0 }
      },
    }
  }

  if (capabilities.llm) {
    ctx.llm = {
      async *chat(messages, tools?, signal?) {
        const stream = streamChat(
          params.providerId,
          params.providerType,
          params.modelId,
          messages as Record<string, unknown>[],
          tools,
          signal
        )
        for await (const chunk of stream) {
          if (chunk.delta) {
            yield { type: "text" as const, content: chunk.delta }
          }
          if (chunk.toolCallStart) {
            yield {
              type: "tool_call_start" as const,
              toolCall: { id: chunk.toolCallStart.id, name: chunk.toolCallStart.name, arguments: "" },
            }
          }
          if (chunk.toolCallArgsDelta) {
            yield {
              type: "tool_call_args" as const,
              toolCall: { id: chunk.toolCallArgsDelta.id, name: "", arguments: chunk.toolCallArgsDelta.delta },
            }
          }
          if (chunk.toolCallEnd) {
            yield { type: "tool_call_end" as const, toolCall: { id: chunk.toolCallEnd.id, name: "", arguments: "" } }
          }
        }
      },
    }
  }

  if (capabilities.tools && capabilities.tools.length > 0) {
    const allowedTools = new Set(capabilities.tools)
    ctx.tools = {
      async call(name, args) {
        if (!allowedTools.has(name)) {
          throw new Error(`Tool "${name}" not declared in app capabilities`)
        }
        const result = await executeTool(name, args)
        return { ok: true, result: typeof result === "string" ? result : JSON.stringify(result) }
      },
    }
  }

  if (capabilities.channel && params.channel) {
    ctx.channel = params.channel
  }

  if (capabilities.pane && params.pane) {
    ctx.pane = params.pane
  }

  if (capabilities.storage) {
    ctx.storage = createStorageClient(workspaceId, appId, capabilities.storage.scope)
  }

  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/services/agent-apps/context-factory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-apps/context-factory.ts src/services/agent-apps/context-factory.test.ts
git commit -m "feat: implement AppContext factory with capability-based DI"
```

---

### Task 5: Implement AgentAppRuntime

**Files:**
- Create: `src/services/agent-apps/runtime.ts`
- Create: `src/services/agent-apps/runtime.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/agent-apps/runtime.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { AgentAppRuntime } from "./runtime"
import type { AgentAppManifest } from "@/types"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const mockManifest: AgentAppManifest = {
  id: "test.app",
  name: "Test App",
  version: "1.0.0",
  description: "test",
  kind: "native",
  capabilities: {},
  runtimeCapabilities: { channel: true },
  toolExposure: "isolated",
  permissions: { filesystem: "none", network: "none", shell: false },
  lifecycle: { startup: "eager", persistence: "session" },
}

describe("AgentAppRuntime", () => {
  let runtime: AgentAppRuntime

  beforeEach(() => {
    runtime = new AgentAppRuntime()
  })

  it("registers and activates an app on start", async () => {
    const activateFn = vi.fn()
    runtime.registerApp(mockManifest, {
      manifest: mockManifest,
      activate: activateFn,
    })

    await runtime.start("ws-1", [mockManifest], {
      providerId: "p1",
      providerType: "openai-compatible",
      modelId: "m1",
      workspaceRoot: "/tmp",
    })

    expect(activateFn).toHaveBeenCalledTimes(1)
    expect(runtime.getAppHealth("test.app")?.status).toBe("active")
  })

  it("sets status to error when activate throws", async () => {
    runtime.registerApp(mockManifest, {
      manifest: mockManifest,
      activate: vi.fn().mockRejectedValue(new Error("fail")),
    })

    await runtime.start("ws-1", [mockManifest], {
      providerId: "p1",
      providerType: "openai-compatible",
      modelId: "m1",
      workspaceRoot: "/tmp",
    })

    expect(runtime.getAppHealth("test.app")?.status).toBe("error")
  })

  it("stop deactivates all apps", async () => {
    const deactivateFn = vi.fn()
    runtime.registerApp(mockManifest, {
      manifest: mockManifest,
      activate: vi.fn(),
      deactivate: deactivateFn,
    })

    await runtime.start("ws-1", [mockManifest], {
      providerId: "p1",
      providerType: "openai-compatible",
      modelId: "m1",
      workspaceRoot: "/tmp",
    })

    await runtime.stop()
    expect(deactivateFn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/agent-apps/runtime.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement runtime**

```typescript
// src/services/agent-apps/runtime.ts
import { createAppChannel } from "./channel"
import { buildAppContext } from "./context-factory"
import { createLogger } from "@/services/logger"
import type { AgentAppManifest, AppHealth, HarnessTrigger } from "@/types"
import type { AppChannel } from "./channel"
import type { AppContext, PaneClient } from "./context-factory"

const log = createLogger("AgentAppRuntime")

export interface TriggerPayload {
  filePath?: string
  toolName?: string
  toolResult?: string
  taskId?: string
}

export interface AgentApp {
  manifest: AgentAppManifest
  activate(ctx: AppContext): Promise<void>
  deactivate?(): Promise<void>
  handleDispatch?(task: unknown): Promise<unknown>
  handleTrigger?(event: HarnessTrigger, payload: TriggerPayload): Promise<void>
}

interface RuntimeConfig {
  providerId: string
  providerType: string
  modelId: string
  workspaceRoot: string
}

interface ActiveApp {
  app: AgentApp
  agentChannel: AppChannel
  appChannel: AppChannel
  health: AppHealth
}

export class AgentAppRuntime {
  private apps = new Map<string, ActiveApp>()
  private registry = new Map<string, AgentApp>()
  private workspaceId = ""
  private config: RuntimeConfig | null = null

  registerApp(manifest: AgentAppManifest, app: AgentApp): void {
    this.registry.set(manifest.id, app)
  }

  async start(
    workspaceId: string,
    manifests: AgentAppManifest[],
    config: RuntimeConfig
  ): Promise<void> {
    this.workspaceId = workspaceId
    this.config = config

    for (const manifest of manifests) {
      const app = this.registry.get(manifest.id)
      if (!app) continue

      if (manifest.lifecycle.startup === "lazy") {
        // Register but don't activate — activate on first dispatch
        const [agentChannel, appChannel] = createAppChannel(manifest.id)
        this.apps.set(manifest.id, {
          app,
          agentChannel,
          appChannel,
          health: { appId: manifest.id, status: "inactive", errorCount: 0, totalDispatches: 0 },
        })
        continue
      }

      await this.activateApp(manifest.id, app, config)
    }
  }

  private async activateApp(appId: string, app: AgentApp, config: RuntimeConfig): Promise<void> {
    const [agentChannel, appChannel] = createAppChannel(appId)
    const health: AppHealth = { appId, status: "activating", errorCount: 0, totalDispatches: 0 }
    this.apps.set(appId, { app, agentChannel, appChannel, health })

    try {
      const ctx = buildAppContext({
        appId,
        workspaceId: this.workspaceId,
        workspaceRoot: config.workspaceRoot,
        providerId: config.providerId,
        providerType: config.providerType,
        modelId: config.modelId,
        capabilities: app.manifest.runtimeCapabilities ?? {},
        channel: appChannel,
      })

      await app.activate(ctx)
      health.status = "active"
      log.debug("app activated", { appId })
    } catch (err) {
      health.status = "error"
      health.errorCount += 1
      log.warn("app activation failed", { appId, error: err instanceof Error ? err.message : String(err) })
    }
  }

  async dispatch(appId: string, task: unknown): Promise<unknown> {
    const entry = this.apps.get(appId)
    if (!entry) throw new Error(`App not found: ${appId}`)

    // Lazy activation
    if (entry.health.status === "inactive" && this.config) {
      await this.activateApp(appId, entry.app, this.config)
    }

    if (entry.health.status !== "active") {
      throw new Error(`App ${appId} is in ${entry.health.status} state`)
    }

    if (!entry.app.handleDispatch) {
      throw new Error(`App ${appId} does not support dispatch`)
    }

    const start = Date.now()
    entry.health.totalDispatches += 1

    try {
      const result = await entry.app.handleDispatch(task)
      entry.health.lastDispatch = {
        timestamp: new Date().toISOString(),
        success: true,
        durationMs: Date.now() - start,
      }
      return result
    } catch (err) {
      entry.health.errorCount += 1
      entry.health.lastDispatch = {
        timestamp: new Date().toISOString(),
        success: false,
        durationMs: Date.now() - start,
      }
      throw err
    }
  }

  async trigger(appId: string, event: HarnessTrigger, payload: TriggerPayload): Promise<void> {
    const entry = this.apps.get(appId)
    if (!entry) return

    // Lazy activation for trigger
    if (entry.health.status === "inactive" && this.config) {
      await this.activateApp(appId, entry.app, this.config)
    }

    if (entry.health.status !== "active") return
    if (!entry.app.handleTrigger) return

    try {
      await entry.app.handleTrigger(event, payload)
    } catch (err) {
      entry.health.errorCount += 1
      log.warn("app trigger failed", { appId, error: err instanceof Error ? err.message : String(err) })
    }
  }

  getAppHealth(appId: string): AppHealth | undefined {
    return this.apps.get(appId)?.health
  }

  getAgentChannel(appId: string): AppChannel | undefined {
    return this.apps.get(appId)?.agentChannel
  }

  async stop(): Promise<void> {
    for (const [appId, entry] of this.apps) {
      try {
        if (entry.app.deactivate) await entry.app.deactivate()
        entry.agentChannel.close()
        entry.health.status = "inactive"
      } catch (err) {
        log.warn("app deactivation failed", { appId, error: err instanceof Error ? err.message : String(err) })
      }
    }
    this.apps.clear()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/services/agent-apps/runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-apps/runtime.ts src/services/agent-apps/runtime.test.ts
git commit -m "feat: implement AgentAppRuntime with lifecycle and dispatch"
```

---

## Phase 2: Migrate Existing Apps

### Task 6: Migrate Shell Apps to Runtime

**Files:**
- Modify: `src/services/native-apps/eslint-app.ts`
- Modify: `src/services/native-apps/tsc-app.ts`
- Modify: `src/services/native-apps/test-runner-app.ts`
- Modify: `src/services/native-apps/runner.ts`
- Modify: `src/services/harness/harness-engine.ts:143-170`
- Modify: `src/services/agents/workspace-agent.ts:912-934`

- [ ] **Step 1: Add `runtimeCapabilities: { shell: true }` to all three native app manifests**

In `eslint-app.ts`, `tsc-app.ts`, `test-runner-app.ts` — add after `nativeComponent` field:

```typescript
runtimeCapabilities: { shell: true },
```

- [ ] **Step 2: Run typecheck to verify**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Update harness-engine.ts to route through runtime when available**

In `harness-engine.ts`, modify the `runApp` method (line 143) to accept an optional runtime parameter. If the app has `runtimeCapabilities`, route through the runtime's `trigger()` method. Otherwise fall back to `runNativeApp()`.

```typescript
// In harness-engine.ts — update runApp signature and routing
private async runApp(
  app: AgentAppManifest,
  context: HarnessContext,
  agent: AgentFeedbackTarget,
  workspaceId: string,
  runtime?: AgentAppRuntime,
  triggerPayload?: TriggerPayload
): Promise<void> {
  log.debug("running harness app", { app: app.id })

  let result: string

  if (runtime && app.runtimeCapabilities) {
    // Route through unified runtime
    try {
      const trigger = app.harness?.triggers[0]
      if (trigger) {
        await runtime.trigger(app.id, trigger, triggerPayload ?? {})
      }
      result = `[${app.name}] Executed via runtime`
    } catch (err) {
      result = `[${app.name} error]: ${err instanceof Error ? err.message : String(err)}`
    }
  } else if (app.nativeComponent) {
    result = await runNativeApp(app, context.workspaceRoot)
  } else {
    result = `[Harness: ${app.name}] MCP app execution not yet supported in harness context.`
  }

  eventBus.emit("harness:feedback", { workspaceId, appName: app.name, result })

  if (app.harness?.feedbackToAgent) {
    agent.injectHarnessFeedback(app.name, result)
  }
}
```

Also update `start()` to accept and pass through the runtime reference.

- [ ] **Step 4: Run typecheck and existing tests**

Run: `pnpm typecheck && pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/native-apps/eslint-app.ts src/services/native-apps/tsc-app.ts src/services/native-apps/test-runner-app.ts src/services/harness/harness-engine.ts
git commit -m "refactor: add runtimeCapabilities to native apps, route through runtime"
```

---

## Phase 3: AI-Powered Apps

### Task 7: Implement Deep Researcher

**Files:**
- Create: `src/services/agent-apps/apps/deep-researcher.ts`
- Create: `src/services/agent-apps/apps/deep-researcher.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/agent-apps/apps/deep-researcher.test.ts
import { describe, it, expect, vi } from "vitest"
import { createDeepResearcher } from "./deep-researcher"

describe("DeepResearcher", () => {
  it("has correct manifest", () => {
    const app = createDeepResearcher()
    expect(app.manifest.id).toBe("native.deep-researcher")
    expect(app.manifest.runtimeCapabilities?.llm).toBe(true)
    expect(app.manifest.runtimeCapabilities?.tools).toContain("web_fetch")
    expect(app.manifest.runtimeCapabilities?.tools).toContain("read_file")
    expect(app.manifest.lifecycle.startup).toBe("lazy")
  })

  it("handleDispatch returns structured ResearchResult", async () => {
    const app = createDeepResearcher()

    // Mock context
    const mockCtx = {
      appId: "native.deep-researcher",
      workspaceId: "ws-1",
      workspaceRoot: "/tmp",
      llm: {
        async *chat() {
          yield {
            type: "text" as const,
            content: JSON.stringify({
              summary: "WebSocket provides full-duplex communication.",
              keyFindings: ["Low latency", "Bidirectional"],
              sources: [],
              openQuestions: ["Scalability?"],
            }),
          }
        },
      },
      tools: {
        async call(name: string) {
          if (name === "web_fetch") return { ok: true, result: "WebSocket is a protocol..." }
          return { ok: true, result: "file content" }
        },
      },
      storage: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue({}),
      },
    }

    await app.activate(mockCtx as never)
    const result = await app.handleDispatch!({ topic: "WebSocket vs SSE" })

    expect(result).toBeDefined()
    expect((result as Record<string, unknown>).topic).toBe("WebSocket vs SSE")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/agent-apps/apps/deep-researcher.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Deep Researcher**

```typescript
// src/services/agent-apps/apps/deep-researcher.ts
import type { AgentAppManifest } from "@/types"
import type { AgentApp } from "../runtime"
import type { AppContext, LLMClient, ToolClient, LLMMessage } from "../context-factory"
import type { StorageClient } from "../storage-client"

export const DEEP_RESEARCHER_MANIFEST: AgentAppManifest = {
  id: "native.deep-researcher",
  name: "Deep Researcher",
  kind: "native",
  version: "1.0.0",
  description: "Multi-step research on any topic. Fetches sources, reads content, synthesizes structured reports.",
  capabilities: { acceptsTasks: true },
  runtimeCapabilities: {
    llm: true,
    tools: ["web_fetch", "read_file"],
    channel: true,
    storage: { scope: "workspace" },
  },
  toolExposure: "isolated",
  permissions: { filesystem: "read", network: "full", shell: false },
  lifecycle: { startup: "lazy", persistence: "session" },
}

interface ResearchResult {
  topic: string
  summary: string
  keyFindings: string[]
  sources: { title: string; url?: string; path?: string; snippet: string }[]
  openQuestions: string[]
  timestamp: string
}

export function createDeepResearcher(): AgentApp {
  let llm: LLMClient | undefined
  let tools: ToolClient | undefined
  let storage: StorageClient | undefined

  return {
    manifest: DEEP_RESEARCHER_MANIFEST,

    async activate(ctx: AppContext) {
      llm = ctx.llm
      tools = ctx.tools
      storage = ctx.storage
    },

    async handleDispatch(task: unknown): Promise<ResearchResult> {
      const { topic } = task as { topic: string }
      if (!llm) throw new Error("LLM not available")

      // Step 1: Generate research plan
      const planMessages: LLMMessage[] = [
        {
          role: "system",
          content: "You are a research assistant. Given a topic, output a JSON array of 3-5 search queries or source URLs to investigate. Return only valid JSON.",
        },
        { role: "user", content: `Research topic: ${topic}` },
      ]

      let planText = ""
      for await (const chunk of llm.chat(planMessages)) {
        if (chunk.type === "text" && chunk.content) planText += chunk.content
      }

      // Step 2: Execute research (fetch sources)
      const sources: ResearchResult["sources"] = []
      try {
        const queries = JSON.parse(planText) as string[]
        for (const query of queries.slice(0, 5)) {
          if (tools) {
            try {
              const result = await tools.call("web_fetch", { url: query })
              if (result.ok) {
                sources.push({
                  title: query,
                  url: query.startsWith("http") ? query : undefined,
                  snippet: result.result.slice(0, 1000),
                })
              }
            } catch {
              // Skip failed fetches
            }
          }
        }
      } catch {
        // Plan wasn't valid JSON — proceed with LLM-only synthesis
      }

      // Step 3: Synthesize
      const synthMessages: LLMMessage[] = [
        {
          role: "system",
          content: `You are a research synthesizer. Given a topic and source material, produce a structured research report as JSON with fields: summary (string), keyFindings (string[]), openQuestions (string[]). Return only valid JSON.`,
        },
        {
          role: "user",
          content: `Topic: ${topic}\n\nSources:\n${sources.map((s) => `- ${s.title}: ${s.snippet}`).join("\n")}\n\nSynthesize a research report.`,
        },
      ]

      let synthText = ""
      for await (const chunk of llm.chat(synthMessages)) {
        if (chunk.type === "text" && chunk.content) synthText += chunk.content
      }

      let parsed: Partial<ResearchResult> = {}
      try {
        parsed = JSON.parse(synthText) as Partial<ResearchResult>
      } catch {
        parsed = { summary: synthText, keyFindings: [], openQuestions: [] }
      }

      const result: ResearchResult = {
        topic,
        summary: parsed.summary ?? "Research completed but synthesis failed.",
        keyFindings: parsed.keyFindings ?? [],
        sources,
        openQuestions: parsed.openQuestions ?? [],
        timestamp: new Date().toISOString(),
      }

      // Step 4: Persist
      if (storage) {
        await storage.set(`research:${Date.now()}`, result)
      }

      return result
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/services/agent-apps/apps/deep-researcher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-apps/apps/deep-researcher.ts src/services/agent-apps/apps/deep-researcher.test.ts
git commit -m "feat: implement Deep Researcher agent app"
```

---

### Task 8: Implement Brainstorm Partner

**Files:**
- Create: `src/services/agent-apps/apps/brainstorm-partner.ts`
- Create: `src/services/agent-apps/apps/brainstorm-partner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/agent-apps/apps/brainstorm-partner.test.ts
import { describe, it, expect, vi } from "vitest"
import { createBrainstormPartner } from "./brainstorm-partner"

describe("BrainstormPartner", () => {
  it("has correct manifest", () => {
    const app = createBrainstormPartner()
    expect(app.manifest.id).toBe("native.brainstorm-partner")
    expect(app.manifest.runtimeCapabilities?.pane).toBe(true)
    expect(app.manifest.runtimeCapabilities?.llm).toBe(true)
  })

  it("handleDispatch opens pane and returns result on close", async () => {
    const app = createBrainstormPartner()
    const closeHandlers: Array<() => void> = []
    const messageHandlers: Array<(text: string) => void> = []

    const mockPane = {
      open: vi.fn(),
      close: vi.fn(),
      sendChunk: vi.fn(),
      sendMessage: vi.fn(),
      onUserMessage: vi.fn((handler: (text: string) => void) => {
        messageHandlers.push(handler)
      }),
      onClose: vi.fn((handler: () => void) => {
        closeHandlers.push(handler)
      }),
      isOpen: vi.fn().mockReturnValue(true),
    }

    const mockLlm = {
      async *chat() {
        yield { type: "text" as const, content: "Let me think about this..." }
      },
    }

    await app.activate({
      appId: "native.brainstorm-partner",
      workspaceId: "ws-1",
      workspaceRoot: "/tmp",
      pane: mockPane,
      llm: mockLlm,
      storage: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue({}),
      },
    } as never)

    // Start dispatch (it will await pane close)
    const dispatchPromise = app.handleDispatch!({ problem: "naming a product" })

    // Simulate user message
    if (messageHandlers[0]) messageHandlers[0]("What about 'Mindeck'?")

    // Wait a tick for async processing
    await new Promise((r) => setTimeout(r, 50))

    // Simulate pane close
    if (closeHandlers[0]) closeHandlers[0]()

    const result = await dispatchPromise
    expect(mockPane.open).toHaveBeenCalled()
    expect(result).toBeDefined()
    expect((result as Record<string, unknown>).problem).toBe("naming a product")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/agent-apps/apps/brainstorm-partner.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Brainstorm Partner**

```typescript
// src/services/agent-apps/apps/brainstorm-partner.ts
import type { AgentAppManifest } from "@/types"
import type { AgentApp } from "../runtime"
import type { AppContext, LLMClient, PaneClient, LLMMessage } from "../context-factory"
import type { StorageClient } from "../storage-client"

export const BRAINSTORM_PARTNER_MANIFEST: AgentAppManifest = {
  id: "native.brainstorm-partner",
  name: "Brainstorm Partner",
  kind: "native",
  version: "1.0.0",
  description:
    "Interactive thinking partner using structured frameworks. Opens a dedicated pane for multi-turn dialogue.",
  capabilities: { acceptsTasks: true },
  runtimeCapabilities: {
    llm: true,
    channel: true,
    pane: true,
    storage: { scope: "workspace" },
  },
  toolExposure: "isolated",
  permissions: { filesystem: "none", network: "none", shell: false },
  lifecycle: { startup: "lazy", persistence: "session" },
}

interface BrainstormResult {
  problem: string
  framework: string
  perspectives: { angle: string; ideas: string[] }[]
  topIdeas: { idea: string; pros: string[]; cons: string[] }[]
  nextSteps: string[]
  sessionDuration: number
}

const SYSTEM_PROMPT = `You are a creative thinking partner. When given a problem:

1. Choose the most appropriate thinking framework:
   - Six Thinking Hats: for decisions with multiple stakeholders
   - First Principles: for breaking down complex problems
   - SCAMPER: for improving existing products/processes
   - Devil's Advocate: for stress-testing ideas

2. Guide the user through the framework step by step
3. Ask probing questions — don't just generate ideas
4. Challenge assumptions constructively
5. After exploration, converge: summarize top ideas with pros/cons

Keep responses concise (2-4 paragraphs max). Ask one question at a time.`

export function createBrainstormPartner(): AgentApp {
  let llm: LLMClient | undefined
  let pane: PaneClient | undefined
  let storage: StorageClient | undefined

  return {
    manifest: BRAINSTORM_PARTNER_MANIFEST,

    async activate(ctx: AppContext) {
      llm = ctx.llm
      pane = ctx.pane
      storage = ctx.storage
    },

    async handleDispatch(task: unknown): Promise<BrainstormResult> {
      const { problem } = task as { problem: string }
      if (!llm || !pane) throw new Error("LLM and Pane required")

      const startTime = Date.now()
      const history: LLMMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Problem to explore: ${problem}` },
      ]

      pane.open({ title: `Brainstorm: ${problem.slice(0, 40)}` })

      // Generate initial response
      await streamResponse(llm, history, pane)

      // Wait for pane to close (user is done brainstorming)
      await new Promise<void>((resolve) => {
        pane!.onUserMessage(async (text: string) => {
          history.push({ role: "user", content: text })
          await streamResponse(llm!, history, pane!)
        })
        pane!.onClose(() => resolve())
      })

      // Generate summary
      history.push({
        role: "user",
        content:
          "Summarize this brainstorm session as JSON with fields: framework (string), perspectives (array of {angle, ideas[]}), topIdeas (array of {idea, pros[], cons[]}), nextSteps (string[]). Return only valid JSON.",
      })

      let summaryText = ""
      for await (const chunk of llm.chat(history)) {
        if (chunk.type === "text" && chunk.content) summaryText += chunk.content
      }

      let parsed: Partial<BrainstormResult> = {}
      try {
        parsed = JSON.parse(summaryText) as Partial<BrainstormResult>
      } catch {
        parsed = {
          framework: "free-form",
          perspectives: [],
          topIdeas: [],
          nextSteps: ["Review brainstorm notes"],
        }
      }

      const result: BrainstormResult = {
        problem,
        framework: parsed.framework ?? "free-form",
        perspectives: parsed.perspectives ?? [],
        topIdeas: parsed.topIdeas ?? [],
        nextSteps: parsed.nextSteps ?? [],
        sessionDuration: Date.now() - startTime,
      }

      if (storage) {
        await storage.set(`session:${Date.now()}`, result)
      }

      return result
    },
  }
}

async function streamResponse(llm: LLMClient, history: LLMMessage[], pane: PaneClient): Promise<void> {
  let fullText = ""
  for await (const chunk of llm.chat(history)) {
    if (chunk.type === "text" && chunk.content) {
      pane.sendChunk(chunk.content)
      fullText += chunk.content
    }
  }
  history.push({ role: "assistant", content: fullText })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/services/agent-apps/apps/brainstorm-partner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-apps/apps/brainstorm-partner.ts src/services/agent-apps/apps/brainstorm-partner.test.ts
git commit -m "feat: implement Brainstorm Partner agent app with pane interaction"
```

---

### Task 9: Implement Knowledge Linker

**Files:**
- Create: `src/services/agent-apps/apps/knowledge-linker.ts`
- Create: `src/services/agent-apps/apps/knowledge-linker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/agent-apps/apps/knowledge-linker.test.ts
import { describe, it, expect, vi } from "vitest"
import { createKnowledgeLinker } from "./knowledge-linker"

describe("KnowledgeLinker", () => {
  it("has correct manifest with eager startup and file_written trigger", () => {
    const app = createKnowledgeLinker()
    expect(app.manifest.id).toBe("native.knowledge-linker")
    expect(app.manifest.lifecycle.startup).toBe("eager")
    expect(app.manifest.harness?.triggers[0].event).toBe("file_written")
  })

  it("handleTrigger indexes a file", async () => {
    const app = createKnowledgeLinker()
    const storageSpy = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({}),
    }

    await app.activate({
      appId: "native.knowledge-linker",
      workspaceId: "ws-1",
      workspaceRoot: "/tmp",
      llm: {
        async *chat() {
          yield {
            type: "text" as const,
            content: JSON.stringify({
              summary: "A guide to WebSocket",
              concepts: ["WebSocket", "real-time"],
              tags: ["networking"],
              entities: ["RFC 6455"],
            }),
          }
        },
      },
      tools: {
        async call(name: string) {
          if (name === "read_file") return { ok: true, result: "# WebSocket Guide\nWebSocket enables real-time communication." }
          return { ok: true, result: "" }
        },
      },
      storage: storageSpy,
    } as never)

    await app.handleTrigger!(
      { event: "file_written", pattern: "**/*.md" },
      { filePath: "/tmp/websocket.md" }
    )

    expect(storageSpy.set).toHaveBeenCalled()
    const [key, value] = storageSpy.set.mock.calls[0]
    expect(key).toBe("index:/tmp/websocket.md")
    expect(value.concepts).toContain("WebSocket")
  })

  it("handleTrigger skips unchanged files (same hash)", async () => {
    const app = createKnowledgeLinker()
    const content = "# Test\nSame content"
    const storageSpy = {
      get: vi.fn().mockResolvedValue({ contentHash: simpleHash(content) }),
      set: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({}),
    }

    await app.activate({
      appId: "native.knowledge-linker",
      workspaceId: "ws-1",
      workspaceRoot: "/tmp",
      llm: { async *chat() {} },
      tools: {
        async call() { return { ok: true, result: content } },
      },
      storage: storageSpy,
    } as never)

    await app.handleTrigger!(
      { event: "file_written", pattern: "**/*.md" },
      { filePath: "/tmp/test.md" }
    )

    // set should NOT be called — file unchanged
    expect(storageSpy.set).not.toHaveBeenCalled()
  })

  it("handleDispatch queries the index", async () => {
    const app = createKnowledgeLinker()
    const mockIndex = {
      "index:/tmp/a.md": { summary: "Auth guide", concepts: ["authentication", "JWT"], tags: ["security"] },
      "index:/tmp/b.md": { summary: "API design", concepts: ["REST", "endpoints"], tags: ["backend"] },
    }

    await app.activate({
      appId: "native.knowledge-linker",
      workspaceId: "ws-1",
      workspaceRoot: "/tmp",
      llm: {
        async *chat() {
          yield {
            type: "text" as const,
            content: JSON.stringify([
              { filePath: "/tmp/a.md", relevance: 0.9, snippet: "Auth guide about JWT" },
            ]),
          }
        },
      },
      tools: { async call() { return { ok: true, result: "" } } },
      storage: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue(Object.keys(mockIndex)),
        delete: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue(mockIndex),
      },
    } as never)

    const result = await app.handleDispatch!({ question: "How does auth work?" })
    expect(result).toBeDefined()
  })
})

// Duplicate of the hash function for testing
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return hash.toString(36)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/agent-apps/apps/knowledge-linker.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Knowledge Linker**

```typescript
// src/services/agent-apps/apps/knowledge-linker.ts
import type { AgentAppManifest, HarnessTrigger } from "@/types"
import type { AgentApp, TriggerPayload } from "../runtime"
import type { AppContext, LLMClient, ToolClient, LLMMessage } from "../context-factory"
import type { StorageClient } from "../storage-client"

export const KNOWLEDGE_LINKER_MANIFEST: AgentAppManifest = {
  id: "native.knowledge-linker",
  name: "Knowledge Linker",
  kind: "native",
  version: "1.0.0",
  description: "Auto-indexes workspace files into a searchable knowledge base with LLM-powered extraction.",
  capabilities: { acceptsTasks: true },
  runtimeCapabilities: {
    llm: true,
    tools: ["read_file", "list_dir"],
    channel: true,
    storage: { scope: "workspace" },
  },
  toolExposure: "isolated",
  permissions: { filesystem: "read", network: "none", shell: false },
  lifecycle: { startup: "eager", persistence: "workspace" },
  harness: {
    triggers: [{ event: "file_written", pattern: "**/*.{md,txt,json,ts,tsx,py,rs}" }],
    feedbackToAgent: false,
  },
}

interface KnowledgeEntry {
  filePath: string
  summary: string
  concepts: string[]
  tags: string[]
  entities: string[]
  relations?: { target: string; type: string }[]
  lastIndexed: string
  contentHash: string
}

// Debounce queue for batch indexing
let pendingPaths: string[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 500

export function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return hash.toString(36)
}

export function createKnowledgeLinker(): AgentApp {
  let llm: LLMClient | undefined
  let tools: ToolClient | undefined
  let storage: StorageClient | undefined
  let processingQueue = Promise.resolve()

  async function indexFile(filePath: string): Promise<void> {
    if (!llm || !tools || !storage) return

    // Read file
    const readResult = await tools.call("read_file", { path: filePath })
    if (!readResult.ok) return

    const content = readResult.result
    const hash = simpleHash(content)

    // Check if unchanged
    const existing = await storage.get<KnowledgeEntry>(`index:${filePath}`)
    if (existing && existing.contentHash === hash) return

    // LLM extraction
    const messages: LLMMessage[] = [
      {
        role: "system",
        content:
          "Extract metadata from this file. Return JSON with: summary (string, 1-2 sentences), concepts (string[], key topics), tags (string[], categories), entities (string[], named things like APIs, tools, people). Return only valid JSON.",
      },
      { role: "user", content: content.slice(0, 4000) },
    ]

    let extractText = ""
    for await (const chunk of llm.chat(messages)) {
      if (chunk.type === "text" && chunk.content) extractText += chunk.content
    }

    let extracted: Partial<KnowledgeEntry> = {}
    try {
      extracted = JSON.parse(extractText) as Partial<KnowledgeEntry>
    } catch {
      extracted = { summary: content.slice(0, 200), concepts: [], tags: [], entities: [] }
    }

    const entry: KnowledgeEntry = {
      filePath,
      summary: extracted.summary ?? "",
      concepts: extracted.concepts ?? [],
      tags: extracted.tags ?? [],
      entities: extracted.entities ?? [],
      lastIndexed: new Date().toISOString(),
      contentHash: hash,
    }

    await storage.set(`index:${filePath}`, entry)
  }

  function enqueueIndex(filePath: string): void {
    pendingPaths.push(filePath)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const batch = [...new Set(pendingPaths)]
      pendingPaths = []
      debounceTimer = null

      // Serial queue to avoid concurrent storage writes
      processingQueue = processingQueue.then(async () => {
        for (const path of batch) {
          await indexFile(path).catch(() => {})
        }
      })
    }, DEBOUNCE_MS)
  }

  return {
    manifest: KNOWLEDGE_LINKER_MANIFEST,

    async activate(ctx: AppContext) {
      llm = ctx.llm
      tools = ctx.tools
      storage = ctx.storage
    },

    async deactivate() {
      if (debounceTimer) clearTimeout(debounceTimer)
      pendingPaths = []
    },

    async handleTrigger(_event: HarnessTrigger, payload: TriggerPayload) {
      if (payload.filePath) {
        enqueueIndex(payload.filePath)
        // Wait for the processing queue to drain (for tests)
        await processingQueue
      }
    },

    async handleDispatch(task: unknown): Promise<unknown> {
      const { question } = task as { question: string }
      if (!llm || !storage) throw new Error("LLM and Storage required")

      // Load all index entries
      const allEntries = await storage.query({ keyPrefix: "index:" })
      const entries = Object.values(allEntries) as KnowledgeEntry[]

      if (entries.length === 0) {
        return { snippets: [], message: "Knowledge base is empty. Add files to the workspace to start indexing." }
      }

      // Build context for LLM re-ranking
      const indexSummary = entries
        .map((e) => `- ${e.filePath}: ${e.summary} [concepts: ${e.concepts.join(", ")}]`)
        .join("\n")

      const messages: LLMMessage[] = [
        {
          role: "system",
          content:
            "Given a question and a knowledge index, return the most relevant entries as a JSON array of { filePath, relevance (0-1), snippet }. Max 5 results. Return only valid JSON.",
        },
        {
          role: "user",
          content: `Question: ${question}\n\nKnowledge Index:\n${indexSummary}`,
        },
      ]

      let resultText = ""
      for await (const chunk of llm.chat(messages)) {
        if (chunk.type === "text" && chunk.content) resultText += chunk.content
      }

      let snippets: unknown[] = []
      try {
        snippets = JSON.parse(resultText) as unknown[]
      } catch {
        snippets = []
      }

      return { question, snippets, totalIndexed: entries.length }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/services/agent-apps/apps/knowledge-linker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-apps/apps/knowledge-linker.ts src/services/agent-apps/apps/knowledge-linker.test.ts
git commit -m "feat: implement Knowledge Linker agent app with auto-indexing"
```

---

## Phase 4: UI Integration

### Task 10: Implement AppPaneChat Component

**Files:**
- Create: `src/components/workspace/AppPaneChat.tsx`
- Modify: `src/components/workspace/PaneContent.tsx`

- [ ] **Step 1: Create AppPaneChat component**

```tsx
// src/components/workspace/AppPaneChat.tsx
import { useState, useRef, useEffect, useCallback } from "react"

interface AppPaneChatProps {
  appId: string
  title: string
}

interface PaneMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
}

export function AppPaneChat({ appId, title }: AppPaneChatProps) {
  const [messages, setMessages] = useState<PaneMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = useCallback(() => {
    if (!input.trim() || streaming) return
    const userMsg: PaneMessage = { id: crypto.randomUUID(), role: "user", content: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    // The PaneClient bridge will pick up user messages via the registered handler
    window.dispatchEvent(new CustomEvent(`app-pane-user-msg:${appId}`, { detail: input.trim() }))
  }, [input, streaming, appId])

  // Listen for app chunks and messages
  useEffect(() => {
    let currentAssistantId: string | null = null

    function handleChunk(e: Event) {
      const text = (e as CustomEvent).detail as string
      setStreaming(true)
      setMessages((prev) => {
        if (!currentAssistantId) {
          currentAssistantId = crypto.randomUUID()
          return [...prev, { id: currentAssistantId, role: "assistant", content: text }]
        }
        return prev.map((m) =>
          m.id === currentAssistantId ? { ...m, content: m.content + text } : m
        )
      })
    }

    function handleMessage(e: Event) {
      const msg = (e as CustomEvent).detail as { role: "assistant" | "system"; content: string }
      currentAssistantId = null
      setStreaming(false)
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), ...msg }])
    }

    function handleDone() {
      currentAssistantId = null
      setStreaming(false)
    }

    window.addEventListener(`app-pane-chunk:${appId}`, handleChunk)
    window.addEventListener(`app-pane-msg:${appId}`, handleMessage)
    window.addEventListener(`app-pane-done:${appId}`, handleDone)

    return () => {
      window.removeEventListener(`app-pane-chunk:${appId}`, handleChunk)
      window.removeEventListener(`app-pane-msg:${appId}`, handleMessage)
      window.removeEventListener(`app-pane-done:${appId}`, handleDone)
    }
  }, [appId])

  return (
    <div className="app-pane-chat">
      <div className="app-pane-chat-header">{title}</div>
      <div className="app-pane-chat-messages" ref={listRef} role="log" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`app-pane-msg app-pane-msg-${m.role}`}>
            <div className="app-pane-msg-content">{m.content}</div>
          </div>
        ))}
      </div>
      <div className="app-pane-chat-input">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Type your thoughts..."
          rows={1}
          disabled={streaming}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add styles to `src/app/globals.css`**

```css
/* App Pane Chat */
.app-pane-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-1);
}
.app-pane-chat-header {
  padding: 8px 12px;
  font-weight: 600;
  font-size: 13px;
  color: var(--color-t0);
  border-bottom: 1px solid var(--color-bd);
}
.app-pane-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.app-pane-msg {
  margin-bottom: 12px;
}
.app-pane-msg-user .app-pane-msg-content {
  color: var(--color-t0);
}
.app-pane-msg-assistant .app-pane-msg-content {
  color: var(--color-t1);
  border-left: 2px solid var(--color-ac);
  padding-left: 10px;
}
.app-pane-chat-input {
  padding: 8px 12px;
  border-top: 1px solid var(--color-bd);
}
.app-pane-chat-input textarea {
  width: 100%;
  background: var(--color-bg-2);
  color: var(--color-t0);
  border: 1px solid var(--color-bd);
  border-radius: var(--radius-sm);
  padding: 8px;
  font-family: var(--font-sans);
  font-size: 13px;
  resize: none;
}
```

- [ ] **Step 3: Wire into PaneContent.tsx**

Add an import and case for `agent-app` panes that have an `appId`:

```typescript
// In PaneContent.tsx — add AppPaneChat rendering for app panes
import { AppPaneChat } from "./AppPaneChat"

// Inside the render logic, when pane.type === "agent-app" and pane has appId:
if (pane.type === "agent-app" && pane.appId) {
  return <AppPaneChat appId={pane.appId} title={pane.title ?? "Agent App"} />
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/AppPaneChat.tsx src/components/workspace/PaneContent.tsx src/app/globals.css
git commit -m "feat: implement AppPaneChat component for interactive agent apps"
```

---

### Task 11: Implement PaneClient Bridge

**Files:**
- Create: `src/services/agent-apps/pane-client.ts`

- [ ] **Step 1: Implement PaneClient that bridges service → React via window events**

```typescript
// src/services/agent-apps/pane-client.ts
import { useLayoutStore } from "@/stores/layout"
import type { PaneClient } from "./context-factory"

/**
 * Creates a PaneClient that bridges the service layer to the React UI
 * via window CustomEvents and the Zustand layout store.
 */
export function createPaneClient(
  appId: string,
  workspaceId: string
): PaneClient {
  let open = false
  const closeHandlers: Array<() => void> = []
  const userMessageHandlers: Array<(text: string) => void> = []

  // Listen for user messages from the React component
  function handleUserMessage(e: Event) {
    const text = (e as CustomEvent).detail as string
    for (const handler of userMessageHandlers) handler(text)
  }

  return {
    open(options) {
      if (open) return
      open = true

      // Add pane to workspace layout via store
      const layoutStore = useLayoutStore.getState()
      layoutStore.addPane(workspaceId, {
        id: `app-pane-${appId}`,
        type: "agent-app",
        title: options?.title ?? appId,
        appId,
      })

      window.addEventListener(`app-pane-user-msg:${appId}`, handleUserMessage)
    },

    close() {
      if (!open) return
      open = false

      window.removeEventListener(`app-pane-user-msg:${appId}`, handleUserMessage)

      // Remove pane from workspace layout
      const layoutStore = useLayoutStore.getState()
      layoutStore.removePane(workspaceId, `app-pane-${appId}`)

      for (const handler of closeHandlers) handler()
    },

    sendChunk(text: string) {
      window.dispatchEvent(new CustomEvent(`app-pane-chunk:${appId}`, { detail: text }))
    },

    sendMessage(message) {
      window.dispatchEvent(new CustomEvent(`app-pane-msg:${appId}`, { detail: message }))
    },

    onUserMessage(handler) {
      userMessageHandlers.push(handler)
    },

    onClose(handler) {
      closeHandlers.push(handler)
    },

    isOpen() {
      return open
    },
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/agent-apps/pane-client.ts
git commit -m "feat: implement PaneClient bridge between service layer and React"
```

---

## Phase 5: Wire Everything Together

### Task 12: Register Apps and Update WorkspaceAgent

**Files:**
- Modify: `src/services/agents/workspace-agent.ts:912-934`
- Modify: `src/stores/agent-apps.ts`

- [ ] **Step 1: Add AppHealth tracking to agent-apps store**

Add to `AgentAppsState` interface and implementation:

```typescript
// Add to store state
appHealth: Record<string, AppHealth>
setAppHealth(appId: string, health: AppHealth): void
```

- [ ] **Step 2: Create runtime instance in workspace-agent.ts**

In `startHarness()`, create `AgentAppRuntime`, register the three new apps + existing shell apps, start the runtime, and pass it to the harness engine.

```typescript
// In workspace-agent.ts — import new apps and runtime
import { AgentAppRuntime } from "@/services/agent-apps/runtime"
import { createDeepResearcher, DEEP_RESEARCHER_MANIFEST } from "@/services/agent-apps/apps/deep-researcher"
import { createBrainstormPartner, BRAINSTORM_PARTNER_MANIFEST } from "@/services/agent-apps/apps/brainstorm-partner"
import { createKnowledgeLinker, KNOWLEDGE_LINKER_MANIFEST } from "@/services/agent-apps/apps/knowledge-linker"

// In startHarness():
const runtime = new AgentAppRuntime()
runtime.registerApp(DEEP_RESEARCHER_MANIFEST, createDeepResearcher())
runtime.registerApp(BRAINSTORM_PARTNER_MANIFEST, createBrainstormPartner())
runtime.registerApp(KNOWLEDGE_LINKER_MANIFEST, createKnowledgeLinker())

await runtime.start(this.workspaceId, [
  DEEP_RESEARCHER_MANIFEST,
  BRAINSTORM_PARTNER_MANIFEST,
  KNOWLEDGE_LINKER_MANIFEST,
], {
  providerId: this.workspace.agentConfig.providerId,
  providerType: /* resolve from provider store */,
  modelId: this.workspace.agentConfig.modelId,
  workspaceRoot,
})
```

- [ ] **Step 3: Expose apps as tool definitions in the agentic loop**

Add tool definitions for the three apps so the workspace agent's LLM can invoke them:

```typescript
const appToolDefs: ToolDefinition[] = [
  {
    name: "deep_research",
    description: "Multi-step research on any topic. Fetches sources, reads content, synthesizes a structured report.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "The topic to research" } },
      required: ["topic"],
    },
  },
  {
    name: "brainstorm",
    description: "Opens an interactive brainstorm pane for creative thinking on a problem.",
    parameters: {
      type: "object",
      properties: { problem: { type: "string", description: "The problem or question to brainstorm" } },
      required: ["problem"],
    },
  },
  {
    name: "query_knowledge",
    description: "Search the workspace knowledge base for information.",
    parameters: {
      type: "object",
      properties: { question: { type: "string", description: "The question to answer from indexed knowledge" } },
      required: ["question"],
    },
  },
]
```

Wire these into `extraExecutors` with dispatch calls to the runtime.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `pnpm vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/agents/workspace-agent.ts src/stores/agent-apps.ts
git commit -m "feat: wire AI-powered agent apps into workspace agent"
```

---

### Task 13: End-to-End Smoke Test

- [ ] **Step 1: Start the app**

Run: `pnpm tauri dev`

- [ ] **Step 2: Verify Knowledge Linker auto-indexes**

1. Create a workspace with a linked repo
2. Write a markdown file
3. Check `~/.mindeck/workspaces/<id>/apps/native.knowledge-linker/store.json` — should contain an index entry

- [ ] **Step 3: Verify Deep Researcher**

1. In workspace chat, type "Research the differences between WebSocket and Server-Sent Events"
2. Workspace agent should invoke `deep_research` tool
3. Result should appear in chat as a structured research report

- [ ] **Step 4: Verify Brainstorm Partner**

1. Type "Brainstorm ideas for a new feature"
2. A new pane should open with the brainstorm chat
3. Interactive dialogue should work
4. On pane close, summary should return to workspace chat

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address smoke test issues"
```
