import { create } from "zustand"
import type { Message, WorkspaceSummary } from "@/types"

interface MajordomoState {
  messages: Message[]
  workspaceSummaries: WorkspaceSummary[]
  isStreaming: boolean
  selectedProviderId: string
  selectedModelId: string
  // actions
  appendMessage: (message: Message) => void
  updateLastMessage: (patch: Partial<Message>) => void
  setStreaming: (streaming: boolean) => void
  updateSummary: (summary: WorkspaceSummary) => void
  setSummaries: (summaries: WorkspaceSummary[]) => void
  setModel: (providerId: string, modelId: string) => void
}

export const useMajordomoStore = create<MajordomoState>((set) => ({
  messages: [],
  workspaceSummaries: [],
  isStreaming: false,
  selectedProviderId: "",
  selectedModelId: "",

  appendMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateLastMessage: (patch) =>
    set((state) => {
      const msgs = state.messages
      if (msgs.length === 0) return state
      return {
        messages: msgs.map((m, i) => (i === msgs.length - 1 ? { ...m, ...patch } : m)),
      }
    }),

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
}))
