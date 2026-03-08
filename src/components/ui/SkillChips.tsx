import type { Skill } from "@/types"

interface SkillChipsProps {
  skills: Skill[]
  onRemove: (skillId: string) => void
  /** "ws" = emerald, "mj" = violet */
  variant?: "ws" | "mj"
}

export function SkillChips({ skills, onRemove, variant = "ws" }: SkillChipsProps) {
  if (skills.length === 0) return null
  return (
    <div className="skill-chips-row">
      {skills.map((skill) => (
        <span key={skill.id} className={`skill-chip skill-chip-${variant}`}>
          <span className="skill-chip-name">{skill.name}</span>
          <button
            className="skill-chip-remove"
            onClick={() => onRemove(skill.id)}
            aria-label={`Remove ${skill.name}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
