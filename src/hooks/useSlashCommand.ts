import { useMemo, useState } from "react"
import type { Skill } from "@/types"

export interface SlashCommandState {
  /** Text after "/" (null = not in slash mode) */
  query: string | null
  matches: Skill[]
  selectedIndex: number
}

export interface UseSlashCommandReturn {
  state: SlashCommandState
  /** Call in textarea onChange — updates internal state */
  onInputChange: (value: string) => void
  /** Call in onKeyDown — returns true if event was consumed */
  handleKeyDown: (e: React.KeyboardEvent) => boolean
  /** Select a skill: returns the new input value (slash command stripped) and activates the skill */
  selectSkill: (skill: Skill, onActivate: (skillId: string) => void) => string
  /** Imperatively close the dropdown */
  close: () => void
}

const MAX_RESULTS = 8

function getSlashQuery(value: string): string | null {
  // Find the last `/` that is at position 0 or preceded by whitespace
  const match = value.match(/(?:^|\s)\/(\S*)$/)
  if (!match) return null
  return match[1]
}

export function useSlashCommand(availableSkills: Skill[]): UseSlashCommandReturn {
  const [query, setQuery] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const matches = useMemo(() => {
    if (query === null) return []
    const q = query.toLowerCase()
    return availableSkills
      .filter((s) => s.name.toLowerCase().startsWith(q) || (q === "" && true))
      .slice(0, MAX_RESULTS)
  }, [query, availableSkills])

  function onInputChange(value: string) {
    const q = getSlashQuery(value)
    if (q !== query) {
      setQuery(q)
      setSelectedIndex(0)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): boolean {
    if (query === null || matches.length === 0) return false

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, matches.length - 1))
      return true
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
      return true
    }
    if (e.key === "Enter" || e.key === "Tab") {
      const skill = matches[selectedIndex]
      if (skill) {
        // Caller handles activation and input update
        return true
      }
    }
    if (e.key === "Escape") {
      e.preventDefault()
      setQuery(null)
      return true
    }
    return false
  }

  function selectSkill(skill: Skill, onActivate: (skillId: string) => void): string {
    onActivate(skill.id)
    setQuery(null)
    setSelectedIndex(0)
    // Return empty string — clear the slash command from input
    return ""
  }

  function close() {
    setQuery(null)
    setSelectedIndex(0)
  }

  return {
    state: { query, matches, selectedIndex },
    onInputChange,
    handleKeyDown,
    selectSkill,
    close,
  }
}
