import { useEffect, useState } from "react"
import { Files } from "lucide-react"
import type { Workspace } from "@/types"
import { FileExplorer } from "./FileExplorer"

interface WorkspacePanelProps {
  workspace: Workspace
}

export function WorkspacePanel({ workspace }: WorkspacePanelProps) {
  const [contentRoot, setContentRoot] = useState<string | null>(null)

  useEffect(() => {
    if (workspace.workspaceType === "linked" && workspace.repoPath) {
      setContentRoot(workspace.repoPath)
      return
    }
    // For internal workspaces, resolve via Tauri path API
    resolveInternalRoot(workspace.id).then(setContentRoot).catch(console.error)
  }, [workspace.id, workspace.workspaceType, workspace.repoPath])

  return (
    <div className="ws-panel">
      <div className="ws-panel-tabs">
        <button className="ws-panel-tab on">
          <Files size={12} />
          <span>Files</span>
        </button>
      </div>
      {contentRoot ? (
        <FileExplorer key={contentRoot} contentRoot={contentRoot} />
      ) : (
        <div className="fe-status">Resolving path…</div>
      )}
    </div>
  )
}

async function resolveInternalRoot(workspaceId: string): Promise<string> {
  try {
    const { homeDir } = await import("@tauri-apps/api/path")
    const home = await homeDir()
    return `${home}/.mindeck/workspaces/${workspaceId}`
  } catch {
    // Browser/dev mode fallback
    return `~/.mindeck/workspaces/${workspaceId}`
  }
}
