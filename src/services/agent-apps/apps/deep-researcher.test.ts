import { describe, it, expect, vi, beforeEach } from "vitest"
import type { LLMClient, ToolClient, StorageClient, AppContext } from "@/types"
import { DEEP_RESEARCHER_MANIFEST, createDeepResearcher } from "./deep-researcher"

// ─── Mock Helpers ─────────────────────────────────────────────

function createMockLLM(responses: string[]): LLMClient {
  let callIndex = 0
  return {
    chat() {
      const text = responses[callIndex] ?? ""
      callIndex++
      return (async function* () {
        // Yield text in two chunks to exercise the accumulation logic
        const mid = Math.floor(text.length / 2)
        yield { type: "text" as const, content: text.slice(0, mid) }
        yield { type: "text" as const, content: text.slice(mid) }
      })()
    },
  }
}

function createMockTools(results: Map<string, unknown> = new Map()): ToolClient {
  return {
    call: vi.fn(async (name: string, args: Record<string, unknown>) => {
      const key = String(args.url ?? name)
      const value = results.has(key) ? String(results.get(key)) : `Content from ${key}`
      return { ok: true, result: value }
    }),
  }
}

function createMockStorage(): StorageClient & {
  store: Map<string, unknown>
} {
  const store = new Map<string, unknown>()
  return {
    store,
    get: async <T>(key: string): Promise<T | null> => (store.get(key) as T) ?? null,
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value)
    }),
    list: vi.fn(async () => [...store.keys()]),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    query: vi.fn(async () => Object.fromEntries(store)),
  }
}

function createMockContext(overrides?: {
  llm?: LLMClient
  tools?: ToolClient
  storage?: StorageClient
}): AppContext & { storage: ReturnType<typeof createMockStorage> } {
  const storage =
    (overrides?.storage as ReturnType<typeof createMockStorage>) ?? createMockStorage()
  return {
    llm:
      overrides?.llm ??
      createMockLLM([
        JSON.stringify([
          { url: "https://example.com/article" },
          { url: "https://example.com/paper" },
        ]),
        JSON.stringify({
          summary: "Test summary about the topic.",
          keyFindings: ["Finding 1", "Finding 2"],
          openQuestions: ["Question 1"],
        }),
      ]),
    tools: overrides?.tools ?? createMockTools(),
    storage,
    workspaceId: "test-workspace",
    appId: "native.deep-researcher",
    workspaceRoot: "/tmp/test",
  }
}

// ─── Tests ────────────────────────────────────────────────────

describe("DEEP_RESEARCHER_MANIFEST", () => {
  it("has correct id", () => {
    expect(DEEP_RESEARCHER_MANIFEST.id).toBe("native.deep-researcher")
  })

  it("has correct runtimeCapabilities", () => {
    expect(DEEP_RESEARCHER_MANIFEST.runtimeCapabilities).toEqual({
      llm: true,
      tools: ["web_fetch", "read_file"],
      channel: true,
      storage: { scope: "workspace" },
    })
  })

  it("has correct lifecycle", () => {
    expect(DEEP_RESEARCHER_MANIFEST.lifecycle).toEqual({
      startup: "lazy",
      persistence: "session",
    })
  })

  it("has kind native", () => {
    expect(DEEP_RESEARCHER_MANIFEST.kind).toBe("native")
  })

  it("accepts tasks", () => {
    expect(DEEP_RESEARCHER_MANIFEST.capabilities.acceptsTasks).toBe(true)
  })
})

