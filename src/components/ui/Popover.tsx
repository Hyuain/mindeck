import { useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { Z } from "./layers"

type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end"
type WidthMode = "auto" | "match" | "min-match"

interface PopoverProps {
  anchor: DOMRect
  placement?: Placement
  onClose: () => void
  className?: string
  children: React.ReactNode
  widthMode?: WidthMode
  zIndex?: number
}

function computePosition(anchor: DOMRect, placement: Placement) {
  const gap = 4
  let top: number
  let left: number

  if (placement.startsWith("top")) {
    top = anchor.top - gap
  } else {
    top = anchor.bottom + gap
  }

  if (placement.endsWith("-end")) {
    left = anchor.right
  } else {
    left = anchor.left
  }

  return { top, left, anchorEnd: placement.endsWith("-end") }
}

export function Popover({
  anchor,
  placement = "bottom-start",
  onClose,
  className,
  children,
  widthMode = "auto",
  zIndex = Z.POPOVER,
}: PopoverProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [handleEscape])

  const { top, left, anchorEnd } = computePosition(anchor, placement)

  const contentStyle: React.CSSProperties = {
    position: "fixed",
    zIndex,
  }

  if (placement.startsWith("top")) {
    contentStyle.bottom = `calc(100vh - ${top}px)`
    contentStyle.top = "auto"
    contentStyle.maxHeight = `${top - 4}px`
  } else {
    contentStyle.top = top
  }

  if (anchorEnd) {
    contentStyle.right = `calc(100vw - ${left}px)`
    contentStyle.left = "auto"
    contentStyle.maxWidth = `min(420px, ${left}px)`
  } else {
    contentStyle.left = left
    contentStyle.maxWidth = `min(420px, calc(100vw - ${left + 12}px))`
  }

  if (widthMode === "match") {
    contentStyle.width = anchor.width
  } else if (widthMode === "min-match") {
    contentStyle.minWidth = Math.max(anchor.width, 220)
    contentStyle.width = "max-content"
  } else {
    contentStyle.width = "max-content"
  }

  return createPortal(
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: zIndex - 1 }}
        onClick={onClose}
      />
      <div className={className} style={contentStyle}>
        {children}
      </div>
    </>,
    document.body
  )
}
