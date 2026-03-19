import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  createKnowledgeLinker,
  KNOWLEDGE_LINKER_MANIFEST,
  simpleHash,
} from "./knowledge-linker"
import type {
  AppContext,
  LLMClient,
  ToolClient,
  StorageClient,
  HarnessTrigger,
} from "@/types"

// ─── Helpers ──────────────────────────────────────────────

function createMockStorage(): StorageClient & {
  _store: Map<string, unknown>
} {
  const store = new Map<string, unknown>()
  return {
    _store: store,
    get: async <T>(key: string): Promise<T | null> => (store.get(key) as T) ?? null,
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value)
    }),
    list: vi.fn(async () => [...store.keys()]),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    query: vi.fn(
      async (opts: { keyPrefix: string }): Promise<Record<string, unknown>> => {
        const result: Record<string, unknown> = {}
        for (const [key, value] of store) {
          if (key.startsWith(opts.keyPrefix)) {
            result[key] = value
          }
        }
        return result
      }
    ),
  }
}

function createMockLLM(response: string): LLMClient {
  return {
    chat: vi.fn(async function* () {
      yield { type: "text" as const, content: response }
    }),
  }
}

function createMockTools(fileContents: Record<string, string>): ToolClient {
  return {
    call: vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const path = args.path as string
      if (path in fileContents) return { ok: true, result: fileContents[path] }
      throw new Error(`File not found: ${path}`)
    }),
  }
}

const FILE_WRITTEN: HarnessTrigger = { event: "file_written" }

function createMockContext(overrides?: {
  llm?: LLMClient
  tools?: ToolClient
  storage?: StorageClient
}): AppContext {
  return {
    appId: "native.knowledge-linker",
    workspaceId: "test-workspace",
    workspaceRoot: "/tmp/test",
    llm: overrides?.llm ?? createMockLLM("{}"),
    tools: overrides?.tools ?? createMockTools({}),
    storage: overrides?.storage ?? createMockStorage(),
    channel: {
      send: vi.fn(),
      onMessage: vi.fn(),
      request: vi.fn(),
      onRequest: vi.fn(),
      close: vi.fn(),
    },
  }
}

// ─── Tests ────────────────────────────────────────────────

