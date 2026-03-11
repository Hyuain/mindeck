import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

export interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  danger?: boolean
  disabled?: boolean
  dividerBefore?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  position: { x: number; y: number }
  onSelect: (id: string) => void
  onClose: () => void
}

export function ContextMenu({ items, position, onSelect, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [onClose])

  // Adjust position to keep menu on screen
  const style: React.CSSProperties = {
    position: "fixed",
    left: position.x,
    top: position.y,
    zIndex: 9999,
  }

  return createPortal(
    <div ref={menuRef} className="context-menu" style={style}>
      {items.map((item) => (
        <div key={item.id}>
          {item.dividerBefore && <div className="context-menu-divider" />}
          <button
            className={`context-menu-item${item.danger ? " danger" : ""}${item.disabled ? " disabled" : ""}`}
            onClick={() => {
              if (!item.disabled) {
                onSelect(item.id)
                onClose()
              }
            }}
            disabled={item.disabled}
          >
            {item.icon && <span className="context-menu-icon">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}
