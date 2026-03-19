import { describe, expect, it, vi } from "vitest"
import {
  BRAINSTORM_PARTNER_MANIFEST,
  createBrainstormPartner,
} from "./brainstorm-partner"
import type { AppContext, LLMChunk, PaneClient } from "@/types"

// ─── Mock Factories ──────────────────────────────────────────

type UserMessageHandler = (text: string) => void
type CloseHandler = () => void

interface MockPane extends PaneClient {
  _simulateUserMessage: (text: string) => void
  _simulateClose: () => void
  _chunks: string[]
}

function createMockPane(): MockPane {
  let userMessageHandler: UserMessageHandler | undefined
  let closeHandler: CloseHandler | undefined
  let open = false

  return {
    _chunks: [] as string[],
    _simulateUserMessage(text: string) {
      userMessageHandler?.(text)
    },
    _simulateClose() {
      closeHandler?.()
    },
    open(_options?: { title?: string; icon?: string }) {
      open = true
    },
    close() {
      open = false
    },
    sendChunk(text: string) {
      this._chunks.push(text)
    },
    sendMessage() {
      // no-op for tests
    },
    onUserMessage(handler: UserMessageHandler) {
      userMessageHandler = handler
    },
    onClose(handler: CloseHandler) {
      closeHandler = handler
    },
    isOpen() {
      return open
    },
  }
}

async function* mockLLMStream(text: string): AsyncIterable<LLMChunk> {
  yield { type: "text", content: text }
}

function createMockLLM(responses: string[]) {
  let callIndex = 0
  return {
    client: {
      chat: vi.fn().mockImplementation(() => {
        const text = responses[callIndex] ?? "fallback"
        callIndex++
        return mockLLMStream(text)
      }),
    },
  }
}

function createMockStorage() {
  const store = new Map<string, unknown>()
  return {
    async get<T>(key: string): Promise<T | null> {
      return (store.get(key) as T) ?? null
    },
    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, value)
    },
    async list(): Promise<string[]> {
      return [...store.keys()]
    },
    async delete(key: string): Promise<void> {
      store.delete(key)
    },
    async query(): Promise<Record<string, unknown>> {
      return Object.fromEntries(store)
    },
  }
}

// ─── Tests ───────────────────────────────────────────────────

describe("BRAINSTORM_PARTNER_MANIFEST", () => {
  it("has correct id, kind, and version", () => {
    expect(BRAINSTORM_PARTNER_MANIFEST.id).toBe("native.brainstorm-partner")
    expect(BRAINSTORM_PARTNER_MANIFEST.kind).toBe("native")
    expect(BRAINSTORM_PARTNER_MANIFEST.version).toBe("1.0.0")
  })

  it("declares required runtime capabilities", () => {
    const caps = BRAINSTORM_PARTNER_MANIFEST.runtimeCapabilities
    expect(caps?.llm).toBe(true)
    expect(caps?.pane).toBe(true)
    expect(caps?.storage).toEqual({ scope: "workspace" })
  })

  it("accepts tasks", () => {
    expect(BRAINSTORM_PARTNER_MANIFEST.capabilities.acceptsTasks).toBe(true)
  })

  it("has isolated tool exposure and no dangerous permissions", () => {
    expect(BRAINSTORM_PARTNER_MANIFEST.toolExposure).toBe("isolated")
    expect(BRAINSTORM_PARTNER_MANIFEST.permissions).toEqual({
      filesystem: "none",
      network: "none",
      shell: false,
    })
  })
})

