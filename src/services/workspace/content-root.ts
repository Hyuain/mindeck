import type { Workspace } from "@/types"

/**
 * Resolve the content root directory for a workspace.
 *
 * - linked workspace: the imported folder path (repoPath)
 * - internal workspace: ~/.mindeck/workspaces/<id>/files/
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
    return `~/.mindeck/workspaces/${workspace.id}/files`
  }
}
