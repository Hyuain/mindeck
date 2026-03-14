import { useEffect, useRef, type RefObject } from "react"
import { createPortal } from "react-dom"
import { Z } from "./layers"
import type { Skill } from "@/types"

interface SlashCommandDropdownProps {
  skills: Skill[]
  selectedIndex: number
  onSelect: (skill: Skill) => void
  anchorRef: RefObject<HTMLElement | null>
}

export function SlashCommandDropdown({
  skills,
  selectedIndex,
  onSelect,
  anchorRef,
}: SlashCommandDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const selected = list.querySelector<HTMLElement>(".slash-item.selected")
    selected?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  // Measure anchor at render time so it's always fresh
  const anchorRect = anchorRef.current?.getBoundingClientRect() ?? null

  if (!anchorRect || skills.length === 0) return null

  return createPortal(
    <div
      className="popover-panel slash-dropdown"
      ref={listRef}
      style={{
        position: "fixed",
        bottom: `calc(100vh - ${anchorRect.top - 4}px)`,
        left: anchorRect.left,
        width: Math.max(anchorRect.width, 260),
        top: "auto",
        zIndex: Z.POPOVER,
        maxHeight: `${anchorRect.top - 8}px`,
      }}
      role="listbox"
    >
      {skills.map((skill, i) => (
        <button
          key={skill.id}
          className={`slash-item${i === selectedIndex ? " selected" : ""}`}
          role="option"
          aria-selected={i === selectedIndex}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(skill)
          }}
        >
          <span className="slash-item-name">
            /{skill.name}
            {skill.argumentHint && (
              <span className="slash-item-hint"> {skill.argumentHint}</span>
            )}
          </span>
          {skill.description && (
            <span className="slash-item-desc">{skill.description}</span>
          )}
        </button>
      ))}
    </div>,
    document.body
  )
}