describe("createBrainstormPartner", () => {
  it("returns an AgentApp with the correct manifest", () => {
    const app = createBrainstormPartner()
    expect(app.manifest).toBe(BRAINSTORM_PARTNER_MANIFEST)
  })

  describe("handleDispatch", () => {
    it("opens pane, streams LLM response, and returns result on close", async () => {
      const summaryJson = JSON.stringify({
        framework: "First Principles",
        perspectives: [{ angle: "Root cause", ideas: ["idea1"] }],
        topIdeas: [{ idea: "main idea", pros: ["pro1"], cons: ["con1"] }],
        nextSteps: ["step1"],
      })

      const { client: llm } = createMockLLM([
        "Let me use First Principles for this.",
        summaryJson,
      ])
      const pane = createMockPane()
      const storage = createMockStorage()

      const app = createBrainstormPartner()
      await app.activate({
        appId: "native.brainstorm-partner",
        workspaceId: "ws-1",
        workspaceRoot: "/tmp/test",
        llm,
        pane,
        storage,
      } as AppContext)

      // Start dispatch — it will await pane close
      const resultPromise = app.handleDispatch!({ problem: "How to scale our API?" })

      // Let the initial LLM stream complete, then close pane
      // Use microtask to allow the async generators to flush
      await vi.waitFor(() => {
        expect(pane._chunks.length).toBeGreaterThan(0)
      })

      pane._simulateClose()

      const result = await resultPromise
      const typed = result as {
        problem: string
        framework: string
        perspectives: { angle: string; ideas: string[] }[]
        topIdeas: { idea: string; pros: string[]; cons: string[] }[]
        nextSteps: string[]
        sessionDuration: number
      }

      expect(typed.problem).toBe("How to scale our API?")
      expect(typed.framework).toBe("First Principles")
      expect(typed.perspectives).toHaveLength(1)
      expect(typed.topIdeas).toHaveLength(1)
      expect(typed.nextSteps).toEqual(["step1"])
      expect(typed.sessionDuration).toBeGreaterThanOrEqual(0)

      // Verify pane received chunks
      expect(pane._chunks).toContain("Let me use First Principles for this.")

      // Verify LLM was called (initial + summary)
      expect(llm.chat).toHaveBeenCalledTimes(2)

      // Verify storage persisted
      const keys = await storage.list()
      expect(keys).toHaveLength(1)
      expect(keys[0]).toMatch(/^brainstorm-/)
    })

    it("processes user messages through LLM during session", async () => {
      const summaryJson = JSON.stringify({
        framework: "SCAMPER",
        perspectives: [],
        topIdeas: [],
        nextSteps: [],
      })

      const { client: llm } = createMockLLM([
        "Initial response about SCAMPER.",
        "Follow-up based on your input.",
        summaryJson,
      ])
      const pane = createMockPane()
      const storage = createMockStorage()

      const app = createBrainstormPartner()
      await app.activate({
        appId: "native.brainstorm-partner",
        workspaceId: "ws-2",
        workspaceRoot: "/tmp/test",
        llm,
        pane,
        storage,
      } as AppContext)

      const resultPromise = app.handleDispatch!({ problem: "Improve our onboarding" })

      // Wait for initial stream
      await vi.waitFor(() => {
        expect(pane._chunks.length).toBeGreaterThan(0)
      })

      // Simulate user sending a message
      pane._simulateUserMessage("What about gamification?")

      // Wait for follow-up stream
      await vi.waitFor(() => {
        expect(llm.chat).toHaveBeenCalledTimes(2)
      })

      // Close pane to trigger summary
      pane._simulateClose()

      const result = await resultPromise
      const typed = result as { framework: string }

      expect(typed.framework).toBe("SCAMPER")

      // Initial + user follow-up + summary = 3 calls
      expect(llm.chat).toHaveBeenCalledTimes(3)

      // Verify chunks include both responses
      expect(pane._chunks).toContain("Initial response about SCAMPER.")
      expect(pane._chunks).toContain("Follow-up based on your input.")
    })

    it("returns default result when summary JSON is invalid", async () => {
      const { client: llm } = createMockLLM([
        "Let's brainstorm!",
        "not valid json at all",
      ])
      const pane = createMockPane()

      const app = createBrainstormPartner()
      await app.activate({
        appId: "native.brainstorm-partner",
        workspaceId: "ws-3",
        workspaceRoot: "/tmp/test",
        llm,
        pane,
      } as AppContext)

      const resultPromise = app.handleDispatch!({ problem: "Test problem" })

      await vi.waitFor(() => {
        expect(pane._chunks.length).toBeGreaterThan(0)
      })

      pane._simulateClose()

      const result = await resultPromise
      const typed = result as { framework: string; perspectives: unknown[] }

      expect(typed.framework).toBe("unknown")
      expect(typed.perspectives).toEqual([])
    })

    it("throws when LLM capability is missing", async () => {
      const pane = createMockPane()

      const app = createBrainstormPartner()
      await app.activate({
        appId: "native.brainstorm-partner",
        workspaceId: "ws-4",
        workspaceRoot: "/tmp/test",
        pane,
      } as AppContext)

      await expect(
        app.handleDispatch!({ problem: "test" }),
      ).rejects.toThrow("Brainstorm Partner requires LLM capability")
    })

    it("throws when Pane capability is missing", async () => {
      const { client: llm } = createMockLLM(["test"])

      const app = createBrainstormPartner()
      await app.activate({
        appId: "native.brainstorm-partner",
        workspaceId: "ws-5",
        workspaceRoot: "/tmp/test",
        llm,
      } as AppContext)

      await expect(
        app.handleDispatch!({ problem: "test" }),
      ).rejects.toThrow("Brainstorm Partner requires Pane capability")
    })
  })

  describe("deactivate", () => {
    it("closes pane if open", async () => {
      const { client: llm } = createMockLLM(["response"])
      const pane = createMockPane()

      const app = createBrainstormPartner()
      await app.activate({
        appId: "native.brainstorm-partner",
        workspaceId: "ws-6",
        workspaceRoot: "/tmp/test",
        llm,
        pane,
      } as AppContext)

      // Start a dispatch to make the pane active
      const resultPromise = app.handleDispatch!({ problem: "test deactivate" })

      await vi.waitFor(() => {
        expect(pane._chunks.length).toBeGreaterThan(0)
      })

      // Deactivate while pane is open
      await app.deactivate!()
      expect(pane.isOpen()).toBe(false)

      // Close pane to unblock dispatch
      pane._simulateClose()
      await resultPromise.catch(() => {
        // Expected — summary may fail after deactivate
      })
    })
  })
})
