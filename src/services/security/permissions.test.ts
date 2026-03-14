import { describe, it, expect, beforeEach } from "vitest"
import {
  setPermissionContext,
  requestPermission,
  resolvePermission,
  resolveAllPermissions,
} from "./permissions"
import { useMajordomoStore } from "@/stores/majordomo"

describe("permissions", () => {
  beforeEach(() => {
    useMajordomoStore.setState({
      pendingPermissions: [],
    })
    setPermissionContext(undefined)
  })

  it("requestPermission adds a pending permission to the store", async () => {
    // Don't await — it blocks until resolved
    const promise = requestPermission("bash_exec", "Run command", "ls -la")

    const { pendingPermissions } = useMajordomoStore.getState()
    expect(pendingPermissions).toHaveLength(1)
    expect(pendingPermissions[0].type).toBe("bash_exec")
    expect(pendingPermissions[0].label).toBe("Run command")
    expect(pendingPermissions[0].details).toBe("ls -la")

    // Resolve to avoid hanging
    resolvePermission(pendingPermissions[0].id, true)
    const granted = await promise
    expect(granted).toBe(true)
  })

  it("resolvePermission resolves the promise with granted=false", async () => {
    const promise = requestPermission("bash_exec", "Run", "rm -rf /")

    const { pendingPermissions } = useMajordomoStore.getState()
    resolvePermission(pendingPermissions[0].id, false)

    expect(await promise).toBe(false)
  })

  it("resolvePermission removes the request from the store", async () => {
    const promise = requestPermission("bash_exec", "Run", "ls")
    const { pendingPermissions } = useMajordomoStore.getState()
    const id = pendingPermissions[0].id

    resolvePermission(id, true)
    await promise

    expect(useMajordomoStore.getState().pendingPermissions).toHaveLength(0)
  })

  it("resolvePermission is a no-op for unknown ids", () => {
    expect(() => resolvePermission("nonexistent", true)).not.toThrow()
  })

  it("setPermissionContext sets the requestedBy field", async () => {
    setPermissionContext("workspace-agent-1")
    const promise = requestPermission("bash_exec", "Run", "ls")

    const { pendingPermissions } = useMajordomoStore.getState()
    expect(pendingPermissions[0].requestedBy).toBe("workspace-agent-1")

    resolvePermission(pendingPermissions[0].id, true)
    await promise
  })

  it("explicit requestedBy overrides context", async () => {
    setPermissionContext("context-agent")
    const promise = requestPermission("bash_exec", "Run", "ls", "explicit-agent")

    const { pendingPermissions } = useMajordomoStore.getState()
    expect(pendingPermissions[0].requestedBy).toBe("explicit-agent")

    resolvePermission(pendingPermissions[0].id, true)
    await promise
  })

  it("resolveAllPermissions resolves all pending permissions", async () => {
    const p1 = requestPermission("bash_exec", "Run1", "cmd1")
    const p2 = requestPermission("bash_exec", "Run2", "cmd2")

    resolveAllPermissions(true)

    expect(await p1).toBe(true)
    expect(await p2).toBe(true)
    expect(useMajordomoStore.getState().pendingPermissions).toHaveLength(0)
  })
})
