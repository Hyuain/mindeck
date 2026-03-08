import { useRef, useState } from "react"
import { ChevronDown, ChevronRight, File, Folder } from "lucide-react"
import type { FileNode } from "@/types"
import { useDragState } from "@/services/dragState"

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
  const indent = depth * 14

  return (
    <>
      <div
        className={`ft-row${isSelected ? " selected" : ""}${dragOver ? " drag-over" : ""}`}
        style={{ paddingLeft: 8 + indent }}
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

          const now = () => new Date().toISOString().split("T")[1].slice(0, -1)

          console.log(`[${now()}] [FileTree] === POINTER DOWN START ===`)
          console.log(`[${now()}] [FileTree] node: ${node.path}`)

          const dragData = {
            id: `file-${Date.now()}-${node.path}`,
            type: "file" as const,
            title: node.name,
            filePath: node.path,
          }

          // Use global Zustand store for cross-component drag state
          useDragState.getState().setDragging(dragData)

          // Also store in sessionStorage as fallback/debug
          sessionStorage.setItem("pointer-drag-active", "true")

          console.log(`[${now()}] [FileTree] Global drag state set:`, dragData)

          // Create cursor-following preview element
          const previewEl = document.createElement("div")
          previewEl.id = "drag-preview-cursor"
          previewEl.textContent = node.name
          previewEl.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 9999;
            padding: 6px 12px;
            background: var(--color-ac, #10b981);
            color: white;
            border-radius: 4px;
            font-size: 12px;
            font-family: var(--font-sans);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            white-space: nowrap;
            transform: translate(10px, 10px);
          `
          document.body.appendChild(previewEl)

          // Track pointer position to follow cursor
          const handlePointerMove = (moveEvent: PointerEvent) => {
            previewEl.style.left = moveEvent.clientX + "px"
            previewEl.style.top = moveEvent.clientY + "px"
          }

          // Clean up on pointer up - but DON'T clear storage flags here
          // Let FlexibleWorkspace handle the drop processing and cleanup
          const handlePointerUp = () => {
            const nowStr = () => new Date().toISOString().split("T")[1].slice(0, -1)
            console.log(`[${nowStr()}] [FileTree] === POINTER UP (cleanup only) ===`)

            // Clean up preview and listeners
            previewEl.remove()
            document.removeEventListener("pointermove", handlePointerMove)
            document.removeEventListener("pointerup", handlePointerUp)
            document.removeEventListener("pointercancel", handlePointerUp)

            // DO NOT clear sessionStorage flags here - let FlexibleWorkspace handle drop
            console.log(
              `[${nowStr()}] [FileTree] Cleanup done, waiting for FlexibleWorkspace`
            )
          }

          document.addEventListener("pointermove", handlePointerMove)
          document.addEventListener("pointerup", handlePointerUp)
          document.addEventListener("pointercancel", handlePointerUp)

          console.log("[FileTree] Pointer drag initialized")
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
          {node.isDir ? <Folder size={12} /> : <File size={12} />}
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
