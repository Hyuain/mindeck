import { useEffect, useState, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { FilePlus, FolderPlus, RefreshCw } from "lucide-react"
import type { FileNode } from "@/types"
import { modal } from "@/components/ui/modal"
import { FileTree } from "./FileTree"

interface FileExplorerProps {
  contentRoot: string
}

export function FileExplorer({ contentRoot }: FileExplorerProps) {
  // Map from directory path → children
  const [tree, setTree] = useState<Record<string, FileNode[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set([contentRoot]))
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadDir(dirPath: string) {
    try {
      const nodes = await invoke<FileNode[]>("list_dir", { path: dirPath })
      setTree((prev) => ({ ...prev, [dirPath]: nodes }))
    } catch (err) {
      setError(String(err))
    }
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await loadDir(contentRoot)
      // Reload all currently expanded subdirectories
      await Promise.all(
        [...expanded].filter((p) => p !== contentRoot).map((p) => loadDir(p))
      )
    } finally {
      setLoading(false)
    }
  }, [contentRoot, expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load root on mount / when contentRoot changes
  useEffect(() => {
    setLoading(true)
    loadDir(contentRoot).finally(() => setLoading(false))
  }, [contentRoot]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh when app window regains focus
  useEffect(() => {
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [refresh])

  async function handleToggle(node: FileNode) {
    if (!node.isDir) return
    const next = new Set(expanded)
    if (next.has(node.path)) {
      next.delete(node.path)
    } else {
      next.add(node.path)
      if (!tree[node.path]) {
        await loadDir(node.path)
      }
    }
    setExpanded(next)
  }

  async function handleRename(oldPath: string, newName: string) {
    const dir = oldPath.substring(0, oldPath.lastIndexOf("/"))
    const newPath = `${dir}/${newName}`
    try {
      await invoke("rename_path", { oldPath, newPath })
      await loadDir(dir)
    } catch (err) {
      console.error("Rename failed:", err)
    }
  }

  function handleDelete(node: FileNode) {
    const dir = node.path.substring(0, node.path.lastIndexOf("/"))
    modal.confirm({
      message: `Delete "${node.name}"?`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        try {
          await invoke("delete_path", { path: node.path })
          await loadDir(dir)
        } catch (err) {
          console.error("Delete failed:", err)
        }
      },
    })
  }

  async function handleDrop(srcPath: string, targetDir: string) {
    const parts = srcPath.split("/")
    const name = parts[parts.length - 1] ?? ""
    const newPath = `${targetDir}/${name}`
    if (newPath === srcPath) return
    try {
      await invoke("rename_path", { oldPath: srcPath, newPath })
      const srcDir = srcPath.substring(0, srcPath.lastIndexOf("/"))
      await Promise.all([loadDir(srcDir), loadDir(targetDir)])
    } catch (err) {
      console.error("Move failed:", err)
    }
  }

  async function handleCreateFile() {
    const dir = selectedPath
      ? tree[selectedPath]
        ? selectedPath
        : selectedPath.substring(0, selectedPath.lastIndexOf("/"))
      : contentRoot
    const name = prompt("File name:")
    if (!name) return
    try {
      await invoke("create_file", { path: `${dir}/${name}` })
      await loadDir(dir)
    } catch (err) {
      console.error("Create file failed:", err)
    }
  }

  async function handleCreateDir() {
    const dir = selectedPath
      ? tree[selectedPath]
        ? selectedPath
        : selectedPath.substring(0, selectedPath.lastIndexOf("/"))
      : contentRoot
    const name = prompt("Folder name:")
    if (!name) return
    try {
      await invoke("create_dir_at", { path: `${dir}/${name}` })
      await loadDir(dir)
    } catch (err) {
      console.error("Create dir failed:", err)
    }
  }

  return (
    <div className="file-explorer">
      <div className="fe-toolbar">
        <button className="fe-tool-btn" onClick={handleCreateFile} title="New file">
          <FilePlus size={12} />
        </button>
        <button className="fe-tool-btn" onClick={handleCreateDir} title="New folder">
          <FolderPlus size={12} />
        </button>
        <button
          className={`fe-tool-btn${loading ? " fe-refreshing" : ""}`}
          onClick={refresh}
          title="Refresh"
          disabled={loading}
        >
          <RefreshCw size={12} />
        </button>
      </div>
      {loading && <div className="fe-status">Loading…</div>}
      {error && <div className="fe-status fe-error">{error}</div>}
      {!loading && tree[contentRoot] && (
        <FileTree
          nodes={tree[contentRoot]}
          tree={tree}
          expanded={expanded}
          selectedPath={selectedPath}
          depth={0}
          onToggle={handleToggle}
          onSelect={setSelectedPath}
          onRename={handleRename}
          onDelete={handleDelete}
          onDrop={handleDrop}
        />
      )}
    </div>
  )
}
