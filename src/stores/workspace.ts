import { create } from "zustand"
import type { Workspace, WorkspaceStatus } from "@/types"

/**
 * Migrate legacy workspace.mcpDependencies → workspace.orchestratorConfig.mcpDependencies.
 * Returns the workspace unchanged if already migrated or no legacy deps exist.
 */
function migrateWorkspaceMcpDeps(ws: Workspace): Workspace {
  if (!ws.mcpDependencies?.length) return ws
  if (ws.orchestratorConfig?.mcpDependencies?.length) return ws // already migrated
  return {
    ...ws,
    orchestratorConfig: {
      ...ws.orchestratorConfig,
      mcpDependencies: ws.mcpDependencies,
    },
  }
}

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  // actions
  setWorkspaces: (workspaces: Workspace[]) => void
  addWorkspace: (workspace: Workspace) => void
  updateWorkspace: (id: string, patch: Partial<Workspace>) => void
  removeWorkspace: (id: string) => void
  setActiveWorkspace: (id: string) => void
  updateStatus: (id: string, status: WorkspaceStatus, snippet?: string) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  activeWorkspaceId: null,

  setWorkspaces: (workspaces) =>
    set({ workspaces: workspaces.map(migrateWorkspaceMcpDeps) }),

  addWorkspace: (workspace) =>
    set((state) => ({ workspaces: [...state.workspaces, workspace] })),

  updateWorkspace: (id, patch) =>
    set((state) => ({
      workspaces: state.workspaces.map((ws) =>
        ws.id === id ? { ...ws, ...patch, updatedAt: new Date().toISOString() } : ws
      ),
    })),

  removeWorkspace: (id) =>
    set((state) => ({
      workspaces: state.workspaces.filter((ws) => ws.id !== id),
      activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
    })),

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

  updateStatus: (id, status, snippet) =>
    set((state) => ({
      workspaces: state.workspaces.map((ws) =>
        ws.id === id
          ? {
              ...ws,
              status,
              stateSummary: snippet ?? ws.stateSummary,
              lastActivity: new Date().toISOString(),
            }
          : ws
      ),
    })),
}))
