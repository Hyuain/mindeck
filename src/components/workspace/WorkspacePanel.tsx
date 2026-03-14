import { useEffect, useState } from "react"
import type { Workspace } from "@/types"
import { FileExplorer } from "./FileExplorer"
import { resolveContentRoot } from "@/services/workspace/content-root"

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
      {contentRoot
        ? <FileExplorer key={contentRoot} contentRoot={contentRoot} />
        : <div className="fe-status">Resolving path…</div>
      }
    </div>
  )
}
