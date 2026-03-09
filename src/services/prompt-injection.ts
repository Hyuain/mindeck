/**
 * Prompt injection detection service.
 * Scans tool results for common injection patterns before they are
 * injected back into the LLM's conversation history.
 */

export interface InjectionDetection {
  pattern: string
  severity: "high" | "medium" | "low"
  /** Up to 80 chars of context around the match */
  snippet: string
}

// ─── Pattern Libraries ─────────────────────────────────────

const HIGH_PATTERNS: RegExp[] = [
  /ignore (all |previous |your )?instructions/i,
  /disregard (the above|all|your)/i,
  /you are now/i,
  /act as (if you are|a|an) /i,
  /forget everything/i,
  /new persona/i,
  /<\|im_start\|>/i,
  /<\|system\|>/i,
]

const MEDIUM_PATTERNS: RegExp[] = [
  /override (the|your|all)/i,
  /system prompt/i,
  /do not follow/i,
  /pretend (you are|to be)/i,
]

const LOW_PATTERNS: RegExp[] = [
  /forget (the|your|all)/i,
  /ignore (the|this) rule/i,
]

// ─── Detection ─────────────────────────────────────────────

function extractSnippet(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - 20)
  const end = Math.min(text.length, matchIndex + matchLength + 20)
  return text.slice(start, end).slice(0, 80)
}

/**
 * Scan `text` for prompt injection patterns.
 * Returns the first (highest severity) match found, or null.
 */
export function detectInjection(text: string): InjectionDetection | null {
  for (const pattern of HIGH_PATTERNS) {
    const match = pattern.exec(text)
    if (match) {
      return {
        pattern: pattern.source,
        severity: "high",
        snippet: extractSnippet(text, match.index, match[0].length),
      }
    }
  }

  for (const pattern of MEDIUM_PATTERNS) {
    const match = pattern.exec(text)
    if (match) {
      return {
        pattern: pattern.source,
        severity: "medium",
        snippet: extractSnippet(text, match.index, match[0].length),
      }
    }
  }

  for (const pattern of LOW_PATTERNS) {
    const match = pattern.exec(text)
    if (match) {
      return {
        pattern: pattern.source,
        severity: "low",
        snippet: extractSnippet(text, match.index, match[0].length),
      }
    }
  }

  return null
}
