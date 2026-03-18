# AI-Powered Agent Apps with Unified Runtime

> **Date:** 2026-03-18
> **Status:** Draft
> **Scope:** Unified Agent App Runtime + 3 AI-powered native apps (Deep Researcher, Brainstorm Partner, Knowledge Linker)

---

## 1. Problem Statement

Current native Agent Apps (ESLint, TSC, TestRunner) are shell command wrappers — they run a bash command, return a truncated string, and inject it into the workspace agent's conversation. They have no LLM access, no tool access, no persistent state, and no direct user interaction. This limits Agent Apps to simple linting/testing checks.

We want Agent Apps to be **first-class autonomous agents** — capable of thinking (LLM), acting (tools), communicating (channels), and interacting with users (panes). The architecture must support both simple shell-based apps and sophisticated AI-powered apps through a unified system.

---

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Trigger model | Hybrid | Researcher & Brainstorm are on-demand. Knowledge Linker auto-triggers on file writes. |
| App execution model | Standalone agents | Each app gets its own agentic loop, not a tool wrapper. |
| Communication | Bidirectional channels with correlation | Dispatch (request/response) for tasks. Stream for real-time updates. |
| Real-time interaction | Dual mode | Dispatch channel for background work. Direct pane for interactive sessions. |
| Knowledge Linker scope | Index + semantic search (v1) | Schema designed for future knowledge graph extension. |
| Runtime model | Unified, capability-based DI | One runtime. Apps declare what they need, runtime injects it. No mode flags. |

---

## 3. Unified Agent App Runtime

### 3.1 Capability Registry

Apps declare their needs in the manifest. The runtime provisions only what's declared.

> **Note:** The existing `AgentAppManifest.capabilities` field has a different shape (`{ tools?: ToolDefinition[], ui?, acceptsTasks? }`). The new runtime capabilities use a separate field `runtimeCapabilities` to avoid conflicts. The existing `capabilities` field continues to describe what the app *exposes* (tools, UI). The new `runtimeCapabilities` field describes what the app *needs* from the runtime.

```typescript
// Added to AgentAppManifest as a NEW field (not replacing existing `capabilities`)
interface RuntimeCapabilities {
  shell?: boolean                    // bash execution
  llm?: boolean                      // LLM access (provider bridge)
  tools?: string[]                   // built-in tool access by name
  channel?: boolean                  // bidirectional channel to workspace agent
  pane?: boolean                     // direct user interaction pane
  storage?: {                        // persistent key-value storage
    scope: "workspace" | "global"
  }
}
```

### 3.2 Injected Context

The runtime reads capabilities and constructs an `AppContext` — a dependency-injected bag:

```typescript
interface AppContext {
  // Always provided
  appId: string
  workspaceId: string
  workspaceRoot: string

  // Injected based on capabilities
  shell?: ShellClient           // { exec(cmd, cwd?): Promise<ShellResult> }
  llm?: LLMClient               // { chat(messages, tools?): AsyncIterable<LLMChunk> }
  tools?: ToolClient             // { call(name, args): Promise<ToolResult> }
  channel?: AppChannel           // bidirectional communication
  pane?: PaneClient              // direct user interaction
  storage?: StorageClient        // { get, set, list, delete, query }
}
```

### 3.3 App Interface

Every app implements the same interface:

```typescript
interface AgentApp {
  manifest: AgentAppManifest
  activate(ctx: AppContext): Promise<void>
  deactivate?(): Promise<void>
  handleDispatch?(task: DispatchMessage): Promise<DispatchResult>
  handleTrigger?(event: HarnessTrigger, payload: TriggerPayload): Promise<void>
}

// Payload varies by trigger type
interface TriggerPayload {
  filePath?: string          // for file_written triggers
  toolName?: string          // for tool_completed triggers
  toolResult?: string        // for tool_completed triggers
  taskId?: string            // for task_completed triggers
}
```

The `handleTrigger` method is called by the runtime when a harness trigger matches. This is how Knowledge Linker receives `file_written` events and auto-indexes. Apps without triggers simply omit this method.

### 3.4 Capability Clients

**ShellClient** — wraps `bash_exec` Tauri command:

```typescript
interface ShellClient {
  exec(command: string, cwd?: string): Promise<ShellResult>
}

interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
}
```

**LLMClient** — wraps provider bridge `streamChat`:

```typescript
interface LLMClient {
  chat(messages: LLMMessage[], tools?: ToolDefinition[], signal?: AbortSignal): AsyncIterable<LLMChunk>
}

interface LLMChunk {
  type: "text" | "tool_call_start" | "tool_call_args" | "tool_call_end"
  content?: string
  toolCall?: { id: string; name: string; arguments: string }
}
```

