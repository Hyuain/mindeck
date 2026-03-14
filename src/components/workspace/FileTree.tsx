import { useRef, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FileText,
  FileImage,
  Braces,
  Globe,
  File,
  Folder,
  FolderOpen,
} from "lucide-react"
import type { FileNode } from "@/types"
import { useDragState } from "@/services/drag-state"

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (
    ["ts", "tsx", "js", "jsx", "py", "go", "rs", "rb", "java", "c", "cpp"].includes(ext)
  )
    return <FileCode size={12} />
  if (["md", "txt", "rst"].includes(ext)) return <FileText size={12} />
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext))
    return <FileImage size={12} />
  if (["json", "jsonl", "toml", "yaml", "yml"].includes(ext)) return <Braces size={12} />
  if (["html", "htm", "xml"].includes(ext)) return <Globe size={12} />
  return <File size={12} />
}

interface FileTreeProps {
  nodes: FileNode[]
  tree: Record<string, FileNode[]>
  expanded: Set<string>
  selectedPath: string | null
  depth: number
  onToggle: (node: FileNode) => void
  onSelect: (path: string) => void
  onRename: (oldPath: string, newName: string) => void
  onDelete: (node: FileNode) => void
  onDrop: (srcPath: string, targetDir: string) => void
}

interface RowProps {
  node: FileNode
  tree: Record<string, FileNode[]>
  expanded: Set<string>
  selectedPath: string | null
  depth: number
  onToggle: (node: FileNode) => void
  onSelect: (path: string) => void
  onRename: (oldPath: string, newName: string) => void
  onDelete: (node: FileNode) => void
  onDrop: (srcPath: string, targetDir: string) => void
}

function FileRow({
  node,
  tree,
  expanded,
  selectedPath,
  depth,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  onDrop,
}: RowProps) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(node.name)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setEditVal(node.name)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitEdit() {
    setEditing(false)
    const trimmed = editVal.trim()
    if (trimmed && trimmed !== node.name) {
      onRename(node.path, trimmed)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitEdit()
    if (e.key === "Escape") setEditing(false)
    e.stopPropagation()
  }

  function handleRowKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Backspace" && selectedPath === node.path) {
      onDelete(node)
    }
  }

  const isExpanded = expanded.has(node.path)
  const isSelected = selectedPath === node.path
  const indent = depth * 12

  return (
    <>
      <div
        className={`ft-row${isSelected ? " selected" : ""}${dragOver ? " drag-over" : ""}`}
        style={{ paddingLeft: indent }}
        onClick={() => {
          onSelect(node.path)
          if (node.isDir) onToggle(node)
        }}
        onDoubleClick={startEdit}
        onKeyDown={handleRowKeyDown}
        tabIndex={0}
        role="treeitem"
        aria-selected={isSelected}
        onPointerDown={(e) => {
          // Only start drag on left mouse button
          if (e.button !== 0) return

          e.preventDefault()
          e.stopPropagation()

          const startX = e.clientX
          const startY = e.clientY
          let dragInitialized = false
          let previewEl: HTMLDivElement | null = null

          const dragData = {
            id: `file-${Date.now()}-${node.path}`,
            type: "file" as const,
            title: node.name,
            filePath: node.path,
          }

          const initDrag = (clientX: number, clientY: number) => {
            if (dragInitialized) return
            dragInitialized = true

            useDragState.getState().setDragging(dragData)
            sessionStorage.setItem("pointer-drag-active", "true")

            previewEl = document.createElement("div")
            previewEl.id = "drag-preview-cursor"
            previewEl.textContent = node.name
            previewEl.style.cssText = `
              position: fixed;
              pointer-events: none;
              z-index: 9999;
              padding: 5px 11px;
              background: var(--color-ac, #10b981);
              color: white;
              border-radius: 4px;
              font-size: 12px;
              font-family: var(--font-sans);
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              white-space: nowrap;
              left: ${clientX}px;
              top: ${clientY}px;
              transform: translate(10px, 10px);
            `
            document.body.appendChild(previewEl)
          }

          const handlePointerMove = (moveEvent: PointerEvent) => {
            if (!dragInitialized) {
              const dx = moveEvent.clientX - startX
              const dy = moveEvent.clientY - startY
              if (dx * dx + dy * dy > 25) {
                initDrag(moveEvent.clientX, moveEvent.clientY)
              }
              return
            }
            if (previewEl) {
              previewEl.style.left = moveEvent.clientX + "px"
              previewEl.style.top = moveEvent.clientY + "px"
            }
          }

          const handlePointerUp = () => {
            if (previewEl) previewEl.remove()
            document.removeEventListener("pointermove", handlePointerMove)
            document.removeEventListener("pointerup", handlePointerUp)
            document.removeEventListener("pointercancel", handlePointerUp)

            if (!dragInitialized) {
              // Was just a click — nothing to clean up in FlexibleWorkspace
              sessionStorage.removeItem("pointer-drag-active")
            }
          }

          document.addEventListener("pointermove", handlePointerMove)
          document.addEventListener("pointerup", handlePointerUp)
          document.addEventListener("pointercancel", handlePointerUp)
        }}
        onDragOver={(e) => {
          if (node.isDir) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (node.isDir) {
            const src = e.dataTransfer.getData("text/plain")
            if (src) onDrop(src, node.path)
          }
        }}
      >
        <span className="ft-chevron">
          {node.isDir ? (
            isExpanded ? (
              <ChevronDown size={11} />
            ) : (
              <ChevronRight size={11} />
            )
          ) : (
            <span style={{ width: 11, display: "inline-block" }} />
          )}
        </span>
        <span className="ft-icon">
          {node.isDir ? (
            isExpanded ? (
              <FolderOpen size={12} />
            ) : (
              <Folder size={12} />
            )
          ) : (
            fileIcon(node.name)
          )}
        </span>
        {editing ? (
          <input
            ref={inputRef}
            className="ft-input"
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="ft-name">{node.name}</span>
        )}
      </div>
      {node.isDir && isExpanded && tree[node.path] && (
        <FileTree
          nodes={tree[node.path]}
          tree={tree}
          expanded={expanded}
          selectedPath={selectedPath}
          depth={depth + 1}
          onToggle={onToggle}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          onDrop={onDrop}
        />
      )}
    </>
  )
}

export function FileTree(props: FileTreeProps) {
  return (
    <>
      {props.nodes.map((node) => (
        <FileRow key={node.path} node={node} {...props} />
      ))}
    </>
  )
}
