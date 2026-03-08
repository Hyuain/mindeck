import { create } from "zustand"
import type { AgentAppManifest, MCPDependency } from "@/types"

interface AgentAppsState {
  /** Per-workspace MCP dependencies: workspaceId → deps */
  workspaceDeps: Record<string, MCPDependency[]>
  /** Per-workspace installed Agent Apps: workspaceId → apps */
  workspaceApps: Record<string, AgentAppManifest[]>

  setDeps(workspaceId: string, deps: MCPDependency[]): void
  updateDepStatus(workspaceId: string, name: string, patch: Partial<MCPDependency>): void
  setApps(workspaceId: string, apps: AgentAppManifest[]): void
}

export const useAgentAppsStore = create<AgentAppsState>()((set) => ({
  workspaceDeps: {},
  workspaceApps: {},

  setDeps: (workspaceId, deps) =>
    set((state) => ({
      workspaceDeps: { ...state.workspaceDeps, [workspaceId]: deps },
    })),

  updateDepStatus: (workspaceId, name, patch) =>
    set((state) => {
      const deps = state.workspaceDeps[workspaceId] ?? []
      return {
        workspaceDeps: {
          ...state.workspaceDeps,
          [workspaceId]: deps.map((d) => (d.name === name ? { ...d, ...patch } : d)),
        },
      }
    }),

  setApps: (workspaceId, apps) =>
    set((state) => ({
      workspaceApps: { ...state.workspaceApps, [workspaceId]: apps },
    })),
}))
