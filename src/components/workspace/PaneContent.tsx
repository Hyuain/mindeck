import type { ReactNode } from "react"
import type { Pane } from "./FlexibleWorkspace"
import { PaneDragOverlay } from "./PaneDragOverlay"

interface DropTarget {
  paneId: string
  position: "top" | "bottom" | "left" | "right"
}

interface PaneContentProps {
  pane: Pane
  onClose: () => void
  renderContent?: (pane: Pane, onClose: () => void) => ReactNode
  showDragOverlay: boolean
  dropTarget: DropTarget | null
  onDropTarget: (target: DropTarget | null) => void
}

export function PaneContent({
  pane,
  onClose,
  renderContent,
  showDragOverlay,
  dropTarget,
  onDropTarget,
}: PaneContentProps) {
  const content = pane.content ?? (renderContent ? renderContent(pane, onClose) : null)

  return (
    <div className="ws-pane" style={{ flex: 1 }}>
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
        {content}
      </div>
      {showDragOverlay && (
        <PaneDragOverlay
          paneId={pane.id}
          dropTarget={dropTarget}
          onDropTarget={onDropTarget}
        />
      )}
    </div>
  )
}
