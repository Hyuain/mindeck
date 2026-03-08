import { useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import { useDragState, type DropPosition } from "@/services/dragState"
import { useLayoutStore, type SerializedPane } from "@/stores/layout"

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

interface DropTarget {
  paneId: string
  position: "top" | "bottom" | "left" | "right"
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

// ─── Module-level pure helpers ─────────────────────────────

function updateSizesInTree(
  node: PaneNode,
  currentKey: string,
  targetKey: string,
  sizes: [number, number]
): PaneNode {
  if (node.type === "pane") return node
  if (currentKey === targetKey) return { ...node, sizes }
  return {
    ...node,
    children: [
      updateSizesInTree(node.children[0], currentKey + "-0", targetKey, sizes),
      updateSizesInTree(node.children[1], currentKey + "-1", targetKey, sizes),
    ],
  }
}

function splitPaneInLayout(
  layout: PaneNode,
  targetPaneId: string,
  newPaneId: string,
  position: "top" | "bottom" | "left" | "right"
): PaneNode {
  if (layout.type === "pane") {
    if (layout.paneId !== targetPaneId) return layout
    const direction =
      position === "left" || position === "right" ? "horizontal" : "vertical"
    const putNewFirst = position === "left" || position === "top"
    const newNode: PaneNode = { type: "pane", paneId: newPaneId }
    return {
      type: "split",
      direction,
      sizes: [50, 50],
      children: putNewFirst ? [newNode, layout] : [layout, newNode],
    }
  }
  const [c0, c1] = layout.children
  return {
    ...layout,
    children: [
      splitPaneInLayout(c0, targetPaneId, newPaneId, position),
      splitPaneInLayout(c1, targetPaneId, newPaneId, position),
    ],
  }
}

// ─── Main component ────────────────────────────────────────

export function FlexibleWorkspace({
  workspaceId,
  initialPanes = [],
  onPanesChange,
  renderContent,
}: FlexibleWorkspaceProps) {
  // Flat pane list — initialize from saved layout if available, else from initialPanes
  const [panes, setPanes] = useState<Pane[]>(() => {
    if (workspaceId) {
      const saved = useLayoutStore.getState().workspaceLayouts[workspaceId]
      if (saved?.panes.length) return saved.panes as Pane[]
    }
    return initialPanes
  })
  // Tree-based layout structure — initialize from saved layout if available
  const [layout, setLayout] = useState<PaneNode | null>(() => {
    if (workspaceId) {
      const saved = useLayoutStore.getState().workspaceLayouts[workspaceId]
      return saved?.layout ?? null
    }
    return null
  })
  // Drag state
  const [dragPreview, setDragPreview] = useState<{
    type: PaneType
    title: string
  } | null>(null)
  // Workspace-level drop position (edge indicator)
  const [dropPosition, setDropPositionLocal] = useState<DropPosition>(null)
  // Per-pane drop target
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  // Stable refs to current state (declared early so mount effect below can use them)
  const panesRef = useRef(panes)
  const layoutRef = useRef(layout)
  const isDraggingRef = useRef(false)
  const onPanesChangeRef = useRef(onPanesChange)

  // Notify parent of restored panes on mount (so file content gets loaded)
  useEffect(() => {
    if (panesRef.current.length > 0) {
      onPanesChangeRef.current?.(panesRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount only

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

  // Refs — avoid setState on every pointermove
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null)
  const dropPositionRef = useRef<DropPosition>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)
  const rafRef = useRef<number | null>(null)

  panesRef.current = panes
  layoutRef.current = layout
  onPanesChangeRef.current = onPanesChange
  dropTargetRef.current = dropTarget

  // Subscribe to global drag state
  const globalDragState = useDragState()

  // ── Polling: detect drag state (backup for Tauri where events may not fire) ──
  useEffect(() => {
    let lastPreview: string | null = null
    let isDragging = false

    const interval = setInterval(() => {
      const isMouseDown = (() => {
        if (typeof window === "undefined") return false
        return (
          window.getSelection()?.type === "Dragging" ||
          document.body.classList.contains("dragging")
        )
      })()

      const preview =
        localStorage.getItem("drag-preview") || sessionStorage.getItem("drag-preview")

      if (preview && isMouseDown) {
        isDragging = true
        if (preview !== lastPreview) {
          lastPreview = preview
          try {
            setDragPreview(JSON.parse(preview))
          } catch {
            // ignore
          }
        }
      } else if (isDragging || preview !== lastPreview) {
        isDragging = false
        // Only setState if something actually changed
        if (lastPreview !== null || preview !== null) {
          lastPreview = null
          setDragPreview(null)
          setDropPositionLocal(null)
        }
      }
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // ── Drop position calculation ──────────────────────────────
  const calculateDropPosition = useCallback(
    (clientX: number, clientY: number): DropPosition => {
      const container = containerRef.current
      if (!container) return null

      const rect = container.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const width = rect.width
      const height = rect.height

      const distLeft = x
      const distRight = width - x
      const distTop = y
      const distBottom = height - y

      const minDist = Math.min(distLeft, distRight, distTop, distBottom)
      const threshold = Math.min(width, height) * 0.25

      if (minDist > threshold) return null

      if (distLeft === minDist) return "left"
      if (distRight === minDist) return "right"
      if (distTop === minDist) return "top"
      if (distBottom === minDist) return "bottom"

      return null
    },
    []
  )

  // ── Pointer event handlers ─────────────────────────────────
  const handlePointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (globalDragState.isDragging && globalDragState.previewData) {
        isDraggingRef.current = true
        setDragPreview(globalDragState.previewData)
        cursorPosRef.current = { x: e.clientX, y: e.clientY }
        const pos = calculateDropPosition(e.clientX, e.clientY)
        setDropPositionLocal(pos)
        useDragState.getState().setDropPosition(pos)
      }

      const isDragging = sessionStorage.getItem("pointer-drag-active")
      const previewData =
        localStorage.getItem("drag-preview") || sessionStorage.getItem("drag-preview")

      if (isDragging === "true" && previewData) {
        isDraggingRef.current = true
        try {
          setDragPreview(JSON.parse(previewData))
        } catch {
          // ignore
        }
        cursorPosRef.current = { x: e.clientX, y: e.clientY }
        const pos = calculateDropPosition(e.clientX, e.clientY)
        setDropPositionLocal(pos)
      }
    },
    [globalDragState, calculateDropPosition]
  )

  const handlePointerLeave = useCallback(() => {
    isDraggingRef.current = false
    setDragPreview(null)
    setDropPositionLocal(null)
    setDropTarget(null)
    useDragState.getState().setDropPosition(null)
  }, [])

  // RAF-throttled: only setState when drop position actually changes
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return

      cursorPosRef.current = { x: e.clientX, y: e.clientY }

      if (rafRef.current !== null) return // RAF already scheduled
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const pos = calculateDropPosition(
          cursorPosRef.current!.x,
          cursorPosRef.current!.y
        )
        if (pos !== dropPositionRef.current) {
          dropPositionRef.current = pos
          setDropPositionLocal(pos)
          useDragState.getState().setDropPosition(pos)
        }
      })
    },
    [calculateDropPosition]
  )

  // ── Layout manipulation ────────────────────────────────────

  // Add a new pane to the layout — wraps the entire layout (workspace-level)
  const addPaneToLayout = useCallback(
    (
      currentLayout: PaneNode | null,
      paneId: string,
      dropPos: DropPosition,
      cursor?: { x: number; y: number }
    ): PaneNode => {
      const newPaneNode: PaneNode = { type: "pane", paneId }

      if (!currentLayout) return newPaneNode

      let effectiveDropPos = dropPos
      if (!effectiveDropPos && cursor && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const x = cursor.x - rect.left
        const y = cursor.y - rect.top
        if (x > rect.width / 2) effectiveDropPos = "right"
        else if (y > rect.height / 2) effectiveDropPos = "bottom"
        else effectiveDropPos = "left"
      }

      if (!effectiveDropPos) {
        return {
          type: "split",
          direction: "horizontal",
          sizes: [50, 50],
          children: [currentLayout, newPaneNode],
        }
      }

      const direction: "horizontal" | "vertical" =
        effectiveDropPos === "left" || effectiveDropPos === "right"
          ? "horizontal"
          : "vertical"
      const putNewPaneFirst = effectiveDropPos === "left" || effectiveDropPos === "top"

      return {
        type: "split",
        direction,
        sizes: [50, 50],
        children: putNewPaneFirst
          ? [newPaneNode, currentLayout]
          : [currentLayout, newPaneNode],
      }
    },
    []
  )

  const removePaneFromLayout = useCallback(
    (currentLayout: PaneNode, paneIdToRemove: string): PaneNode | null => {
      if (currentLayout.type === "pane") {
        return currentLayout.paneId === paneIdToRemove ? null : currentLayout
      }

      const [child0, child1] = currentLayout.children
      const newChild0 = removePaneFromLayout(child0, paneIdToRemove)
      const newChild1 = removePaneFromLayout(child1, paneIdToRemove)

      if (newChild0 === null) return newChild1
      if (newChild1 === null) return newChild0

      return { ...currentLayout, children: [newChild0, newChild1] }
    },
    []
  )

  // Commit new split sizes after resize drag
  const updateSplitSizes = useCallback(
    (targetKey: string, newSizes: [number, number]) => {
      setLayout((prev) => {
        if (!prev) return prev
        return updateSizesInTree(prev, "root", targetKey, newSizes)
      })
    },
    []
  )

  // ── Split handle resize ────────────────────────────────────
  const handleSplitResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, nodeKey: string, isHorizontal: boolean) => {
      e.preventDefault() // prevent text selection while resizing
      e.stopPropagation()
      const handle = e.currentTarget // capture before event handler returns
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

  // ── Global pointer events ──────────────────────────────────
  useEffect(() => {
    function handlePointerUp() {
      const dragState = useDragState.getState()

      let previewData: string | null = null
      if (dragState.isDragging && dragState.previewData) {
        previewData = JSON.stringify(dragState.previewData)
      } else {
        previewData =
          localStorage.getItem("drag-preview") || sessionStorage.getItem("drag-preview")
      }

      const isDragging = dragState.isDragging
        ? "true"
        : sessionStorage.getItem("pointer-drag-active")

      if (previewData && isDragging === "true" && isDraggingRef.current) {
        try {
          const pane = JSON.parse(previewData) as Pane
          const currentDropTarget = dropTargetRef.current

          if (currentDropTarget && layoutRef.current) {
            // Per-pane split: target a specific pane
            const newLayout = splitPaneInLayout(
              layoutRef.current,
              currentDropTarget.paneId,
              pane.id,
              currentDropTarget.position
            )
            setLayout(newLayout)
          } else {
            // Workspace-level wrap (or empty state)
            const dropPos =
              dragState.dropPosition ||
              calculateDropPosition(
                cursorPosRef.current?.x || 0,
                cursorPosRef.current?.y || 0
              )

            console.log(
              "[FlexibleWorkspace] Drop:",
              pane.id,
              "dropPos:",
              dropPos,
              "cursorPos:",
              cursorPosRef.current
            )

            const newLayout = addPaneToLayout(
              layoutRef.current,
              pane.id,
              dropPos,
              cursorPosRef.current ?? undefined
            )
            setLayout(newLayout)
          }

          if (!panesRef.current.find((p) => p.id === pane.id)) {
            const newPanes = [...panesRef.current, pane]
            setPanes(newPanes)
            onPanesChangeRef.current?.(newPanes)
          }
        } catch (err) {
          console.error("[FlexibleWorkspace] Failed to parse drop data:", err)
        }
      }

      // Cleanup
      useDragState.getState().clearDragging()
      setDragPreview(null)
      setDropPositionLocal(null)
      setDropTarget(null)
      cursorPosRef.current = null
      isDraggingRef.current = false
      sessionStorage.removeItem("pointer-drag-active")
      sessionStorage.removeItem("drag-preview")
      localStorage.removeItem("drag-preview")
    }

    function handlePointerCancel() {
      setDragPreview(null)
      setDropPositionLocal(null)
      setDropTarget(null)
      cursorPosRef.current = null
      isDraggingRef.current = false
      sessionStorage.removeItem("pointer-drag-active")
      sessionStorage.removeItem("drag-preview")
      localStorage.removeItem("drag-preview")
    }

    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)

    return () => {
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
    }
  }, [calculateDropPosition, addPaneToLayout])

  // Track cursor globally without setState (ref only)
  useEffect(() => {
    function handleGlobalPointerMove(e: PointerEvent) {
      if (sessionStorage.getItem("pointer-drag-active") === "true") {
        cursorPosRef.current = { x: e.clientX, y: e.clientY }
      }
    }
    window.addEventListener("pointermove", handleGlobalPointerMove)
    return () => window.removeEventListener("pointermove", handleGlobalPointerMove)
  }, [])

  // ── Pane management ────────────────────────────────────────
  const removePane = useCallback(
    (paneId: string) => {
      const newPanes = panes.filter((p) => p.id !== paneId)
      setPanes(newPanes)

      if (layout) {
        const newLayout = removePaneFromLayout(layout, paneId)
        setLayout(newLayout)
      }

      onPanesChange?.(newPanes)
    },
    [panes, layout, removePaneFromLayout, onPanesChange]
  )

  const getPaneById = useCallback(
    (paneId: string): Pane | undefined => panes.find((p) => p.id === paneId),
    [panes]
  )

  const getPaneContent = useCallback(
    (pane: Pane, onClose: () => void): ReactNode => {
      if (pane.content) return pane.content
      if (renderContent) return renderContent(pane, onClose)
      return null
    },
    [renderContent]
  )

  // ── Render ─────────────────────────────────────────────────

  // nodeKey builds a stable path string for each node (e.g. "root", "root-0", "root-0-1")
  const renderLayout = (node: PaneNode, nodeKey: string = "root"): ReactNode => {
    if (node.type === "pane") {
      const pane = getPaneById(node.paneId)
      if (!pane) return null

      return (
        <div key={node.paneId} className="ws-pane" style={{ flex: 1 }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minHeight: 0,
              minWidth: 0,
            }}
          >
            {getPaneContent(pane, () => removePane(pane.id))}
          </div>
          {dragPreview && (
            <PaneDragOverlay
              paneId={pane.id}
              dropTarget={dropTarget}
              onDropTarget={setDropTarget}
            />
          )}
        </div>
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

        {/* Split handle — pointer capture for 60fps DOM-direct resize */}
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
      {/* Workspace-level edge indicator — only when no per-pane target is active */}
      {dragPreview && !dropTarget && dropPosition && (
        <div className={`ws-edge-indicator ${dropPosition}`} />
      )}

      {layout ? renderLayout(layout) : renderEmptyState()}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────

// ── Per-pane drag drop overlay ─────────────────────────────

interface PaneDragOverlayProps {
  paneId: string
  dropTarget: DropTarget | null
  onDropTarget: (target: DropTarget | null) => void
}

function PaneDragOverlay({ paneId, dropTarget, onDropTarget }: PaneDragOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  const handlePointerMove = (e: React.PointerEvent) => {
    const el = overlayRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const w = rect.width
    const h = rect.height

    const distLeft = x
    const distRight = w - x
    const distTop = y
    const distBottom = h - y
    const minDist = Math.min(distLeft, distRight, distTop, distBottom)
    const threshold = Math.min(w, h) * 0.25

    if (minDist > threshold) {
      if (dropTarget?.paneId === paneId) onDropTarget(null)
      return
    }

    let side: "top" | "bottom" | "left" | "right"
    if (distLeft === minDist) side = "left"
    else if (distRight === minDist) side = "right"
    else if (distTop === minDist) side = "top"
    else side = "bottom"

    onDropTarget({ paneId, position: side })
  }

  const currentSide = dropTarget?.paneId === paneId ? dropTarget.position : null

  return (
    <div
      ref={overlayRef}
      className="ws-pane-drop-overlay"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        if (dropTarget?.paneId === paneId) onDropTarget(null)
      }}
    >
      {currentSide && <div className={`ws-pane-drop-highlight ${currentSide}`} />}
    </div>
  )
}