describe("Knowledge Linker", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("manifest", () => {
    it("has correct lifecycle and trigger configuration", () => {
      expect(KNOWLEDGE_LINKER_MANIFEST.lifecycle.startup).toBe("eager")
      expect(KNOWLEDGE_LINKER_MANIFEST.lifecycle.persistence).toBe("workspace")
      expect(KNOWLEDGE_LINKER_MANIFEST.harness).toBeDefined()
      expect(KNOWLEDGE_LINKER_MANIFEST.harness!.triggers).toHaveLength(1)
      expect(KNOWLEDGE_LINKER_MANIFEST.harness!.triggers[0].event).toBe("file_written")
      expect(KNOWLEDGE_LINKER_MANIFEST.harness!.triggers[0].pattern).toBe(
        "**/*.{md,txt,json,ts,tsx,py,rs}"
      )
      expect(KNOWLEDGE_LINKER_MANIFEST.harness!.feedbackToAgent).toBe(false)
      expect(KNOWLEDGE_LINKER_MANIFEST.kind).toBe("native")
      expect(KNOWLEDGE_LINKER_MANIFEST.id).toBe("native.knowledge-linker")
      expect(KNOWLEDGE_LINKER_MANIFEST.capabilities.acceptsTasks).toBe(true)
    })
  })

  describe("simpleHash", () => {
    it("returns consistent hashes for the same input", () => {
      expect(simpleHash("hello")).toBe(simpleHash("hello"))
    })

    it("returns different hashes for different inputs", () => {
      expect(simpleHash("hello")).not.toBe(simpleHash("world"))
    })

    it("returns a base-36 string", () => {
      const hash = simpleHash("test content")
      expect(/^-?[0-9a-z]+$/.test(hash)).toBe(true)
    })
  })

  describe("handleTrigger", () => {
    it("indexes a file and stores a KnowledgeEntry", async () => {
      const llmResponse = JSON.stringify({
        summary: "A test file about widgets",
        concepts: ["widgets", "testing"],
        tags: ["test"],
        entities: ["WidgetFactory"],
        relations: [{ target: "utils.ts", type: "imports" }],
      })

      const storage = createMockStorage()
      const tools = createMockTools({ "src/widget.ts": "export class WidgetFactory {}" })
      const llm = createMockLLM(llmResponse)
      const ctx = createMockContext({ llm, tools, storage })

      const app = createKnowledgeLinker()
      await app.activate(ctx)

      await app.handleTrigger!(FILE_WRITTEN, { filePath: "src/widget.ts" })

      // Advance past debounce
      vi.advanceTimersByTime(500)
      // Flush microtasks for the async processBatch
      await vi.runAllTimersAsync()

      expect(tools.call).toHaveBeenCalledWith("read_file", { path: "src/widget.ts" })
      expect(llm.chat).toHaveBeenCalled()

      const stored = storage._store.get("index:src/widget.ts") as Record<string, unknown>
      expect(stored).toBeDefined()
      expect(stored.filePath).toBe("src/widget.ts")
      expect(stored.summary).toBe("A test file about widgets")
      expect(stored.concepts).toEqual(["widgets", "testing"])
      expect(stored.contentHash).toBe(simpleHash("export class WidgetFactory {}"))

      await app.deactivate!()
    })

    it("skips unchanged files with the same content hash", async () => {
      const fileContent = "export const x = 1"
      const contentHash = simpleHash(fileContent)
      const storage = createMockStorage()

      // Pre-populate storage with an existing entry for the same hash
      storage._store.set("index:src/x.ts", {
        filePath: "src/x.ts",
        summary: "existing",
        concepts: [],
        tags: [],
        entities: [],
        lastIndexed: "2026-01-01T00:00:00.000Z",
        contentHash,
      })

      const tools = createMockTools({ "src/x.ts": fileContent })
      const llm = createMockLLM("{}")
      const ctx = createMockContext({ llm, tools, storage })

      const app = createKnowledgeLinker()
      await app.activate(ctx)

      await app.handleTrigger!(FILE_WRITTEN, { filePath: "src/x.ts" })
      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      // File was read to compute hash, but LLM should NOT have been called
      expect(tools.call).toHaveBeenCalledWith("read_file", { path: "src/x.ts" })
      expect(llm.chat).not.toHaveBeenCalled()

      // Storage entry should remain unchanged (summary still "existing")
      const stored = storage._store.get("index:src/x.ts") as Record<string, unknown>
      expect(stored.summary).toBe("existing")

      await app.deactivate!()
    })

    it("debounces rapid triggers into a single batch", async () => {
      const llmResponse = JSON.stringify({
        summary: "file",
        concepts: [],
        tags: [],
        entities: [],
      })
      const storage = createMockStorage()
      const tools = createMockTools({
        "a.ts": "const a = 1",
        "b.ts": "const b = 2",
        "c.ts": "const c = 3",
      })
      const llm = createMockLLM(llmResponse)
      const ctx = createMockContext({ llm, tools, storage })

      const app = createKnowledgeLinker()
      await app.activate(ctx)

      // Fire three triggers in rapid succession
      await app.handleTrigger!(FILE_WRITTEN, { filePath: "a.ts" })
      vi.advanceTimersByTime(100) // Not yet 500ms
      await app.handleTrigger!(FILE_WRITTEN, { filePath: "b.ts" })
      vi.advanceTimersByTime(100) // Still not 500ms from last trigger
      await app.handleTrigger!(FILE_WRITTEN, { filePath: "c.ts" })

      // At this point, no processing should have happened
      expect(tools.call).not.toHaveBeenCalled()

      // Advance past debounce
      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      // All three files should be processed in one batch
      expect(tools.call).toHaveBeenCalledTimes(3)
      expect(storage._store.has("index:a.ts")).toBe(true)
      expect(storage._store.has("index:b.ts")).toBe(true)
      expect(storage._store.has("index:c.ts")).toBe(true)

      await app.deactivate!()
    })

    it("deduplicates paths within a debounce window", async () => {
      const llmResponse = JSON.stringify({
        summary: "file",
        concepts: [],
        tags: [],
        entities: [],
      })
      const storage = createMockStorage()
      const tools = createMockTools({ "a.ts": "const a = 1" })
      const llm = createMockLLM(llmResponse)
      const ctx = createMockContext({ llm, tools, storage })

      const app = createKnowledgeLinker()
      await app.activate(ctx)

      // Same file triggered twice
      await app.handleTrigger!(FILE_WRITTEN, { filePath: "a.ts" })
      await app.handleTrigger!(FILE_WRITTEN, { filePath: "a.ts" })

      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      // Should only process once (Set deduplication)
      expect(tools.call).toHaveBeenCalledTimes(1)

      await app.deactivate!()
    })
  })

  describe("handleDispatch", () => {
    it("queries the index and returns relevant results", async () => {
      const queryResponse = JSON.stringify([
        { filePath: "src/auth.ts", relevance: 0.95, snippet: "Authentication module" },
        { filePath: "src/login.ts", relevance: 0.8, snippet: "Login form handler" },
      ])

      const storage = createMockStorage()
      storage._store.set("index:src/auth.ts", {
        filePath: "src/auth.ts",
        summary: "Authentication module",
        concepts: ["auth", "security"],
        tags: ["core"],
        entities: ["AuthService"],
        lastIndexed: "2026-01-01T00:00:00.000Z",
        contentHash: "abc",
      })
      storage._store.set("index:src/login.ts", {
        filePath: "src/login.ts",
        summary: "Login form handler",
        concepts: ["auth", "ui"],
        tags: ["frontend"],
        entities: ["LoginForm"],
        lastIndexed: "2026-01-01T00:00:00.000Z",
        contentHash: "def",
      })

      const llm = createMockLLM(queryResponse)
      const ctx = createMockContext({ llm, storage })

      const app = createKnowledgeLinker()
      await app.activate(ctx)

      const result = (await app.handleDispatch!({
        question: "How does authentication work?",
      })) as {
        question: string
        snippets: Array<{ filePath: string; relevance: number; snippet: string }>
        totalIndexed: number
      }

      expect(result).toBeDefined()
      expect(result.question).toBe("How does authentication work?")
      expect(result.totalIndexed).toBe(2)
      expect(result.snippets).toHaveLength(2)
      expect(result.snippets[0].filePath).toBe("src/auth.ts")
      expect(result.snippets[0].relevance).toBe(0.95)
      expect(llm.chat).toHaveBeenCalled()

      await app.deactivate!()
    })

    it("returns empty snippets when no entries are indexed", async () => {
      const storage = createMockStorage()
      const ctx = createMockContext({ storage })

      const app = createKnowledgeLinker()
      await app.activate(ctx)

      const result = (await app.handleDispatch!({ question: "anything" })) as {
        question: string
        snippets: unknown[]
        totalIndexed: number
      }

      expect(result.snippets).toEqual([])
      expect(result.totalIndexed).toBe(0)

      await app.deactivate!()
    })

    it("returns null for missing question", async () => {
      const ctx = createMockContext()
      const app = createKnowledgeLinker()
      await app.activate(ctx)

      const result = await app.handleDispatch!({})
      expect(result).toBeNull()

      await app.deactivate!()
    })
  })

  describe("deactivate", () => {
    it("clears pending timers on deactivate", async () => {
      const storage = createMockStorage()
      const tools = createMockTools({ "a.ts": "content" })
      const llm = createMockLLM("{}")
      const ctx = createMockContext({ llm, tools, storage })

      const app = createKnowledgeLinker()
      await app.activate(ctx)

      // Trigger a file but don't let debounce fire
      await app.handleTrigger!(FILE_WRITTEN, { filePath: "a.ts" })

      // Deactivate before debounce fires
      await app.deactivate!()

      // Advance time past debounce — should not process
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(tools.call).not.toHaveBeenCalled()
    })
  })
})
