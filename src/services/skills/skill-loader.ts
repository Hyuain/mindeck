/**
 * skill-loader.ts — Parse SKILL.md files and convert legacy JSON skills.
 *
 * SKILL.md format:
 * ---
 * name: My Skill
 * description: What this skill does
 * version: 1.0.0
 * author: someone
 * tags: [tag1, tag2]
 * license: MIT
 * allowed-tools: [bash_exec, read_file]
 * ---
 *
 * Markdown body → instructions
 */

import type { Skill } from "@/types"

// ─── Frontmatter parser ───────────────────────────────────────

/**
 * Split raw text on `---` delimiters and extract frontmatter + body.
 * Returns null if no valid frontmatter block found.
 */
function splitFrontmatter(raw: string): { fm: string; body: string } | null {
  const trimmed = raw.trimStart()
  if (!trimmed.startsWith("---")) return null

  const afterFirst = trimmed.slice(3)
  const endIdx = afterFirst.indexOf("\n---")
  if (endIdx === -1) return null

  const fm = afterFirst.slice(0, endIdx).trim()
  const body = afterFirst.slice(endIdx + 4).trimStart()
  return { fm, body }
}

/**
 * Parse a flat YAML-like string into a Record<string, string | string[]>.
 * Supports:
 *   key: value
 *   key: [item1, item2]
 *   key:
 *     - item1
 *     - item2
 */
function parseFlatYaml(fm: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  const lines = fm.split("\n")

  let currentKey: string | null = null
  let currentList: string[] | null = null

  for (const raw of lines) {
    const line = raw.trimEnd()

    // List item under current key
    if (currentList !== null && /^\s+- /.test(line)) {
      currentList.push(line.replace(/^\s+- /, "").trim())
      continue
    }

    // Flush pending list
    if (currentList !== null && currentKey !== null) {
      result[currentKey] = currentList
      currentKey = null
      currentList = null
    }

    if (!line.trim() || line.trim().startsWith("#")) continue

    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim().toLowerCase()
    const rest = line.slice(colonIdx + 1).trim()

    if (!rest) {
      // Value may be on subsequent lines as a list
      currentKey = key
      currentList = []
      continue
    }

    // Inline array: [item1, item2, ...]
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const items = rest
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      result[key] = items
      continue
    }

    result[key] = rest
  }

  // Flush trailing list
  if (currentList !== null && currentKey !== null) {
    result[currentKey] = currentList
  }

  return result
}

function asStringArray(val: string | string[] | undefined): string[] | undefined {
  if (!val) return undefined
  if (Array.isArray(val)) return val.filter(Boolean)
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function asString(val: string | string[] | undefined): string {
  if (!val) return ""
  if (Array.isArray(val)) return val.join(", ")
  return val
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Parse a SKILL.md file into a Skill object.
 * @param raw - Raw file content
 * @param path - Absolute path of the file (used for source tracking + ID derivation)
 */
export function parseSkillMd(raw: string, path: string): Skill {
  const split = splitFrontmatter(raw)
  const now = new Date().toISOString()

  if (!split) {
    // Treat entire file as instructions with no frontmatter
    return {
      id: deriveId(path),
      name: deriveName(path),
      description: "",
      instructions: raw.trim(),
      systemPrompt: raw.trim(),
      source: { type: "skill-md", path },
      createdAt: now,
      updatedAt: now,
    }
  }

  const { fm, body } = split
  const fields = parseFlatYaml(fm)

  const name = asString(fields["name"]) || deriveName(path)
  const description = asString(fields["description"])
  const version = asString(fields["version"]) || undefined
  const author = asString(fields["author"]) || undefined
  const license = asString(fields["license"]) || undefined
  const tags = asStringArray(fields["tags"])
  const allowedTools = asStringArray(fields["allowed-tools"])
  const instructions = body.trim()

  return {
    id: deriveId(path),
    name,
    description,
    instructions,
    systemPrompt: instructions,
    allowedTools,
    version,
    author,
    tags,
    license,
    source: { type: "skill-md", path },
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Convert a legacy JSON skill record to the new Skill format.
 */
export function legacyJsonToSkill(json: Record<string, unknown>): Skill {
  const now = new Date().toISOString()
  const systemPrompt = String(json["systemPrompt"] ?? "")
  return {
    id: String(json["id"] ?? crypto.randomUUID()),
    name: String(json["name"] ?? ""),
    description: String(json["description"] ?? ""),
    instructions: systemPrompt,
    systemPrompt,
    tools: Array.isArray(json["tools"]) ? (json["tools"] as string[]) : undefined,
    source: { type: "native" },
    createdAt: String(json["createdAt"] ?? now),
    updatedAt: String(json["updatedAt"] ?? now),
  }
}

// ─── Helpers ──────────────────────────────────────────────────

/** Derive a stable slug ID from the file path (parent dir name). */
function deriveId(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/")
  // For `{dir}/SKILL.md`, use the directory name; otherwise use filename stem
  const last = parts[parts.length - 1]
  if (last.toLowerCase() === "skill.md" && parts.length >= 2) {
    return slugify(parts[parts.length - 2])
  }
  return slugify(last.replace(/\.md$/i, ""))
}

/** Derive a human-readable name from the path (parent dir name). */
function deriveName(path: string): string {
  const id = deriveId(path)
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/** Convert a string to a lowercase-hyphenated slug. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
