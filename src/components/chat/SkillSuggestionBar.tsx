import { X } from "lucide-react"
import type { Skill } from "@/types"

interface SkillSuggestionBarProps {
  suggestions: Skill[]
  onActivate: (skill: Skill) => void
  onDismiss: () => void
}

/**
 * Slim bar shown above the chat input when auto-matcher finds relevant skills.
 * Renders suggestion chips that can be clicked to activate a skill.
 */
export function SkillSuggestionBar({
  suggestions,
  onActivate,
  onDismiss,
}: SkillSuggestionBarProps) {
  if (suggestions.length === 0) return null

  return (
    <div className="skill-suggestion-bar">
      <span className="skill-suggestion-label">Suggested:</span>
      <div className="skill-suggestion-chips">
        {suggestions.map((skill) => (
          <button
            key={skill.id}
            className="skill-suggestion-chip"
            onClick={() => onActivate(skill)}
            title={skill.description}
          >
            {skill.name}
          </button>
        ))}
      </div>
      <button
        className="icon-btn skill-suggestion-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss suggestions"
      >
        <X size={11} />
      </button>
    </div>
  )
}
