import { useCallback } from "react"

interface UseColumnResizeOptions {
  min: number
  max: number
  onCommit: (width: number) => void
  invertDelta?: boolean
}

export function useColumnResize(
  panelRef: React.RefObject<HTMLDivElement | null>,
  startWidth: number,
  { min, max, onCommit, invertDelta = false }: UseColumnResizeOptions
) {
  return useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      // Capture el synchronously before React nulls e.currentTarget
      const el = e.currentTarget
      el.setPointerCapture(e.pointerId)
      const startX = e.clientX
      const panel = panelRef.current

      if (panel) panel.style.transition = "none"
      document.body.classList.add("is-resizing")

      function onMove(me: PointerEvent) {
        const delta = invertDelta ? -(me.clientX - startX) : me.clientX - startX
        const w = Math.max(min, Math.min(max, startWidth + delta))
        if (panel) panel.style.width = `${w}px`
      }

      function cleanup(me: PointerEvent) {
        const delta = invertDelta ? -(me.clientX - startX) : me.clientX - startX
        const w = Math.max(min, Math.min(max, startWidth + delta))
        if (panel) panel.style.transition = ""
        document.body.classList.remove("is-resizing")
        onCommit(w)
        el.removeEventListener("pointermove", onMove)
        el.removeEventListener("pointerup", cleanup)
        el.removeEventListener("pointercancel", cleanup)
      }

      el.addEventListener("pointermove", onMove)
      el.addEventListener("pointerup", cleanup)
      el.addEventListener("pointercancel", cleanup)
    },
    [panelRef, startWidth, min, max, onCommit, invertDelta]
  )
}
