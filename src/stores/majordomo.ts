import { create } from "zustand"
import type {
  Message,
  WorkspaceSummary,
  ToolActivity,
  TaskResultEvent,
  PermissionRequest,
} from "@/types"
import { appendMajordomoMessage } from "@/services/conversation"
import { eventBus } from "@/services/event-bus"
import { createLogger } from "@/services/logger"

const log = createLogger("Majordomo")

interface MajordomoState {
  messages: Message[]
  workspaceSummaries: WorkspaceSummary[]
  isStreaming: boolean
  selectedProviderId: string
  selectedModelId: string
  activeToolActivities: ToolActivity[]
  pendingPermissions: PermissionRequest[]
  // actions
  setMessages: (messages: Message[]) => void
  appendMessage: (message: Message) => void
  /** Add a message to state only — no persistence (use for streaming placeholders) */
  pushMessageDraft: (message: Message) => void
  updateLastMessage: (patch: Partial<Message>) => void
  /** Remove the last message if it's an empty assistant draft (cleanup after silent turns) */
  removeDraftIfEmpty: () => void
  clearMessages: () => void
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
  messages: [],
  workspaceSummaries: [],
  isStreaming: false,
  selectedProviderId: "",
  selectedModelId: "",
  activeToolActivities: [],
  pendingPermissions: [],

  setMessages: (messages) => set({ messages }),

  appendMessage: (message) => {
    set((state) => ({ messages: [...state.messages, message] }))
    // Persist to disk asynchronously
    appendMajordomoMessage(message).catch((err: unknown) =>
      log.warn("Failed to persist message", err)
    )
  },

  pushMessageDraft: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateLastMessage: (patch) =>
    set((state) => {
      const msgs = state.messages
      if (msgs.length === 0) return state
      return {
        messages: msgs.map((m, i) => (i === msgs.length - 1 ? { ...m, ...patch } : m)),
      }
    }),

  removeDraftIfEmpty: () =>
    set((state) => {
      const msgs = state.messages
      if (msgs.length === 0) return state
      const last = msgs[msgs.length - 1]
      if (last.role === "assistant" && !last.content.trim()) {
        return { messages: msgs.slice(0, -1) }
      }
      return state
    }),

  clearMessages: () => set({ messages: [] }),

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
    const { appendMessage: append } = useMajordomoStore.getState()
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
    append(notif)
  })
}
