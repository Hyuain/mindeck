import { useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import { useLayoutStore, type SerializedPane } from "@/stores/layout"
import { PaneContent } from "./PaneContent"
import { updateSizesInTree, removePaneFromTree } from "./layoutHelpers"
import { useWorkspaceDrag } from "./useWorkspaceDrag"

export type PaneType = "agent" | "file" | "agent-app"

export interface Pane {
  id: string
  type: PaneType
  title: string
  workspaceId?: string
  filePath?: string
  appId?: string
  /** Optional pre-rendered content - if not provided, renderContent will be used */
  content?: ReactNode
}

export interface SplitLayout {
  direction: "horizontal" | "vertical"
  sizes: number[] // percentages
}

// Tree-based layout for unlimited splits
export type PaneNode =
  | { type: "pane"; paneId: string }
  | {
      type: "split"
      direction: "horizontal" | "vertical"
      sizes: number[]
      children: [PaneNode, PaneNode]
    }

interface FlexibleWorkspaceProps {
  /** Workspace ID used for layout persistence */
  workspaceId?: string
  /** Initial panes to display */
  initialPanes?: Pane[]
  /** Callback when panes change */
  onPanesChange?: (panes: Pane[]) => void
  /** Render function for pane content — receives the pane and a close handler */
  renderContent?: (pane: Pane, onClose: () => void) => ReactNode
}

// ---- Main component ----

export function FlexibleWorkspace({
  workspaceId,
  initialPanes = [],
  onPanesChange,
  renderContent,
}: FlexibleWorkspaceProps) {
  const [panes, setPanes] = useState<Pane[]>(() => {
    if (workspaceId) {
      const saved = useLayoutStore.getState().workspaceLayouts[workspaceId]
      if (saved?.panes.length) return saved.panes as Pane[]
    }
    return initialPanes
  })
  const [layout, setLayout] = useState<PaneNode | null>(() => {
    if (workspaceId) {
      const saved = useLayoutStore.getState().workspaceLayouts[workspaceId]
      return saved?.layout ?? null
    }
    return null
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const panesRef = useRef(panes)
  const layoutRef = useRef(layout)
  const onPanesChangeRef = useRef(onPanesChange)

  panesRef.current = panes
  layoutRef.current = layout
  onPanesChangeRef.current = onPanesChange

  // Drag & drop handling (extracted hook)
  const {
    dragPreview,
    dropPosition,
    dropTarget,
    setDropTarget,
    handlePointerEnter,
    handlePointerLeave,
    handlePointerMove,
  } = useWorkspaceDrag({
    containerRef,
    layoutRef,
    panesRef,
    onPanesChangeRef,
    setLayout,
    setPanes,
  })

  // Notify parent of restored panes on mount
  useEffect(() => {
    if (panesRef.current.length > 0) {
      onPanesChangeRef.current?.(panesRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced save of layout to persistent store
  useEffect(() => {
    if (!workspaceId) return
    const t = setTimeout(() => {
      useLayoutStore.getState().setWorkspaceLayout(workspaceId, {
        panes: [...panes].map(({ id, type, title, workspaceId: wsId, filePath }) => ({
          id,
          type,
          title,
          workspaceId: wsId,
          filePath,
        })) as SerializedPane[],
        layout,
      })
    }, 500)
    return () => clearTimeout(t)
  }, [layout, panes, workspaceId])

  // ---- Split handle resize ----
  const updateSplitSizes = useCallback(
    (targetKey: string, newSizes: [number, number]) => {
      setLayout((prev) => {
        if (!prev) return prev
        return updateSizesInTree(prev, "root", targetKey, newSizes)
      })
    },
    []
  )

  const handleSplitResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, nodeKey: string, isHorizontal: boolean) => {
      e.preventDefault()
      e.stopPropagation()
      const handle = e.currentTarget
      handle.setPointerCapture(e.pointerId)
      handle.classList.add("resizing")
      document.body.style.userSelect = "none"

      const container = handle.parentElement!
      const c0 = container.querySelector<HTMLElement>(
        `[data-split-key="${nodeKey}"][data-child-index="0"]`
      )!
      const c1 = container.querySelector<HTMLElement>(
        `[data-split-key="${nodeKey}"][data-child-index="1"]`
      )!

      const totalSize = isHorizontal ? container.offsetWidth : container.offsetHeight
      if (totalSize <= 0) {
        handle.classList.remove("resizing")
        return
      }

      const startPos = isHorizontal ? e.clientX : e.clientY
      const startSize0 = isHorizontal ? c0.offsetWidth : c0.offsetHeight

      const onMove = (me: PointerEvent) => {
        const delta = (isHorizontal ? me.clientX : me.clientY) - startPos
        const pct = ((startSize0 + delta) / totalSize) * 100
        const newPct0 = Math.max(10, Math.min(90, isNaN(pct) ? 50 : pct))
        c0.style.flex = `0 0 ${newPct0}%`
        c1.style.flex = `0 0 ${100 - newPct0}%`
      }

      const onUp = () => {
        const finalRaw = isHorizontal
          ? (c0.offsetWidth / totalSize) * 100
          : (c0.offsetHeight / totalSize) * 100
        const finalPct0 = Math.max(10, Math.min(90, isNaN(finalRaw) ? 50 : finalRaw))
        handle.classList.remove("resizing")
        document.body.style.userSelect = ""
        handle.removeEventListener("pointermove", onMove)
        handle.removeEventListener("pointerup", onUp)
        updateSplitSizes(nodeKey, [finalPct0, 100 - finalPct0])
      }

      handle.addEventListener("pointermove", onMove)
      handle.addEventListener("pointerup", onUp)
    },
    [updateSplitSizes]
  )

  // ---- Pane management ----
  const removePane = useCallback(
    (paneId: string) => {
      const newPanes = panes.filter((p) => p.id !== paneId)
      setPanes(newPanes)

      if (layout) {
        const newLayout = removePaneFromTree(layout, paneId)
        setLayout(newLayout)
      }

      onPanesChange?.(newPanes)
    },
    [panes, layout, onPanesChange]
  )

  const getPaneById = useCallback(
    (paneId: string): Pane | undefined => panes.find((p) => p.id === paneId),
    [panes]
  )

  // ---- Render ----

  const renderLayout = (node: PaneNode, nodeKey: string = "root"): ReactNode => {
    if (node.type === "pane") {
      const pane = getPaneById(node.paneId)
      if (!pane) return null

      return (
        <PaneContent
          key={node.paneId}
          pane={pane}
          onClose={() => removePane(pane.id)}
          renderContent={renderContent}
          showDragOverlay={!!dragPreview}
          dropTarget={dropTarget}
          onDropTarget={setDropTarget}
        />
      )
    }

    const isHorizontal = node.direction === "horizontal"
    const [child0, child1] = node.children
    const key0 = nodeKey + "-0"
    const key1 = nodeKey + "-1"

    return (
      <div
        key={`split-${nodeKey}`}
        className={`ws-split-container ${isHorizontal ? "horizontal" : "vertical"}`}
        style={{
          display: "flex",
          flexDirection: isHorizontal ? "row" : "column",
          flex: 1,
        }}
      >
        <div
          className="ws-split-child"
          data-split-key={nodeKey}
          data-child-index="0"
          style={{
            flex: `0 0 ${node.sizes[0]}%`,
            [isHorizontal ? "height" : "width"]: "100%",
            display: "flex",
            flexDirection: isHorizontal ? "row" : "column",
            minHeight: 0,
            minWidth: 0,
          }}
        >
          {renderLayout(child0, key0)}
        </div>

        <div
          className={`ws-split ${isHorizontal ? "horizontal" : "vertical"}`}
          onPointerDown={(e) => handleSplitResize(e, nodeKey, isHorizontal)}
        />

        <div
          className="ws-split-child"
          data-split-key={nodeKey}
          data-child-index="1"
          style={{
            flex: `0 0 ${node.sizes[1]}%`,
            [isHorizontal ? "height" : "width"]: "100%",
            display: "flex",
            flexDirection: isHorizontal ? "row" : "column",
            minHeight: 0,
            minWidth: 0,
          }}
        >
          {renderLayout(child1, key1)}
        </div>
      </div>
    )
  }

  const renderEmptyState = () => (
    <div className={`ws-pane-empty ${dragPreview ? "drag-over" : ""}`}>
      <div>
        <div>Drop files or agents here</div>
        <div
          style={{
            fontSize: "11px",
            color: "var(--color-t2)",
            marginTop: "8px",
            opacity: 0.7,
          }}
        >
          Drag from the file tree to create a workspace pane
        </div>
      </div>
    </div>
  )

  return (
    <div
      ref={containerRef}
      className={`flexible-workspace ${dragPreview ? "has-drag-preview" : ""}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      style={{ display: "flex", flexDirection: "column", flex: 1, position: "relative" }}
    >
      {dragPreview && !dropTarget && dropPosition && (
        <div className={`ws-edge-indicator ${dropPosition}`} />
      )}

      {layout ? renderLayout(layout) : renderEmptyState()}
    </div>
  )
}
