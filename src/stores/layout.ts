import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { PaneNode } from "@/components/workspace/FlexibleWorkspace"

export interface SerializedPane {
  id: string
  type: "agent" | "file" | "agent-app"
  title: string
  workspaceId?: string
  filePath?: string
  appId?: string
}

export interface SerializedWorkspaceLayout {
  panes: SerializedPane[]
  layout: PaneNode | null
}

interface LayoutState {
  // Outer panel sizes
  majordomoWidth: number
  rightPanelWidth: number
  // Column visibility (removes from DOM when false)
  showLeft: boolean
  showCenter: boolean
  showRight: boolean
  // Per-workspace inner pane layouts
  workspaceLayouts: Record<string, SerializedWorkspaceLayout>

  // Actions
  setMajordomoWidth: (w: number) => void
  setRightPanelWidth: (w: number) => void
  setShowLeft: (v: boolean) => void
  setShowCenter: (v: boolean) => void
  setShowRight: (v: boolean) => void
  setWorkspaceLayout: (workspaceId: string, layout: SerializedWorkspaceLayout) => void
  deleteWorkspaceLayout: (workspaceId: string) => void
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      majordomoWidth: 320,
      rightPanelWidth: 280,
      showLeft: true,
      showCenter: true,
      showRight: true,
      workspaceLayouts: {},

      setMajordomoWidth: (w) => set({ majordomoWidth: w }),
      setRightPanelWidth: (w) => set({ rightPanelWidth: w }),
      setShowLeft: (v) => set({ showLeft: v }),
      setShowCenter: (v) => set({ showCenter: v }),
      setShowRight: (v) => set({ showRight: v }),
      setWorkspaceLayout: (workspaceId, layout) =>
        set((state) => ({
          workspaceLayouts: { ...state.workspaceLayouts, [workspaceId]: layout },
        })),
      deleteWorkspaceLayout: (workspaceId) =>
        set((state) => {
          const { [workspaceId]: _, ...workspaceLayouts } = state.workspaceLayouts
          return { workspaceLayouts }
        }),
    }),
    {
      name: "mindeck-layout",
      partialize: (state) => ({
        majordomoWidth: state.majordomoWidth,
        rightPanelWidth: state.rightPanelWidth,
        showLeft: state.showLeft,
        showCenter: state.showCenter,
        showRight: state.showRight,
        workspaceLayouts: state.workspaceLayouts,
      }),
    }
  )
)
