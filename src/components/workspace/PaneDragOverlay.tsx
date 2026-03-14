import { useRef } from "react"

interface DropTarget {
  paneId: string
  position: "top" | "bottom" | "left" | "right"
}

interface PaneDragOverlayProps {
  paneId: string
  dropTarget: DropTarget | null
  onDropTarget: (target: DropTarget | null) => void
}

export function PaneDragOverlay({ paneId, dropTarget, onDropTarget }: PaneDragOverlayProps) {
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