> **Implementation note:** `LLMChunk` is a facade over the existing `ExtendedChatChunk` from `bridge.ts`. The `LLMClient` adapter maps between the two formats — the bridge wire format is not changed.

The LLMClient uses the workspace's configured provider and model. Apps don't choose their own model — the workspace agent's config determines it.

**ToolClient** — wraps built-in tool executors:

```typescript
interface ToolClient {
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>
}

interface ToolResult {
  ok: boolean
  result: string
}
```

Only tools listed in the manifest's `capabilities.tools[]` are accessible. Calling an undeclared tool throws.

---

## 4. Communication Protocol

### 4.1 AppChannel

Bidirectional, point-to-point communication between an app and the workspace agent.

```typescript
interface AppChannel {
  // Dispatch mode — request/response with correlation
  request(msg: ChannelMessage, signal?: AbortSignal): Promise<ChannelMessage>
  onRequest(handler: (msg: ChannelMessage) => Promise<ChannelMessage>): void

  // Stream mode — real-time fire-and-forget
  send(msg: ChannelMessage): void
  onMessage(handler: (msg: ChannelMessage) => void): void

  // Lifecycle
  close(): void
}

interface ChannelMessage {
  id: string                    // UUID, auto-generated on send
  type: "dispatch" | "result" | "query" | "update" | "chunk" | "error"
  from: string                  // appId or "workspace-agent"
  payload: unknown
  replyTo?: string              // correlates to original message ID
}
```

### 4.2 Communication Patterns

**Dispatch (request/response):**
- Agent → App: "Research this topic" → App processes → returns result
- Correlation via `replyTo` field matching original message `id`
- Workspace agent awaits the response (Promise-based)

**Stream (real-time):**
- App → Agent: Progress updates, status changes, silent index notifications
- Fire-and-forget via `send()`, no response expected
- Agent can listen via `onMessage()` for UI updates

**Direct Pane (user interaction):**
- App opens pane via `PaneClient`, gets a direct chat with user
- The dispatch `Promise` stays pending until pane closes — but the workspace agent's input queue is **not blocked**. The dispatch runs as an async background task, so the user can still send messages to the workspace chat while a brainstorm pane is open. The workspace agent processes its queue normally; only the dispatch slot for this app is occupied.
- On pane close, app returns structured result via channel, resolving the dispatch Promise

### 4.3 Concrete Flows

**Deep Researcher:**
```
Agent → channel.request({ type: "dispatch", payload: { topic: "..." } })
  Researcher: web_fetch → read sources → LLM synthesize → LLM structure
Researcher → channel response({ type: "result", payload: ResearchResult })
```

**Brainstorm Partner:**
```
Agent → channel.request({ type: "dispatch", payload: { problem: "..." } })
  Partner: pane.open() → multi-turn dialogue with user → pane.close()
Partner → channel response({ type: "result", payload: BrainstormResult })
```

**Knowledge Linker (auto-index):**
```
Harness trigger (file_written) → runtime → Linker
  Linker: read_file → check hash → LLM extract → storage.set()
  Linker → channel.send({ type: "update", payload: { indexed: "file.md" } })
```

**Knowledge Linker (query):**
```
Agent → channel.request({ type: "query", payload: { question: "..." } })
  Linker: scan index → LLM re-rank → build response
Linker → channel response({ type: "result", payload: { snippets, relevance } })
```

---

## 5. PaneClient

Direct user interaction for interactive apps (Brainstorm Partner and future interactive apps).

```typescript
interface PaneClient {
  open(options?: { title?: string; icon?: string }): void
  close(): void

  sendChunk(text: string): void
  sendMessage(message: PaneMessage): void

  onUserMessage(handler: (text: string) => void): void
  onClose(handler: () => void): void
  isOpen(): boolean
}

interface PaneMessage {
  role: "assistant" | "system"
  content: string
  metadata?: Record<string, unknown>
}
```

**Lifecycle:**
1. App calls `pane.open()` → runtime creates a pane in workspace's `FlexibleWorkspace`
2. Pane renders `AppPaneChat` component — simplified chat UI (message list + input, no model selector or skill chips)
3. User types → `onUserMessage` fires in app → app streams response via `sendChunk()`
4. User closes pane or app calls `pane.close()` → `onClose` handler fires → app returns summary

**Pane vs workspace chat:**

| Aspect | Workspace Chat | App Pane |
|--------|---------------|----------|
| Agent | Workspace agent (full tools) | Single app (scoped capabilities) |
| Persistence | JSONL conversation | Ephemeral, summary saved on close |
| Scope | General purpose | Focused on one task |
| Lifecycle | Permanent | Created on dispatch, destroyed on close |

