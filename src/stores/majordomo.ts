import { create } from "zustand"
import type {
  WorkspaceSummary,
  ToolActivity,
  TaskResultEvent,
  PermissionRequest,
  Message,
} from "@/types"
import { appendMajordomoMessage, MAJORDOMO_WS_ID } from "@/services/conversation"
import { eventBus } from "@/services/event-bus"
import { useChatStore } from "@/stores/chat"
import { createLogger } from "@/services/logger"

const log = createLogger("Majordomo")

interface MajordomoState {
  workspaceSummaries: WorkspaceSummary[]
  isStreaming: boolean
  selectedProviderId: string
  selectedModelId: string
  activeToolActivities: ToolActivity[]
  pendingPermissions: PermissionRequest[]
  // actions
  setStreaming: (streaming: boolean) => void
  updateSummary: (summary: WorkspaceSummary) => void
  setSummaries: (summaries: WorkspaceSummary[]) => void
  setModel: (providerId: string, modelId: string) => void
  setToolActivity: (activity: ToolActivity) => void
  clearToolActivities: () => void
  addPermissionRequest: (req: PermissionRequest) => void
  removePermissionRequest: (id: string) => void
}

export const useMajordomoStore = create<MajordomoState>((set) => ({
  workspaceSummaries: [],
  isStreaming: false,
  selectedProviderId: "",
  selectedModelId: "",
  activeToolActivities: [],
  pendingPermissions: [],

  setStreaming: (isStreaming) => set({ isStreaming }),

  updateSummary: (summary) =>
    set((state) => {
      const exists = state.workspaceSummaries.some(
        (s) => s.workspaceId === summary.workspaceId
      )
      return {
        workspaceSummaries: exists
          ? state.workspaceSummaries.map((s) =>
              s.workspaceId === summary.workspaceId ? summary : s
            )
          : [...state.workspaceSummaries, summary],
      }
    }),

  setSummaries: (workspaceSummaries) => set({ workspaceSummaries }),

  setModel: (selectedProviderId, selectedModelId) =>
    set({ selectedProviderId, selectedModelId }),

  setToolActivity: (activity) =>
    set((state) => {
      const exists = state.activeToolActivities.some((a) => a.id === activity.id)
      return {
        activeToolActivities: exists
          ? state.activeToolActivities.map((a) => (a.id === activity.id ? activity : a))
          : [...state.activeToolActivities, activity],
      }
    }),

  clearToolActivities: () => set({ activeToolActivities: [] }),

  addPermissionRequest: (req) =>
    set((state) => ({ pendingPermissions: [...state.pendingPermissions, req] })),

  removePermissionRequest: (id) =>
    set((state) => ({
      pendingPermissions: state.pendingPermissions.filter((r) => r.id !== id),
    })),
}))

/**
 * Wire up Majordomo to listen for workspace task results.
 * Call once at app startup (after store is ready).
 */
export function initMajordomoResultListener(): () => void {
  return eventBus.on("task:result", (event: TaskResultEvent) => {
    const notif: Message = {
      id: crypto.randomUUID(),
      role: "system",
      content: `[Workspace result] ${event.summary}`,
      timestamp: new Date().toISOString(),
      metadata: {
        source: "majordomo",
        dispatchId: event.dispatchId,
        workspaceId: event.workspaceId,
        isResultCard: true,
        fullResult: event.result,
      },
    }
    // Persist to disk
    appendMajordomoMessage(notif).catch((err: unknown) =>
      log.warn("Failed to persist result card", err)
    )
    // Add to chat store under the majordomo workspace key
    useChatStore.getState().appendMessage(MAJORDOMO_WS_ID, notif)
  })
}
