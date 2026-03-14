import { describe, it, expect, beforeEach } from "vitest"
import { useWorkspaceStore } from "./workspace"
import { makeTestWorkspace } from "@/test/factories"

describe("useWorkspaceStore", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: null })
  })

  describe("setWorkspaces", () => {
    it("sets the workspace list", () => {
      const ws = [makeTestWorkspace({ id: "ws-1" })]
      useWorkspaceStore.getState().setWorkspaces(ws)
      expect(useWorkspaceStore.getState().workspaces).toHaveLength(1)
      expect(useWorkspaceStore.getState().workspaces[0].id).toBe("ws-1")
    })

    it("migrates legacy mcpDependencies to orchestratorConfig", () => {
      const ws = makeTestWorkspace({
        id: "ws-1",
        mcpDependencies: [
          { name: "test", transport: "stdio", command: "echo" },
        ],
      })
      useWorkspaceStore.getState().setWorkspaces([ws])
      const stored = useWorkspaceStore.getState().workspaces[0]
      expect(stored.orchestratorConfig?.mcpDependencies).toHaveLength(1)
    })

    it("does not re-migrate if orchestratorConfig already has mcpDependencies", () => {
      const ws = makeTestWorkspace({
        id: "ws-1",
        mcpDependencies: [{ name: "old", transport: "stdio" }],
        orchestratorConfig: {
          mcpDependencies: [{ name: "new", transport: "stdio" }],
        },
      })
      useWorkspaceStore.getState().setWorkspaces([ws])
      const stored = useWorkspaceStore.getState().workspaces[0]
      expect(stored.orchestratorConfig?.mcpDependencies?.[0].name).toBe("new")
    })
  })

  describe("addWorkspace", () => {
    it("adds a workspace to the list", () => {
      const ws = makeTestWorkspace({ id: "ws-1" })
      useWorkspaceStore.getState().addWorkspace(ws)
      expect(useWorkspaceStore.getState().workspaces).toHaveLength(1)
    })

    it("does not mutate existing workspaces", () => {
      const ws1 = makeTestWorkspace({ id: "ws-1" })
      useWorkspaceStore.getState().addWorkspace(ws1)
      const before = useWorkspaceStore.getState().workspaces

      const ws2 = makeTestWorkspace({ id: "ws-2" })
      useWorkspaceStore.getState().addWorkspace(ws2)

      // Original array reference should not have changed
      expect(before).toHaveLength(1)
      expect(useWorkspaceStore.getState().workspaces).toHaveLength(2)
    })
  })

  describe("updateWorkspace", () => {
    it("updates a workspace by id", () => {
      const ws = makeTestWorkspace({ id: "ws-1", name: "Old Name" })
      useWorkspaceStore.getState().setWorkspaces([ws])
      useWorkspaceStore.getState().updateWorkspace("ws-1", { name: "New Name" })
      expect(useWorkspaceStore.getState().workspaces[0].name).toBe("New Name")
    })

    it("updates the updatedAt timestamp", () => {
      const ws = makeTestWorkspace({ id: "ws-1", updatedAt: "2020-01-01T00:00:00Z" })
      useWorkspaceStore.getState().setWorkspaces([ws])
      useWorkspaceStore.getState().updateWorkspace("ws-1", { name: "X" })
      expect(useWorkspaceStore.getState().workspaces[0].updatedAt).not.toBe("2020-01-01T00:00:00Z")
    })

    it("does not affect other workspaces", () => {
      const ws1 = makeTestWorkspace({ id: "ws-1", name: "WS1" })
      const ws2 = makeTestWorkspace({ id: "ws-2", name: "WS2" })
      useWorkspaceStore.getState().setWorkspaces([ws1, ws2])
      useWorkspaceStore.getState().updateWorkspace("ws-1", { name: "Updated" })
      expect(useWorkspaceStore.getState().workspaces[1].name).toBe("WS2")
    })
  })

  describe("removeWorkspace", () => {
    it("removes a workspace by id", () => {
      const ws = makeTestWorkspace({ id: "ws-1" })
      useWorkspaceStore.getState().setWorkspaces([ws])
      useWorkspaceStore.getState().removeWorkspace("ws-1")
      expect(useWorkspaceStore.getState().workspaces).toHaveLength(0)
    })

    it("clears activeWorkspaceId if removed workspace was active", () => {
      const ws = makeTestWorkspace({ id: "ws-1" })
      useWorkspaceStore.setState({ workspaces: [ws], activeWorkspaceId: "ws-1" })
      useWorkspaceStore.getState().removeWorkspace("ws-1")
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull()
    })

    it("preserves activeWorkspaceId if different workspace removed", () => {
      const ws1 = makeTestWorkspace({ id: "ws-1" })
      const ws2 = makeTestWorkspace({ id: "ws-2" })
      useWorkspaceStore.setState({ workspaces: [ws1, ws2], activeWorkspaceId: "ws-1" })
      useWorkspaceStore.getState().removeWorkspace("ws-2")
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws-1")
    })
  })

  describe("setActiveWorkspace", () => {
    it("sets the active workspace id", () => {
      useWorkspaceStore.getState().setActiveWorkspace("ws-1")
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("ws-1")
    })
  })

  describe("updateStatus", () => {
    it("updates workspace status and lastActivity", () => {
      const ws = makeTestWorkspace({ id: "ws-1", status: "idle" })
      useWorkspaceStore.getState().setWorkspaces([ws])
      useWorkspaceStore.getState().updateStatus("ws-1", "active")
      const updated = useWorkspaceStore.getState().workspaces[0]
      expect(updated.status).toBe("active")
      expect(updated.lastActivity).toBeDefined()
    })

    it("updates stateSummary when snippet provided", () => {
      const ws = makeTestWorkspace({ id: "ws-1" })
      useWorkspaceStore.getState().setWorkspaces([ws])
      useWorkspaceStore.getState().updateStatus("ws-1", "active", "Working on tests")
      expect(useWorkspaceStore.getState().workspaces[0].stateSummary).toBe("Working on tests")
    })

    it("preserves existing stateSummary when no snippet", () => {
      const ws = makeTestWorkspace({ id: "ws-1", stateSummary: "Old summary" })
      useWorkspaceStore.getState().setWorkspaces([ws])
      useWorkspaceStore.getState().updateStatus("ws-1", "idle")
      expect(useWorkspaceStore.getState().workspaces[0].stateSummary).toBe("Old summary")
    })
  })
})
