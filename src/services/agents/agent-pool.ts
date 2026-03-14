/**
 * AgentPool — global singleton that keeps one WorkspaceAgent per workspace
 * always connected to the EventBus.
 *
 * This ensures Majordomo dispatches are received even when the target
 * workspace's ChatPanel is not mounted (i.e. not the active/visible pane).
 *
 * ChatPanel registers UI callbacks on mount and clears them on unmount.
 * Dispatch handling and task recovery happen independently of any UI.
 */
import { WorkspaceAgent, type AgentDeps, type UICallbacks } from "./workspace-agent"
import { useChatStore } from "@/stores/chat"
import { useProviderStore } from "@/stores/provider"
import type { Workspace } from "@/types"

function makeRealDeps(): AgentDeps {
  return {
    getMessages: (id) => useChatStore.getState().messages[id] ?? [],
    appendMessage: (id, msg) => useChatStore.getState().appendMessage(id, msg),
    updateLastMessage: (id, patch) =>
      useChatStore.getState().updateLastMessage(id, patch),
    getProvider: (id) => useProviderStore.getState().providers.find((p) => p.id === id),
    setStreaming: (id, s) => useChatStore.getState().setStreaming(id, s),
  }
}

class AgentPool {
  private agents = new Map<string, WorkspaceAgent>()

  /** Return the existing agent for a workspace, or create + connect a new one. */
  getOrCreate(workspace: Workspace): WorkspaceAgent {
    const existing = this.agents.get(workspace.id)
    if (existing) {
      existing.updateConfig(workspace)
      return existing
    }
    const agent = new WorkspaceAgent(workspace, makeRealDeps())
    agent.connect()
    this.agents.set(workspace.id, agent)
    return agent
  }

  /** Get agent if it exists (for UI callback registration). */
  get(workspaceId: string): WorkspaceAgent | undefined {
    return this.agents.get(workspaceId)
  }

  /** Update config of an existing agent (e.g. model change). */
  update(workspace: Workspace): void {
    this.agents.get(workspace.id)?.updateConfig(workspace)
  }

  /** Disconnect and remove an agent (e.g. workspace deleted). */
  remove(workspaceId: string): void {
    this.agents.get(workspaceId)?.disconnect()
    this.agents.delete(workspaceId)
  }

  /** Connect agents for all workspaces at app startup. */
  initAll(workspaces: Workspace[]): void {
    // Disconnect agents for workspaces that no longer exist
    const currentIds = new Set(workspaces.map((w) => w.id))
    for (const id of this.agents.keys()) {
      if (!currentIds.has(id)) this.remove(id)
    }
    // Create/update for all current workspaces
    for (const ws of workspaces) {
      this.getOrCreate(ws)
    }
  }
}

export const agentPool = new AgentPool()

/** Convenience: register UI callbacks from ChatPanel on mount. */
export function registerChatCallbacks(workspaceId: string, callbacks: UICallbacks): void {
  agentPool.get(workspaceId)?.setCallbacks(callbacks)
}

/** Convenience: clear UI callbacks on ChatPanel unmount. */
export function clearChatCallbacks(workspaceId: string): void {
  agentPool.get(workspaceId)?.clearCallbacks()
}
