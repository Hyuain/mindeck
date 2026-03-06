import { Plus } from "lucide-react"
import type { Workspace } from "@/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { createWorkspace, newWorkspace } from "@/services/workspace"
import { useProviderStore } from "@/stores/provider"

interface WorkspaceTabBarProps {
  workspaces: Workspace[]
  activeId: string | null
}

export function WorkspaceTabBar({ workspaces, activeId }: WorkspaceTabBarProps) {
  const { setActiveWorkspace, addWorkspace } = useWorkspaceStore()
  const { providers } = useProviderStore()

  async function handleNew() {
    const defaultProvider = providers[0]
    const ws = newWorkspace(
      `Workspace ${workspaces.length + 1}`,
      defaultProvider?.id ?? "ollama",
      defaultProvider?.models?.[0]?.id ?? "llama3.2"
    )
    try {
      await createWorkspace(ws)
      addWorkspace(ws)
      setActiveWorkspace(ws.id)
    } catch (err) {
      console.error("Failed to create workspace:", err)
    }
  }

  return (
    <div className="tabbar">
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          className={`ws-tab${ws.id === activeId ? " on" : ""}`}
          onClick={() => setActiveWorkspace(ws.id)}
          title={ws.name}
        >
          <span className="tab-icon">{ws.icon ?? "📁"}</span>
          <span>{ws.name}</span>
          {ws.status === "active" && <span className="tab-dot" />}
        </button>
      ))}
      <button className="tab-new" onClick={handleNew}>
        <Plus size={13} />
        New workspace
      </button>
    </div>
  )
}