> **Pane persistence:** App panes are **excluded from layout persistence**. If the user closes Mindeck mid-brainstorm, the pane is gone on reopen. The app's `deactivate()` handler saves any in-progress state to `storage` for potential recovery, but the pane itself is ephemeral.

---

## 6. StorageClient

Scoped persistent key-value storage per app.

```typescript
interface StorageClient {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  list(): Promise<string[]>
  delete(key: string): Promise<void>
  query(filter: StorageFilter): Promise<Record<string, unknown>>
}

// Structured filter — serializable, no function predicates
interface StorageFilter {
  keyPrefix?: string           // match keys starting with prefix
  tags?: string[]              // match entries containing any of these tags
  since?: string               // entries indexed after this ISO timestamp
}
```

**File layout:**

```
# Workspace-scoped storage
~/.mindeck/workspaces/<workspaceId>/apps/<appId>/store.json

# Global-scoped storage
~/.mindeck/apps/<appId>/store.json
```

Implementation: JSON file read/write via existing Tauri commands. Write queue for concurrent access safety.

---

## 7. The Three Apps

### 7.1 Deep Researcher

**Manifest:**
```typescript
{
  id: "native.deep-researcher",
  name: "Deep Researcher",
  kind: "native",
  description: "Multi-step research on any topic. Fetches sources, reads content, synthesizes structured reports.",
  runtimeCapabilities: { llm: true, tools: ["web_fetch", "read_file"], channel: true, storage: { scope: "workspace" } },
  lifecycle: { startup: "lazy", persistence: "session" },
  harness: null
}
```

> **Note:** `web_fetch` is an existing built-in tool in `builtins.ts`. It fetches URL content and requires user permission confirmation, which the runtime surfaces via the existing permission request UI.

**Flow:**
1. Receive dispatch with topic/question
2. LLM generates research plan (angles, sources to check)
3. Execute plan — `web_fetch` for external, `read_file` for local docs
4. LLM synthesizes into structured report
5. Store in `storage` for future reference
6. Return via channel

**Output:**
```typescript
interface ResearchResult {
  topic: string
  summary: string
  keyFindings: string[]
  sources: { title: string; url?: string; path?: string; snippet: string }[]
  openQuestions: string[]
  timestamp: string
}
```

### 7.2 Brainstorm Partner

**Manifest:**
```typescript
{
  id: "native.brainstorm-partner",
  name: "Brainstorm Partner",
  kind: "native",
  description: "Interactive thinking partner using structured frameworks. Opens a dedicated pane for multi-turn dialogue.",
  runtimeCapabilities: { llm: true, channel: true, pane: true, storage: { scope: "workspace" } },
  lifecycle: { startup: "lazy", persistence: "session" },
  harness: null
}
```

