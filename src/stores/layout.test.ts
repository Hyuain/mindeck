import { describe, it, expect, beforeEach } from "vitest"
import { useLayoutStore } from "./layout"

describe("useLayoutStore", () => {
  beforeEach(() => {
    useLayoutStore.setState({
      majordomoWidth: 320,
      rightPanelWidth: 280,
      showLeft: true,
      showCenter: true,
      showRight: true,
      workspaceLayouts: {},
    })
  })

  describe("panel widths", () => {
    it("sets majordomo width", () => {
      useLayoutStore.getState().setMajordomoWidth(400)
      expect(useLayoutStore.getState().majordomoWidth).toBe(400)
    })

    it("sets right panel width", () => {
      useLayoutStore.getState().setRightPanelWidth(350)
      expect(useLayoutStore.getState().rightPanelWidth).toBe(350)
    })
  })

  describe("column visibility", () => {
    it("toggles left column", () => {
      useLayoutStore.getState().setShowLeft(false)
      expect(useLayoutStore.getState().showLeft).toBe(false)
    })

    it("toggles center column", () => {
      useLayoutStore.getState().setShowCenter(false)
      expect(useLayoutStore.getState().showCenter).toBe(false)
    })

    it("toggles right column", () => {
      useLayoutStore.getState().setShowRight(false)
      expect(useLayoutStore.getState().showRight).toBe(false)
    })
  })

  describe("workspace layouts", () => {
    it("sets layout for a workspace", () => {
      const layout = {
        panes: [{ id: "p1", type: "agent" as const, title: "Agent" }],
        layout: null,
      }
      useLayoutStore.getState().setWorkspaceLayout("ws-1", layout)
      expect(useLayoutStore.getState().workspaceLayouts["ws-1"]).toEqual(layout)
    })

    it("deletes layout for a workspace", () => {
      useLayoutStore.getState().setWorkspaceLayout("ws-1", { panes: [], layout: null })
      useLayoutStore.getState().deleteWorkspaceLayout("ws-1")
      expect(useLayoutStore.getState().workspaceLayouts["ws-1"]).toBeUndefined()
    })

    it("does not affect other workspace layouts", () => {
      useLayoutStore.getState().setWorkspaceLayout("ws-1", { panes: [], layout: null })
      useLayoutStore.getState().setWorkspaceLayout("ws-2", { panes: [], layout: null })
      useLayoutStore.getState().deleteWorkspaceLayout("ws-1")
      expect(useLayoutStore.getState().workspaceLayouts["ws-2"]).toBeDefined()
    })
  })
})
