import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import { useWorkspaceStore } from "./workspace"
import { mcpManager } from "@/services/mcp/manager"
import type { AgentAppManifest, AppInstance, MCPDependency } from "@/types"

interface AgentAppsState {
  // ── Global catalog ───────────────────────────────────────────
  /** All globally installed Agent Apps (native + user-installed) */
  installedApps: AgentAppManifest[]

  setInstalledApps(apps: AgentAppManifest[]): void
  addApp(app: AgentAppManifest): void
  removeApp(appId: string): void

  // ── Workspace activation ─────────────────────────────────────
  /**
   * Activate an Agent App in a workspace.
   * Generates a new instanceId and connects MCPs for that instance.
   */
  activateApp(workspaceId: string, appId: string, label?: string): void
  /**
   * Deactivate (and disconnect) a specific app instance from a workspace.
   */
  deactivateApp(workspaceId: string, instanceId: string): void

  // ── Legacy per-workspace dep state (kept for backward compat) ─
  /** Per-workspace MCP dependencies: workspaceId → deps */
  workspaceDeps: Record<string, MCPDependency[]>
  /** Per-workspace installed Agent Apps: workspaceId → apps (legacy) */
  workspaceApps: Record<string, AgentAppManifest[]>

  setDeps(workspaceId: string, deps: MCPDependency[]): void
  updateDepStatus(workspaceId: string, name: string, patch: Partial<MCPDependency>): void
  setApps(workspaceId: string, apps: AgentAppManifest[]): void

  addDep(workspaceId: string, dep: MCPDependency): void
  removeDep(workspaceId: string, depName: string): void
  updateDep(workspaceId: string, depName: string, patch: Partial<MCPDependency>): void
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Persist the workspace's activatedApps to disk (via update_workspace).
 * Fire-and-forget — failures are logged but never thrown.
 */
async function persistActivatedApps(
  workspaceId: string,
  activatedApps: AppInstance[]
): Promise<void> {
  const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)
  if (!ws) return
  const updated = { ...ws, activatedApps, updatedAt: new Date().toISOString() }
  useWorkspaceStore.getState().updateWorkspace(workspaceId, { activatedApps })
  try {
    await invoke("update_workspace", { workspace: updated })
  } catch (err) {
    console.warn("[AgentAppsStore] Failed to persist activatedApps", err)
  }
}

/**
 * Persist the global app registry (excluding native apps) to disk.
 * Fire-and-forget.
 */
async function persistAppRegistry(apps: AgentAppManifest[]): Promise<void> {
  // Native apps are always seeded in memory — don't write them to disk
  const toSave = apps.filter((a) => !a.nativeComponent)
  try {
    await invoke("save_app_registry", { apps: toSave })
  } catch (err) {
    console.warn("[AgentAppsStore] Failed to persist app registry", err)
  }
}

/**
 * Persist workspace MCP dependencies (legacy path).
 */
async function persistDeps(workspaceId: string, deps: MCPDependency[]): Promise<void> {
  const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)
  if (!ws) return
  const updated = { ...ws, mcpDependencies: deps, updatedAt: new Date().toISOString() }
  useWorkspaceStore.getState().updateWorkspace(workspaceId, { mcpDependencies: deps })
  try {
    await invoke("update_workspace", { workspace: updated })
  } catch (err) {
    console.warn("[AgentAppsStore] Failed to persist workspace deps", err)
  }
}

// ─── Store ────────────────────────────────────────────────────

export const useAgentAppsStore = create<AgentAppsState>()((set, get) => ({
  installedApps: [],
  workspaceDeps: {},
  workspaceApps: {},

  // ── Global catalog ───────────────────────────────────────────

  setInstalledApps: (apps) => set({ installedApps: apps }),

  addApp: (app) => {
    const current = get().installedApps
    if (current.some((a) => a.id === app.id)) return // deduplicate
    const next = [...current, app]
    set({ installedApps: next })
    persistAppRegistry(next)
  },

  removeApp: (appId) => {
    const next = get().installedApps.filter((a) => a.id !== appId)
    set({ installedApps: next })
    persistAppRegistry(next)
  },

  // ── Workspace activation ─────────────────────────────────────

  activateApp: (workspaceId, appId, label) => {
    const manifest = get().installedApps.find((a) => a.id === appId)
    if (!manifest) {
      console.warn("[AgentAppsStore] activateApp: manifest not found", appId)
      return
    }

    const instanceId = crypto.randomUUID()
    const instance: AppInstance = { instanceId, appId, ...(label ? { label } : {}) }

    // Update workspace store in-memory
    const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)
    if (!ws) return
    const updatedInstances = [...(ws.activatedApps ?? []), instance]

    persistActivatedApps(workspaceId, updatedInstances)

    // Connect MCP servers for this instance (non-blocking)
    if (manifest.mcpDependencies && manifest.mcpDependencies.length > 0) {
      mcpManager
        .connectAppInstance(instanceId, manifest)
        .catch((err: unknown) =>
          console.warn("[AgentAppsStore] Failed to connect app instance MCPs", err)
        )
    }
  },

  deactivateApp: (workspaceId, instanceId) => {
    const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)
    if (!ws) return
    const updatedInstances = (ws.activatedApps ?? []).filter(
      (inst) => inst.instanceId !== instanceId
    )

    persistActivatedApps(workspaceId, updatedInstances)

    // Disconnect all MCPs for this instance (non-blocking)
    mcpManager.disconnectInstance(instanceId).catch(() => {})
  },

  // ── Legacy dep state ─────────────────────────────────────────

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

  addDep: (workspaceId, dep) => {
    const existingDeps = get().workspaceDeps[workspaceId] ?? []
    const newDeps = [...existingDeps, dep]
    set((state) => ({
      workspaceDeps: { ...state.workspaceDeps, [workspaceId]: newDeps },
    }))
    persistDeps(workspaceId, newDeps)
  },

  removeDep: (workspaceId, depName) => {
    const existingDeps = get().workspaceDeps[workspaceId] ?? []
    const newDeps = existingDeps.filter((d) => d.name !== depName)
    set((state) => ({
      workspaceDeps: { ...state.workspaceDeps, [workspaceId]: newDeps },
    }))
    persistDeps(workspaceId, newDeps)
  },

  updateDep: (workspaceId, depName, patch) => {
    const existingDeps = get().workspaceDeps[workspaceId] ?? []
    const newDeps = existingDeps.map((d) => (d.name === depName ? { ...d, ...patch } : d))
    set((state) => ({
      workspaceDeps: { ...state.workspaceDeps, [workspaceId]: newDeps },
    }))
    persistDeps(workspaceId, newDeps)
  },
}))
