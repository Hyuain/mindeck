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
    resolveContentRoot(workspace).then(setContentRoot).catch(console.error)
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

/**
 * Resolve the "project content root" for a workspace.
 *
 * - linked workspace: the imported folder path (repoPath)
 * - internal workspace: ~/.mindeck/workspaces/<id>/files/
 *
 * This is what the Files panel shows — NOT the workspace storage directory
 * (conversations/, knowledge/, etc. are hidden from the user).
 */
export async function resolveContentRoot(workspace: Workspace): Promise<string> {
  if (workspace.workspaceType === "linked" && workspace.repoPath) {
    return workspace.repoPath
  }
  try {
    const { homeDir } = await import("@tauri-apps/api/path")
    const home = await homeDir()
    return `${home}/.mindeck/workspaces/${workspace.id}/files`
  } catch {
    // Browser/dev mode fallback
    return `~/.mindeck/workspaces/${workspace.id}/files`
  }
}