describe("createDeepResearcher", () => {
  let app: ReturnType<typeof createDeepResearcher>

  beforeEach(() => {
    app = createDeepResearcher()
  })

  it("exposes the manifest", () => {
    expect(app.manifest).toBe(DEEP_RESEARCHER_MANIFEST)
  })

  it("throws if handleDispatch called before activate", async () => {
    await expect(app.handleDispatch!({ topic: "test" })).rejects.toThrow("not activated")
  })

  it("throws if topic is missing", async () => {
    const ctx = createMockContext()
    app.activate(ctx)

    await expect(app.handleDispatch!({})).rejects.toThrow("topic")
  })

  it("returns ResearchResult with correct topic", async () => {
    const ctx = createMockContext()
    app.activate(ctx)

    const result = (await app.handleDispatch!({ topic: "quantum computing" })) as {
      topic: string
      summary: string
      keyFindings: string[]
      sources: { title: string; snippet: string }[]
      openQuestions: string[]
      timestamp: string
    }

    expect(result.topic).toBe("quantum computing")
    expect(result.summary).toBe("Test summary about the topic.")
    expect(result.keyFindings).toEqual(["Finding 1", "Finding 2"])
    expect(result.openQuestions).toEqual(["Question 1"])
    expect(result.sources).toHaveLength(2)
    expect(result.timestamp).toBeTruthy()
  })

  it("calls storage.set to persist result", async () => {
    const ctx = createMockContext()
    app.activate(ctx)

    const result = (await app.handleDispatch!({ topic: "AI safety" })) as {
      timestamp: string
    }

    expect(ctx.storage.set).toHaveBeenCalledWith(
      `research:${result.timestamp}`,
      expect.objectContaining({ topic: "AI safety" })
    )
    expect(ctx.storage.store.size).toBe(1)
  })

  it("handles failed web_fetch gracefully — skips, does not crash", async () => {
    const failingTools: ToolClient = {
      call: vi.fn(async () => {
        throw new Error("Network error")
      }),
    }

    const ctx = createMockContext({ tools: failingTools })
    app.activate(ctx)

    const result = (await app.handleDispatch!({ topic: "test topic" })) as {
      sources: unknown[]
      summary: string
    }

    // Should succeed despite all fetches failing
    expect(result.sources).toEqual([])
    expect(result.summary).toBeTruthy()
  })

  it("handles non-JSON LLM output gracefully for plan", async () => {
    const badLLM = createMockLLM([
      "I cannot produce JSON, here is my analysis instead...",
      JSON.stringify({
        summary: "Fallback synthesis.",
        keyFindings: ["One finding"],
        openQuestions: [],
      }),
    ])

    const ctx = createMockContext({ llm: badLLM })
    app.activate(ctx)

    const result = (await app.handleDispatch!({ topic: "test" })) as {
      sources: unknown[]
      summary: string
    }

    // Plan parsing fails gracefully — no sources fetched, but synthesis still works
    expect(result.sources).toEqual([])
    expect(result.summary).toBe("Fallback synthesis.")
  })

  it("handles non-JSON LLM output gracefully for synthesis", async () => {
    const badSynthesisLLM = createMockLLM([
      JSON.stringify([{ url: "https://example.com" }]),
      "This is not JSON at all, just a plain text summary.",
    ])

    const ctx = createMockContext({ llm: badSynthesisLLM })
    app.activate(ctx)

    const result = (await app.handleDispatch!({ topic: "test" })) as {
      summary: string
      keyFindings: string[]
    }

    // Falls back to using raw text as summary
    expect(result.summary).toBe("This is not JSON at all, just a plain text summary.")
    expect(result.keyFindings).toEqual([])
  })

  it("limits plan to 5 sources maximum", async () => {
    const manyUrls = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/${i}`,
    }))
    const llm = createMockLLM([
      JSON.stringify(manyUrls),
      JSON.stringify({
        summary: "Summary",
        keyFindings: [],
        openQuestions: [],
      }),
    ])

    const mockTools = createMockTools()
    const ctx = createMockContext({ llm, tools: mockTools })
    app.activate(ctx)

    await app.handleDispatch!({ topic: "test" })

    // web_fetch should be called at most 5 times
    expect(vi.mocked(mockTools.call).mock.calls.length).toBeLessThanOrEqual(5)
  })

  it("truncates long snippets to 1000 characters", async () => {
    const longContent = "x".repeat(2000)
    const toolResults = new Map<string, unknown>([
      ["https://example.com/long", longContent],
    ])

    const llm = createMockLLM([
      JSON.stringify([{ url: "https://example.com/long" }]),
      JSON.stringify({
        summary: "Summary",
        keyFindings: [],
        openQuestions: [],
      }),
    ])

    const ctx = createMockContext({
      llm,
      tools: createMockTools(toolResults),
    })
    app.activate(ctx)

    const result = (await app.handleDispatch!({ topic: "test" })) as {
      sources: { snippet: string }[]
    }

    expect(result.sources[0].snippet.length).toBeLessThanOrEqual(1003) // 1000 + "..."
    expect(result.sources[0].snippet.endsWith("...")).toBe(true)
  })

  it("cleans up references on deactivate", async () => {
    const ctx = createMockContext()
    app.activate(ctx)
    app.deactivate!()

    await expect(app.handleDispatch!({ topic: "test" })).rejects.toThrow("not activated")
  })
})
