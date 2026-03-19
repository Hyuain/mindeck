import { describe, it, expect, vi, beforeEach } from "vitest"
import { createStorageClient } from "./storage-client"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

import { invoke } from "@tauri-apps/api/core"

const mockInvoke = vi.mocked(invoke)

describe("createStorageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: file does not exist yet
    mockInvoke.mockRejectedValue(new Error("file not found"))
  })

  it("get returns null for missing key", async () => {
    const client = createStorageClient("ws-1", "app-1", "workspace")
    const result = await client.get("nonexistent")
    expect(result).toBeNull()
  })

  it("set then get returns the stored value", async () => {
    // First read_file fails (no existing data), then write_file succeeds
    mockInvoke
      .mockRejectedValueOnce(new Error("file not found")) // initial load
      .mockResolvedValueOnce(undefined) // write_file on set

    const client = createStorageClient("ws-1", "app-1", "workspace")
    await client.set("greeting", "hello")

    const result = await client.get("greeting")
    expect(result).toBe("hello")

    // Verify write_file was called with correct path
    expect(mockInvoke).toHaveBeenCalledWith("write_file", {
      path: "~/.mindeck/workspaces/ws-1/apps/app-1/store.json",
      content: expect.any(String),
    })
  })

  it("uses global path when scope is global", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("file not found"))
      .mockResolvedValueOnce(undefined)

    const client = createStorageClient("ws-1", "app-1", "global")
    await client.set("key", "val")

    expect(mockInvoke).toHaveBeenCalledWith("write_file", {
      path: "~/.mindeck/apps/app-1/store.json",
      content: expect.any(String),
    })
  })

  it("list returns all keys", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("file not found")) // initial load
      .mockResolvedValueOnce(undefined) // write after set("a")
      .mockResolvedValueOnce(undefined) // write after set("b")

    const client = createStorageClient("ws-1", "app-1", "workspace")
    await client.set("a", 1)
    await client.set("b", 2)

    const keys = await client.list()
    expect(keys).toContain("a")
    expect(keys).toContain("b")
    expect(keys).toHaveLength(2)
  })

  it("delete removes a key", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("file not found"))
      .mockResolvedValueOnce(undefined) // write after set
      .mockResolvedValueOnce(undefined) // write after delete

    const client = createStorageClient("ws-1", "app-1", "workspace")
    await client.set("temp", "data")
    await client.delete("temp")

    const result = await client.get("temp")
    expect(result).toBeNull()

    const keys = await client.list()
    expect(keys).not.toContain("temp")
  })

  it("query filters by keyPrefix", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("file not found"))
      .mockResolvedValueOnce(undefined) // write after set
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)

    const client = createStorageClient("ws-1", "app-1", "workspace")
    await client.set("notes/a", "alpha")
    await client.set("notes/b", "bravo")
    await client.set("config/theme", "dark")

    const result = await client.query({ keyPrefix: "notes/" })
    expect(Object.keys(result)).toHaveLength(2)
    expect(result["notes/a"]).toBe("alpha")
    expect(result["notes/b"]).toBe("bravo")
    expect(result["config/theme"]).toBeUndefined()
  })

  it("loads existing data from file", async () => {
    const existing = {
      saved: { value: 42, timestamp: "2026-01-01T00:00:00.000Z" },
    }
    mockInvoke.mockResolvedValueOnce(JSON.stringify(existing)) // read_file

    const client = createStorageClient("ws-1", "app-1", "workspace")
    const result = await client.get("saved")
    expect(result).toBe(42)
  })
})
