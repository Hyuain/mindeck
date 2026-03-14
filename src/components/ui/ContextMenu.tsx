import { Popover } from "./Popover"
import { Z } from "./layers"

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
  // Synthesise a zero-size DOMRect at the cursor position
  const anchor = new DOMRect(position.x, position.y, 0, 0)

  return (
    <Popover
      anchor={anchor}
      placement="bottom-start"
      onClose={onClose}
      className="popover-panel context-menu"
      zIndex={Z.CONTEXT_MENU}
    >
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
    </Popover>
  )
}