**Flow:**
1. Receive dispatch with problem/question
2. Open pane via `PaneClient`
3. LLM selects thinking framework (Six Thinking Hats, First Principles, SCAMPER, Devil's Advocate)
4. Multi-turn dialogue with user in pane
5. On close: generate summary, store in storage, return to workspace agent

**Output:**
```typescript
interface BrainstormResult {
  problem: string
  framework: string
  perspectives: { angle: string; ideas: string[] }[]
  topIdeas: { idea: string; pros: string[]; cons: string[] }[]
  nextSteps: string[]
  sessionDuration: number
}
```

### 7.3 Knowledge Linker

**Manifest:**
```typescript
{
  id: "native.knowledge-linker",
  name: "Knowledge Linker",
  kind: "native",
  description: "Auto-indexes workspace files into a searchable knowledge base with LLM-powered extraction.",
  runtimeCapabilities: { llm: true, tools: ["read_file", "list_dir"], channel: true, storage: { scope: "workspace" } },
  lifecycle: { startup: "eager", persistence: "workspace" },
  harness: {
    triggers: [{ event: "file_written", pattern: "**/*.{md,txt,json,ts,tsx,py,rs}" }],
    feedbackToAgent: false
  }
}
```

**Auto-index flow:**
1. File write triggers harness → `handleTrigger()` called
2. Trigger is **debounced** (500ms) and **batched** — rapid file writes (e.g., `git checkout`) are coalesced into a single indexing pass
3. For each file in batch: read file, compute content hash
4. Skip if hash matches existing entry (unchanged file)
5. LLM extracts: summary, concepts, tags, entities
6. Store `KnowledgeEntry` in storage

**Concurrency:** Indexing and query dispatches are handled by a serial queue inside the Linker. A query arriving mid-index waits for the current index batch to finish (queries search the latest committed state, not in-flight work).

**Query flow:**
1. Workspace agent dispatches query
2. Linker searches index — keyword match + LLM re-ranking
3. Return ranked snippets with file paths and relevance

**Index schema:**
```typescript
interface KnowledgeEntry {
  filePath: string
  summary: string
  concepts: string[]
  tags: string[]
  entities: string[]
  relations?: { target: string; type: string }[]  // future: graph edges
  lastIndexed: string
  contentHash: string
}
```

---

## 8. Integration with Existing Architecture

### 8.1 New Files

| File | Est. Lines | Purpose |
|------|-----------|---------|
| `services/agent-apps/runtime.ts` | ~300 | App lifecycle, DI, channel management |
| `services/agent-apps/channel.ts` | ~150 | AppChannel implementation |
| `services/agent-apps/context-factory.ts` | ~200 | Build AppContext from capabilities |
| `services/agent-apps/storage-client.ts` | ~100 | Scoped JSON file storage |
| `services/agent-apps/pane-client.ts` | ~120 | Pane lifecycle + messaging bridge |
| `services/agent-apps/apps/deep-researcher.ts` | ~250 | Research agent logic |
| `services/agent-apps/apps/brainstorm-partner.ts` | ~250 | Brainstorm agent logic |
| `services/agent-apps/apps/knowledge-linker.ts` | ~300 | Indexer + query agent logic |
| `components/workspace/AppPaneChat.tsx` | ~150 | Lightweight chat UI for app panes |

### 8.2 Modified Files

| File | Change |
|------|--------|
| `services/agents/workspace-agent.ts` | Replace direct harness wiring with runtime startup. Expose apps as tool definitions in agentic loop. |
| `services/native-apps/runner.ts` | Becomes thin ShellClient adapter. |
| `services/harness/harness-engine.ts` | Route triggers through runtime instead of calling runner directly. |
| `types/index.ts` | Add `runtimeCapabilities?: RuntimeCapabilities` to `AgentAppManifest`. Add all new interfaces (`AppContext`, `AppChannel`, client types, etc.) — per project convention, all shared types go in `types/index.ts`. |
| `stores/agent-apps.ts` | Track per-app health/status (`AppHealth`). |
| `components/workspace/PaneContent.tsx` | Render `AppPaneChat` for agent-app pane type. |

### 8.3 Startup Sequence

```
WorkspaceAgent.connect()
  → AgentAppRuntime.start(workspaceId, activatedApps)
     → For each app:
        manifest.capabilities → contextFactory.build(capabilities)
        app.activate(context)
     → Eager apps (Knowledge Linker): activate immediately
     → Lazy apps (Researcher, Brainstorm): activate on first dispatch
  → HarnessEngine routes triggers through runtime
```

### 8.4 Backward Compatibility

Existing shell-based apps get `capabilities: { shell: true }` added to manifests. Execution moves from direct `runner.ts` calls to `runtime → ShellClient → bash_exec`. Identical behavior, unified system.

---

## 9. Error Handling and Lifecycle

### 9.1 App States

```typescript
type AppStatus = "inactive" | "activating" | "active" | "error" | "deactivating"
```

### 9.2 Error Behavior

| Event | Behavior |
|-------|----------|
| `activate()` throws | Status → `"error"`. Agent continues without app. Error logged to audit. |
| LLM call fails mid-dispatch | App returns `{ type: "error", payload: { message, retryable } }`. Agent decides retry. |
| Pane crashes | `onClose` fires. Partial result returned if possible. |
| Dispatch timeout | Runtime enforces per-app timeout (default: 120s Researcher, 30s Linker query, none for Brainstorm pane). |
| Workspace disconnects | Runtime calls `deactivate()` on all apps. Channels closed. Storage flushed. |
| Token budget exceeded | Soft limit → warning. Hard limit → dispatch killed with error. |

### 9.3 Health Monitoring

```typescript
interface AppHealth {
  appId: string
  status: AppStatus
  lastDispatch?: { timestamp: string; success: boolean; durationMs: number }
  errorCount: number
  totalDispatches: number
}
```

Exposed in Agents panel as status badges. Apps in `"error"` state have their tool definition temporarily removed from the agentic loop.

### 9.4 Retry Policy

Runtime does not retry. Workspace agent decides — keeps retry logic in one place (the agentic loop).

### 9.5 Graceful Degradation

App in error → tool removed from agent loop → LLM won't attempt to use it → user can restart manually via Agents panel.

---

## 10. Out of Scope (Future)

| Feature | Status |
|---------|--------|
| Knowledge graph edges | Schema ready (`relations[]`), logic deferred |
| App-to-app communication | Apps only talk to workspace agent |
| App marketplace UI | Existing catalog sufficient |
| MCP app triggers via runtime | Stays in harness for now |
| Permission enforcement on capabilities | Trust manifest declarations |
| Proactive Knowledge Linker insights | Future evolution once index is solid |
