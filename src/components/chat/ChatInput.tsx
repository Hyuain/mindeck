import { useRef, useState, type KeyboardEvent } from "react"
import { SendHorizontal } from "lucide-react"
import { useSkillsStore } from "@/stores/skills"
import { useSlashCommand } from "@/hooks/useSlashCommand"
import { suggestSkills } from "@/services/skills/auto-matcher"
import { SlashCommandDropdown } from "@/components/ui/SlashCommandDropdown"
import { SkillChips } from "@/components/ui/SkillChips"
import { SkillSuggestionBar } from "./SkillSuggestionBar"
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
  // E4.4: Tracks whether the user has dismissed suggestions for this input cycle
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const skills = useSkillsStore((s) => s.workspaceSkills[workspaceId] ?? EMPTY_SKILLS)
  const workspaceActiveSkillIds = useSkillsStore(
    (s) => s.workspaceActiveSkillIds[workspaceId] ?? EMPTY_SKILLS
  )

  const {
    state: slashState,
    onInputChange,
    handleKeyDown: slashKeyDown,
    selectSkill,
  } = useSlashCommand(skills)

  // E4.4: Show suggestions when there's enough text, no active skills, and user hasn't dismissed
  const hasActiveSkills =
    (workspaceActiveSkillIds as unknown as string[]).length > 0 || ephemeralSkills.length > 0
  const suggestions =
    value.trim().length > 10 && !hasActiveSkills && !suggestionsDismissed
      ? suggestSkills(value, skills)
      : EMPTY_SKILLS

  function submit() {
    const trimmed = value.trim()
    if ((!trimmed && ephemeralSkills.length === 0) || disabled) return
    onSend(trimmed, ephemeralSkills.map((s) => s.id))
    setValue("")
    setEphemeralSkills([])
    setSuggestionsDismissed(false)
    taRef.current?.focus()
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setValue(v)
    onInputChange(v)
    // Reset dismissal when the user starts typing a new message
    if (suggestionsDismissed) setSuggestionsDismissed(false)
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

  // E4.4: Activate a suggested skill — add to ephemeral list + dismiss bar
  function handleSuggestionActivate(skill: Skill) {
    setEphemeralSkills((prev) =>
      prev.some((s) => s.id === skill.id) ? prev : [...prev, skill]
    )
    setSuggestionsDismissed(true)
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
        {suggestions.length > 0 && (
          <SkillSuggestionBar
            suggestions={suggestions}
            onActivate={handleSuggestionActivate}
            onDismiss={() => setSuggestionsDismissed(true)}
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
