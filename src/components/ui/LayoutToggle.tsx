import { useState, useRef, useEffect } from "react"
import { useLayoutStore } from "@/stores/layout"

/** Mini SVG showing a 3-column layout with one column highlighted. */
function ColIcon({ highlight }: { highlight: "left" | "center" | "right" }) {
  const dim = "var(--color-t2)"
  const on = "var(--color-ac)"
  return (
    <svg
      width="28"
      height="20"
      viewBox="0 0 28 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="1"
        y="1"
        width="7"
        height="18"
        rx="1.5"
        fill={highlight === "left" ? on : dim}
        opacity={highlight === "left" ? 1 : 0.35}
      />
      <rect
        x="10"
        y="1"
        width="8"
        height="18"
        rx="1.5"
        fill={highlight === "center" ? on : dim}
        opacity={highlight === "center" ? 1 : 0.35}
      />
      <rect
        x="20"
        y="1"
        width="7"
        height="18"
        rx="1.5"
        fill={highlight === "right" ? on : dim}
        opacity={highlight === "right" ? 1 : 0.35}
      />
    </svg>
  )
}

export function LayoutToggle() {
  const { showLeft, showCenter, showRight, setShowLeft, setShowCenter, setShowRight } =
    useLayoutStore()

  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close popup when clicking outside
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  /** Toggle a column's visibility — always keep at least one column shown. */
  function toggle(col: "left" | "center" | "right") {
    const states = { left: showLeft, center: showCenter, right: showRight }
    const setters = { left: setShowLeft, center: setShowCenter, right: setShowRight }
    const current = states[col]
    // Count currently visible columns
    const visibleCount = [showLeft, showCenter, showRight].filter(Boolean).length
    // Prevent hiding the last visible column
    if (current && visibleCount === 1) return
    setters[col](!current)
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        className="layout-toggle-btn"
        onClick={() => setOpen((v) => !v)}
        title="Toggle columns"
        aria-expanded={open}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="1" y="3" width="6" height="18" rx="1.5" />
          <rect x="9" y="3" width="6" height="18" rx="1.5" />
          <rect x="17" y="3" width="6" height="18" rx="1.5" />
        </svg>
      </button>

      {open && (
        <div className="layout-toggle-popup" role="dialog" aria-label="Layout columns">
          <button
            className={`layout-col-btn${showLeft ? " active" : ""}`}
            onClick={() => toggle("left")}
            title={showLeft ? "Hide left panel" : "Show left panel"}
          >
            <ColIcon highlight="left" />
            <span className="layout-col-label">Left</span>
          </button>
          <button
            className={`layout-col-btn${showCenter ? " active" : ""}`}
            onClick={() => toggle("center")}
            title={showCenter ? "Hide center panel" : "Show center panel"}
          >
            <ColIcon highlight="center" />
            <span className="layout-col-label">Center</span>
          </button>
          <button
            className={`layout-col-btn${showRight ? " active" : ""}`}
            onClick={() => toggle("right")}
            title={showRight ? "Hide right panel" : "Show right panel"}
          >
            <ColIcon highlight="right" />
            <span className="layout-col-label">Right</span>
          </button>
        </div>
      )}
    </div>
  )
}
