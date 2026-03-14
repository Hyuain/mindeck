import { describe, it, expect, vi, beforeEach } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { toolRegistry } from "./registry"
import { registerBuiltins } from "./builtins"

// Mock modules that builtins depends on
vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn(), on: vi.fn(() => vi.fn()) },
}))

vi.mock("@/services/permissions", () => ({
  requestPermission: vi.fn().mockResolvedValue(true),
}))

vi.mock("@/services/workspace-agent", () => ({
  getActiveSandbox: vi.fn(() => null),
}))

describe("registerBuiltins", () => {
  beforeEach(() => {
    toolRegistry.clear()
    vi.mocked(invoke).mockReset()
  })

  it("registers all 7 built-in tools (Majordomo-only tools excluded)", () => {
    registerBuiltins()
    const names = Array.from(toolRegistry.keys())
    expect(names).toContain("list_dir")
    expect(names).toContain("read_file")
    expect(names).toContain("write_file")
    expect(names).toContain("delete_path")
    expect(names).toContain("bash_exec")
    expect(names).toContain("web_fetch")
    expect(names).toContain("report_to_majordomo")
    // These are now Majordomo-only (in majordomo-tools.ts)
    expect(names).not.toContain("list_workspaces")
    expect(names).not.toContain("dispatch_to_workspace")
  })

  it("list_dir invokes the correct Tauri command", async () => {
    registerBuiltins()
    vi.mocked(invoke).mockResolvedValue([{ name: "foo.txt", isDir: false }])

    const executor = toolRegistry.get("list_dir")!
    const result = await executor.execute({ path: "/tmp" })

    expect(invoke).toHaveBeenCalledWith("list_dir", { path: "/tmp" })
    expect(result).toEqual([{ name: "foo.txt", isDir: false }])
  })

  it("read_file invokes the correct Tauri command", async () => {
    registerBuiltins()
    vi.mocked(invoke).mockResolvedValue("file content")

    const executor = toolRegistry.get("read_file")!
    await executor.execute({ path: "/test.txt" })

    expect(invoke).toHaveBeenCalledWith("read_file", { path: "/test.txt" })
  })

  it("write_file invokes the correct Tauri command", async () => {
    registerBuiltins()
    vi.mocked(invoke).mockResolvedValue(undefined)

    const executor = toolRegistry.get("write_file")!
    const result = await executor.execute({ path: "/test.txt", content: "hello" })

    expect(invoke).toHaveBeenCalledWith("write_file", {
      path: "/test.txt",
      content: "hello",
    })
    expect(result).toBe("File written successfully")
  })

  it("each tool has a valid definition with name and description", () => {
    registerBuiltins()
    for (const [name, executor] of toolRegistry) {
      expect(executor.definition.name).toBe(name)
      expect(executor.definition.description).toBeTruthy()
      expect(executor.definition.parameters.type).toBe("object")
    }
  })
})
