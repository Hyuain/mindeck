import { describe, it, expect, beforeEach } from "vitest"
import { useMajordomoStore } from "./majordomo"
import {
  makeTestWorkspaceSummary,
  makeTestToolActivity,
  makeTestPermissionRequest,
} from "@/test/factories"

describe("useMajordomoStore", () => {
  beforeEach(() => {
    useMajordomoStore.setState({
      workspaceSummaries: [],
      isStreaming: false,
      selectedProviderId: "",
      selectedModelId: "",
      activeToolActivities: [],
      pendingPermissions: [],
    })
  })

  describe("setStreaming", () => {
    it("sets streaming state", () => {
      useMajordomoStore.getState().setStreaming(true)
      expect(useMajordomoStore.getState().isStreaming).toBe(true)
    })
  })

  describe("updateSummary", () => {
    it("adds a new summary", () => {
      const summary = makeTestWorkspaceSummary({ workspaceId: "ws-1" })
      useMajordomoStore.getState().updateSummary(summary)
      expect(useMajordomoStore.getState().workspaceSummaries).toHaveLength(1)
    })

    it("updates existing summary for same workspace", () => {
      useMajordomoStore.getState().updateSummary(
        makeTestWorkspaceSummary({ workspaceId: "ws-1", snippet: "Old" })
      )
      useMajordomoStore.getState().updateSummary(
        makeTestWorkspaceSummary({ workspaceId: "ws-1", snippet: "New" })
      )
      expect(useMajordomoStore.getState().workspaceSummaries).toHaveLength(1)
      expect(useMajordomoStore.getState().workspaceSummaries[0].snippet).toBe("New")
    })
  })

  describe("setSummaries", () => {
    it("replaces all summaries", () => {
      useMajordomoStore.getState().setSummaries([
        makeTestWorkspaceSummary({ workspaceId: "ws-1" }),
      ])
      expect(useMajordomoStore.getState().workspaceSummaries).toHaveLength(1)
    })
  })

  describe("setModel", () => {
    it("sets provider and model ids", () => {
      useMajordomoStore.getState().setModel("p1", "m1")
      expect(useMajordomoStore.getState().selectedProviderId).toBe("p1")
      expect(useMajordomoStore.getState().selectedModelId).toBe("m1")
    })
  })

  describe("tool activities", () => {
    it("adds a new tool activity", () => {
      const activity = makeTestToolActivity({ id: "a1" })
      useMajordomoStore.getState().setToolActivity(activity)
      expect(useMajordomoStore.getState().activeToolActivities).toHaveLength(1)
    })

    it("updates existing tool activity by id", () => {
      useMajordomoStore.getState().setToolActivity(
        makeTestToolActivity({ id: "a1", status: "running" })
      )
      useMajordomoStore.getState().setToolActivity(
        makeTestToolActivity({ id: "a1", status: "done" })
      )
      expect(useMajordomoStore.getState().activeToolActivities).toHaveLength(1)
      expect(useMajordomoStore.getState().activeToolActivities[0].status).toBe("done")
    })

    it("clears all tool activities", () => {
      useMajordomoStore.getState().setToolActivity(makeTestToolActivity())
      useMajordomoStore.getState().clearToolActivities()
      expect(useMajordomoStore.getState().activeToolActivities).toHaveLength(0)
    })
  })

  describe("permissions", () => {
    it("adds a permission request", () => {
      useMajordomoStore.getState().addPermissionRequest(
        makeTestPermissionRequest({ id: "pr1" })
      )
      expect(useMajordomoStore.getState().pendingPermissions).toHaveLength(1)
    })

    it("removes a permission request by id", () => {
      useMajordomoStore.getState().addPermissionRequest(
        makeTestPermissionRequest({ id: "pr1" })
      )
      useMajordomoStore.getState().removePermissionRequest("pr1")
      expect(useMajordomoStore.getState().pendingPermissions).toHaveLength(0)
    })
  })

  describe("deleteWorkspaceSummary", () => {
    it("removes summary for a workspace", () => {
      useMajordomoStore.getState().updateSummary(
        makeTestWorkspaceSummary({ workspaceId: "ws-1" })
      )
      useMajordomoStore.getState().deleteWorkspaceSummary("ws-1")
      expect(useMajordomoStore.getState().workspaceSummaries).toHaveLength(0)
    })
  })
})
