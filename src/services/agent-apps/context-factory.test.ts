import { describe, it, expect, vi, beforeEach } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { buildAppContext } from "./context-factory"
import type { BuildParams } from "./context-factory"
import type { RuntimeCapabilities, AppChannel, PaneClient } from "@/types"
import { registerTool, toolRegistry } from "@/services/tools/registry"
import { makeTestToolDefinition } from "@/test/factories"

// streamChat is used internally by the LLM client — mock it
vi.mock("@/services/providers/bridge", () => ({
  streamChat: vi.fn(),
}))

// storage-client uses invoke internally — already mocked globally
vi.mock("./storage-client", () => ({
  createStorageClient: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  })),
}))

const mockedInvoke = vi.mocked(invoke)

function makeParams(
  capabilities: RuntimeCapabilities,
  overrides: Partial<BuildParams> = {}
): BuildParams {
  return {
    appId: "test-app",
    workspaceId: "ws-1",
    workspaceRoot: "/home/user/project",
    providerId: "provider-1",
    providerType: "openai-compatible",
    modelId: "gpt-4",
    capabilities,
    ...overrides,
  }
}

describe("buildAppContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toolRegistry.clear()
  })

  it("always includes appId, workspaceId, and workspaceRoot", () => {
    const ctx = buildAppContext(makeParams({}))

    expect(ctx.appId).toBe("test-app")
    expect(ctx.workspaceId).toBe("ws-1")
    expect(ctx.workspaceRoot).toBe("/home/user/project")
  })

  it("injects nothing when capabilities are empty", () => {
    const ctx = buildAppContext(makeParams({}))

    expect(ctx.shell).toBeUndefined()
    expect(ctx.llm).toBeUndefined()
    expect(ctx.tools).toBeUndefined()
    expect(ctx.channel).toBeUndefined()
    expect(ctx.pane).toBeUndefined()
    expect(ctx.storage).toBeUndefined()
  })

  describe("shell", () => {
    it("injects ShellClient when capabilities.shell is true", () => {
      const ctx = buildAppContext(makeParams({ shell: true }))

      expect(ctx.shell).toBeDefined()
      expect(typeof ctx.shell!.exec).toBe("function")
    })

    it("does not inject ShellClient when capabilities.shell is false", () => {
      const ctx = buildAppContext(makeParams({ shell: false }))

      expect(ctx.shell).toBeUndefined()
    })

    it("shell.exec calls invoke with correct arguments", async () => {
      mockedInvoke.mockResolvedValueOnce("hello world")
      const ctx = buildAppContext(makeParams({ shell: true }))

      const result = await ctx.shell!.exec("echo hello")

      expect(mockedInvoke).toHaveBeenCalledWith("bash_exec", {
        command: "echo hello",
        cwd: "/home/user/project",
      })
      expect(result).toEqual({ stdout: "hello world", stderr: "", exitCode: 0 })
    })

    it("shell.exec uses custom cwd when provided", async () => {
      mockedInvoke.mockResolvedValueOnce("")
      const ctx = buildAppContext(makeParams({ shell: true }))

      await ctx.shell!.exec("ls", "/tmp")

      expect(mockedInvoke).toHaveBeenCalledWith("bash_exec", {
        command: "ls",
        cwd: "/tmp",
      })
    })
  })

  describe("llm", () => {
    it("injects LLMClient when capabilities.llm is true", () => {
      const ctx = buildAppContext(makeParams({ llm: true }))

      expect(ctx.llm).toBeDefined()
      expect(typeof ctx.llm!.chat).toBe("function")
    })

    it("does not inject LLMClient when capabilities.llm is false", () => {
      const ctx = buildAppContext(makeParams({ llm: false }))

      expect(ctx.llm).toBeUndefined()
    })
  })

  describe("tools", () => {
    it("injects ToolClient when capabilities.tools has entries", () => {
      const ctx = buildAppContext(makeParams({ tools: ["read_file", "write_file"] }))

      expect(ctx.tools).toBeDefined()
      expect(typeof ctx.tools!.call).toBe("function")
    })

    it("does not inject ToolClient when capabilities.tools is empty", () => {
      const ctx = buildAppContext(makeParams({ tools: [] }))

      expect(ctx.tools).toBeUndefined()
    })

    it("does not inject ToolClient when capabilities.tools is undefined", () => {
      const ctx = buildAppContext(makeParams({}))

      expect(ctx.tools).toBeUndefined()
    })

    it("tool.call throws for undeclared tool names", async () => {
      const ctx = buildAppContext(makeParams({ tools: ["read_file"] }))

      await expect(ctx.tools!.call("write_file", {})).rejects.toThrow(
        "Tool 'write_file' is not declared in this app's capabilities"
      )
    })

    it("tool.call delegates to executeTool for declared tools", async () => {
      registerTool({
        definition: makeTestToolDefinition({ name: "read_file" }),
        execute: async () => "file content",
      })
      const ctx = buildAppContext(makeParams({ tools: ["read_file"] }))

      const result = await ctx.tools!.call("read_file", { path: "/test" })

      expect(result).toEqual({ ok: true, result: "file content" })
    })
  })

  describe("channel", () => {
    it("injects channel when both capability and channel param are provided", () => {
      const channel = {
        request: vi.fn(),
        onRequest: vi.fn(),
        send: vi.fn(),
        onMessage: vi.fn(),
        close: vi.fn(),
      } as AppChannel
      const ctx = buildAppContext(makeParams({ channel: true }, { channel }))

      expect(ctx.channel).toBe(channel)
    })

    it("does not inject channel when capability is true but no channel param", () => {
      const ctx = buildAppContext(makeParams({ channel: true }))

      expect(ctx.channel).toBeUndefined()
    })

    it("does not inject channel when capability is false", () => {
      const channel = {
        request: vi.fn(),
        onRequest: vi.fn(),
        send: vi.fn(),
        onMessage: vi.fn(),
        close: vi.fn(),
      } as AppChannel
      const ctx = buildAppContext(makeParams({ channel: false }, { channel }))

      expect(ctx.channel).toBeUndefined()
    })
  })

  describe("pane", () => {
    it("injects pane when both capability and pane param are provided", () => {
      const pane = {
        open: vi.fn(),
        close: vi.fn(),
        sendChunk: vi.fn(),
        sendMessage: vi.fn(),
        onUserMessage: vi.fn(),
        onClose: vi.fn(),
        isOpen: vi.fn().mockReturnValue(false),
      } as PaneClient
      const ctx = buildAppContext(makeParams({ pane: true }, { pane }))

      expect(ctx.pane).toBe(pane)
    })

    it("does not inject pane when capability is true but no pane param", () => {
      const ctx = buildAppContext(makeParams({ pane: true }))

      expect(ctx.pane).toBeUndefined()
    })
  })

  describe("storage", () => {
    it("injects StorageClient when capabilities.storage is true", () => {
      const ctx = buildAppContext(
        makeParams({ storage: { scope: "workspace" as const } })
      )

      expect(ctx.storage).toBeDefined()
      expect(typeof ctx.storage!.get).toBe("function")
      expect(typeof ctx.storage!.set).toBe("function")
      expect(typeof ctx.storage!.delete).toBe("function")
      expect(typeof ctx.storage!.list).toBe("function")
    })

    it("does not inject StorageClient when capabilities.storage is undefined", () => {
      const ctx = buildAppContext(makeParams({}))

      expect(ctx.storage).toBeUndefined()
    })
  })

  it("injects multiple capabilities simultaneously", () => {
    const pane = {
      open: vi.fn(),
      close: vi.fn(),
      sendChunk: vi.fn(),
      sendMessage: vi.fn(),
      onUserMessage: vi.fn(),
      onClose: vi.fn(),
      isOpen: vi.fn().mockReturnValue(false),
    } as PaneClient
    const channel = {
      request: vi.fn(),
      onRequest: vi.fn(),
      send: vi.fn(),
      onMessage: vi.fn(),
      close: vi.fn(),
    } as AppChannel

    const ctx = buildAppContext(
      makeParams(
        {
          shell: true,
          llm: true,
          tools: ["read_file"],
          channel: true,
          pane: true,
          storage: { scope: "workspace" as const },
        },
        { pane, channel }
      )
    )

    expect(ctx.shell).toBeDefined()
    expect(ctx.llm).toBeDefined()
    expect(ctx.tools).toBeDefined()
    expect(ctx.channel).toBe(channel)
    expect(ctx.pane).toBe(pane)
    expect(ctx.storage).toBeDefined()
  })
})
