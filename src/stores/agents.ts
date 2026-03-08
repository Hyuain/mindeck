import { create } from "zustand"

export interface SubAgentInfo {
  name: string
  status: "running" | "done" | "error"
}

interface AgentsState {
  /** workspaceId → list of recently active sub-agents */
  subAgents: Record<string, SubAgentInfo[]>

  upsertSubAgent: (workspaceId: string, name: string, status: SubAgentInfo["status"]) => void
  clearSubAgents: (workspaceId: string) => void
}

export const useAgentsStore = create<AgentsState>()((set) => ({
  subAgents: {},

  upsertSubAgent: (workspaceId, name, status) =>
    set((state) => {
      const current = state.subAgents[workspaceId] ?? []
      const exists = current.some((a) => a.name === name)
      const updated = exists
        ? current.map((a) => (a.name === name ? { ...a, status } : a))
        : [...current, { name, status }]
      return { subAgents: { ...state.subAgents, [workspaceId]: updated } }
    }),

  clearSubAgents: (workspaceId) =>
    set((state) => ({ subAgents: { ...state.subAgents, [workspaceId]: [] } })),
}))
