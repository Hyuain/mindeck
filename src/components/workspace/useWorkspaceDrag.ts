import { useState, useCallback, useEffect, useRef } from "react"
import { useDragState, type DropPosition } from "@/services/drag-state"
import { splitPaneInLayout, addPaneToTree } from "./layoutHelpers"
import type { Pane, PaneType, PaneNode } from "./FlexibleWorkspace"

interface DropTarget {
  paneId: string
  position: "top" | "bottom" | "left" | "right"
}

interface UseWorkspaceDragOptions {
  containerRef: React.RefObject<HTMLDivElement | null>
  layoutRef: React.RefObject<PaneNode | null>
  panesRef: React.RefObject<Pane[]>
  onPanesChangeRef: React.RefObject<((panes: Pane[]) => void) | undefined>
  setLayout: React.Dispatch<React.SetStateAction<PaneNode | null>>
  setPanes: React.Dispatch<React.SetStateAction<Pane[]>>
}

export function useWorkspaceDrag({
  containerRef,
  layoutRef,
  panesRef,
  onPanesChangeRef,
  setLayout,
  setPanes,
}: UseWorkspaceDragOptions) {
  const [dragPreview, setDragPreview] = useState<{
    type: PaneType
    title: string
  } | null>(null)
  const [dropPosition, setDropPositionLocal] = useState<DropPosition>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const isDraggingRef = useRef(false)
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null)
  const dropPositionRef = useRef<DropPosition>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)
  const rafRef = useRef<number | null>(null)

  dropTargetRef.current = dropTarget

  const globalDragState = useDragState()

  // Polling: detect drag state (backup for Tauri where events may not fire)
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
        if (lastPreview !== null || preview !== null) {
          lastPreview = null
          setDragPreview(null)
          setDropPositionLocal(null)
        }
      }
    }, 100)
    return () => clearInterval(interval)
  }, [])

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
    [containerRef]
  )

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (globalDragState.isDragging && globalDragState.previewData) {
        isDraggingRef.current = true
        const pd = globalDragState.previewData
        setDragPreview({
          type: (pd.type === "file" ? "file" : "agent") as PaneType,
          title: pd.title,
        })
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

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return

      cursorPosRef.current = { x: e.clientX, y: e.clientY }

      if (rafRef.current !== null) return
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

  // Global pointer events
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
            const newLayout = splitPaneInLayout(
              layoutRef.current,
              currentDropTarget.paneId,
              pane.id,
              currentDropTarget.position
            )
            setLayout(newLayout)
          } else {
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

            const rect = containerRef.current?.getBoundingClientRect()
            const newLayout = addPaneToTree(
              layoutRef.current,
              pane.id,
              dropPos,
              rect
                ? { width: rect.width, height: rect.height, left: rect.left, top: rect.top }
                : undefined,
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
  }, [calculateDropPosition, containerRef, layoutRef, panesRef, onPanesChangeRef, setLayout, setPanes])

  // Track cursor globally without setState
  useEffect(() => {
    function handleGlobalPointerMove(e: PointerEvent) {
      if (sessionStorage.getItem("pointer-drag-active") === "true") {
        cursorPosRef.current = { x: e.clientX, y: e.clientY }
      }
    }
    window.addEventListener("pointermove", handleGlobalPointerMove)
    return () => window.removeEventListener("pointermove", handleGlobalPointerMove)
  }, [])

  return {
    dragPreview,
    dropPosition,
    dropTarget,
    setDropTarget,
    handlePointerEnter,
    handlePointerLeave,
    handlePointerMove,
  }
}
