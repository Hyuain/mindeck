import { useRef, useState, type KeyboardEvent } from "react"
import { SendHorizontal } from "lucide-react"
import { useSkillsStore } from "@/stores/skills"
import { useSlashCommand } from "@/hooks/useSlashCommand"
import { SlashCommandDropdown } from "@/components/ui/SlashCommandDropdown"
import { SkillChips } from "@/components/ui/SkillChips"
import type { Skill } from "@/types"

// Stable empty array — prevents React 19 getSnapshot tearing detection from
// triggering infinite re-renders when the workspaceId key is absent.
const EMPTY_SKILLS: Skill[] = []

interface ChatInputProps {
  workspaceId: string
  onSend: (content: string, ephemeralSkillIds: string[]) => void
  disabled?: boolean
}

export function ChatInput({ workspaceId, onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("")
  // Per-message skills selected via slash command — NOT stored globally
  const [ephemeralSkills, setEphemeralSkills] = useState<Skill[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)

  const skills = useSkillsStore((s) => s.workspaceSkills[workspaceId] ?? EMPTY_SKILLS)

  const {
    state: slashState,
    onInputChange,
    handleKeyDown: slashKeyDown,
    selectSkill,
  } = useSlashCommand(skills)

  function submit() {
    const trimmed = value.trim()
    if ((!trimmed && ephemeralSkills.length === 0) || disabled) return
    onSend(trimmed, ephemeralSkills.map((s) => s.id))
    setValue("")
    setEphemeralSkills([])
    taRef.current?.focus()
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setValue(v)
    onInputChange(v)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (slashState.query !== null && slashState.matches.length > 0) {
      if (e.key === "Enter" || e.key === "Tab") {
        const skill = slashState.matches[slashState.selectedIndex]
        if (skill) {
          e.preventDefault()
          // Add to local ephemeral list (deduped), don't touch global store
          selectSkill(skill, () => {
            setEphemeralSkills((prev) =>
              prev.some((s) => s.id === skill.id) ? prev : [...prev, skill]
            )
          })
          setValue("")
          return
        }
      }
      if (slashKeyDown(e)) return
    }
    // Backspace on empty input removes the last ephemeral skill chip
    if (e.key === "Backspace" && value === "" && ephemeralSkills.length > 0) {
      e.preventDefault()
      setEphemeralSkills((prev) => prev.slice(0, -1))
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function handleSlashSelect(skill: Skill) {
    selectSkill(skill, () => {
      setEphemeralSkills((prev) =>
        prev.some((s) => s.id === skill.id) ? prev : [...prev, skill]
      )
    })
    setValue("")
    taRef.current?.focus()
  }

  const canSend = (value.trim() !== "" || ephemeralSkills.length > 0) && !disabled

  return (
    <div className="chat-foot">
      <div className="input-box">
        {slashState.query !== null && slashState.matches.length > 0 && (
          <SlashCommandDropdown
            skills={slashState.matches}
            selectedIndex={slashState.selectedIndex}
            onSelect={handleSlashSelect}
            anchorRef={taRef}
          />
        )}
        {ephemeralSkills.length > 0 && (
          <div className="input-chips">
            <SkillChips
              skills={ephemeralSkills}
              onRemove={(id) => setEphemeralSkills((prev) => prev.filter((s) => s.id !== id))}
              variant="ws"
            />
          </div>
        )}
        <textarea
          ref={taRef}
          className="input-ta"
          placeholder={
            ephemeralSkills.length > 0
              ? "Add a message…"
              : "Ask anything about this workspace…"
          }
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
        />
        <div className="input-bar">
          <span className="input-hint">↵ send · ⇧↵ newline</span>
          <button
            className="send-btn"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send message"
          >
            <SendHorizontal size={11} />
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
