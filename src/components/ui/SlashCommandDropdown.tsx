import { useEffect, useRef, useState, type RefObject } from "react"
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
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Position above the anchor element
  useEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({ top: rect.top - 8, left: rect.left, width: rect.width })
  }, [anchorRef])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const selected = list.querySelector<HTMLElement>(".slash-item.selected")
    selected?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  if (!pos || skills.length === 0) return null

  return (
    <div
      className="slash-dropdown"
      ref={listRef}
      style={{
        position: "fixed",
        bottom: `calc(100vh - ${pos.top}px)`,
        left: pos.left,
        width: Math.max(pos.width, 260),
        top: "auto",
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
            // mousedown to avoid blur-before-click issue
            e.preventDefault()
            onSelect(skill)
          }}
        >
          <span className="slash-item-name">/{skill.name}</span>
          {skill.description && (
            <span className="slash-item-desc">{skill.description}</span>
          )}
        </button>
      ))}
    </div>
  )
}
