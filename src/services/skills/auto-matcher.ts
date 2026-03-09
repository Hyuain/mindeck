/**
 * Auto-skill matching — scores skills against a task description
 * and returns the top N most relevant suggestions.
 */
import type { Skill } from "@/types"

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "it",
  "its",
  "he",
  "she",
  "they",
  "them",
  "their",
  "can",
  "get",
  "make",
  "help",
  "please",
  "need",
])

/** Tokenize text into lowercase words, removing stop words. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
}

/**
 * Score a single skill against a task text.
 * Returns a value in [0, 1] where 1 is a perfect match.
 *
 * Weights:
 *  - tag match: 3 pts each
 *  - name token match: 2 pts each
 *  - description token match: 1 pt each
 */
export function scoreSkillForTask(skill: Skill, taskText: string): number {
  if (!taskText.trim()) return 0

  const taskTokens = new Set(tokenize(taskText))
  if (taskTokens.size === 0) return 0

  const tags = skill.tags ?? []
  const nameTokens = tokenize(skill.name)
  const descTokens = tokenize(skill.description)

  let score = 0
  const maxScore = tags.length * 3 + nameTokens.length * 2 + descTokens.length * 1

  if (maxScore === 0) return 0

  for (const tag of tags) {
    for (const tagToken of tokenize(tag)) {
      if (taskTokens.has(tagToken)) score += 3
    }
  }
  for (const tok of nameTokens) {
    if (taskTokens.has(tok)) score += 2
  }
  for (const tok of descTokens) {
    if (taskTokens.has(tok)) score += 1
  }

  return score / maxScore
}

const SUGGESTION_THRESHOLD = 0.1

/**
 * Return the top `limit` skills ranked by relevance to `taskText`.
 * Skills with a score below `SUGGESTION_THRESHOLD` are filtered out.
 */
export function suggestSkills(taskText: string, skills: Skill[], limit = 3): Skill[] {
  if (!taskText.trim() || skills.length === 0) return []

  const scored = skills
    .filter((skill) => !skill.disableAutoInvoke)
    .map((skill) => ({ skill, score: scoreSkillForTask(skill, taskText) }))
    .filter(({ score }) => score >= SUGGESTION_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(({ skill }) => skill)
}
