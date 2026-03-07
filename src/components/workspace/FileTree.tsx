import { useRef, useState } from "react"
import { ChevronDown, ChevronRight, File, Folder } from "lucide-react"
import type { FileNode } from "@/types"

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
  node, tree, expanded, selectedPath, depth,
  onToggle, onSelect, onRename, onDelete, onDrop,
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
        onClick={() => { onSelect(node.path); if (node.isDir) onToggle(node) }}
        onDoubleClick={startEdit}
        onKeyDown={handleRowKeyDown}
        tabIndex={0}
        role="treeitem"
        aria-selected={isSelected}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/plain", node.path)}
        onDragOver={(e) => { if (node.isDir) { e.preventDefault(); setDragOver(true) } }}
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
          {node.isDir
            ? (isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
            : <span style={{ width: 11, display: "inline-block" }} />}
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
