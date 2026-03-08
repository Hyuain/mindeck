/**
 * import-export.ts — Skill import/export adapters.
 *
 * Supported formats:
 *  1. SKILL.md   — portable Markdown format (primary)
 *  2. OpenClaw   — JSON bundle format used by OpenClaw and compatible tools
 *
 * OpenClaw bundle format:
 * {
 *   "version": "1.0",
 *   "source": "openclaw",
 *   "exportedAt": "<ISO8601>",
 *   "skills": [
 *     {
 *       "name": "...",
 *       "description": "...",
 *       "prompt": "...",
 *       "tools": ["..."],
 *       "tags": ["..."],
 *       "version": "...",
 *       "author": "...",
 *       "license": "..."
 *     }
 *   ]
 * }
 */

import type { Skill } from "@/types"

// ─── SKILL.md export ──────────────────────────────────────

/**
 * Serialize a Skill to a portable SKILL.md string.
 * Round-trips with parseSkillMd() in skill-loader.ts.
 */
export function exportSkillMd(skill: Skill): string {
  const lines: string[] = ["---"]
  lines.push(`name: ${skill.name}`)
  if (skill.description) lines.push(`description: ${skill.description}`)
  if (skill.version) lines.push(`version: ${skill.version}`)
  if (skill.author) lines.push(`author: ${skill.author}`)
  if (skill.license) lines.push(`license: ${skill.license}`)
  if (skill.tags?.length) lines.push(`tags: [${skill.tags.join(", ")}]`)
  const tools = skill.allowedTools ?? skill.tools
  if (tools?.length) lines.push(`allowed-tools: [${tools.join(", ")}]`)
  lines.push("---")
  lines.push("")
  lines.push(skill.instructions ?? skill.systemPrompt)
  return lines.join("\n")
}

// ─── OpenClaw bundle format ────────────────────────────────

interface OpenClawSkill {
  name: string
  description?: string
  prompt: string
  tools?: string[]
  tags?: string[]
  version?: string
  author?: string
  license?: string
}

interface OpenClawBundle {
  version: "1.0"
  source: "openclaw"
  exportedAt: string
  skills: OpenClawSkill[]
}

/**
 * Export one or more skills as an OpenClaw-compatible JSON bundle string.
 */
export function exportToOpenClaw(skills: Skill[]): string {
  const bundle: OpenClawBundle = {
    version: "1.0",
    source: "openclaw",
    exportedAt: new Date().toISOString(),
    skills: skills.map(skillToOpenClaw),
  }
  return JSON.stringify(bundle, null, 2)
}

/**
 * Import skills from an OpenClaw JSON bundle string.
 * Returns an array of Skill objects (not yet persisted).
 * Throws if the bundle format is invalid.
 */
export function importFromOpenClaw(raw: string): Skill[] {
  const bundle = parseOpenClawBundle(raw)
  return bundle.skills.map(openClawToSkill)
}

// ─── Internal helpers ──────────────────────────────────────

function skillToOpenClaw(skill: Skill): OpenClawSkill {
  const entry: OpenClawSkill = {
    name: skill.name,
    prompt: skill.instructions ?? skill.systemPrompt,
  }
  if (skill.description) entry.description = skill.description
  const tools = skill.allowedTools ?? skill.tools
  if (tools?.length) entry.tools = tools
  if (skill.tags?.length) entry.tags = skill.tags
  if (skill.version) entry.version = skill.version
  if (skill.author) entry.author = skill.author
  if (skill.license) entry.license = skill.license
  return entry
}

function openClawToSkill(oc: OpenClawSkill): Skill {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: oc.name,
    description: oc.description ?? "",
    instructions: oc.prompt,
    systemPrompt: oc.prompt,
    allowedTools: oc.tools?.length ? oc.tools : undefined,
    tags: oc.tags?.length ? oc.tags : undefined,
    version: oc.version,
    author: oc.author,
    license: oc.license,
    source: { type: "native" },
    createdAt: now,
    updatedAt: now,
  }
}

function parseOpenClawBundle(raw: string): OpenClawBundle {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("Invalid OpenClaw bundle: not valid JSON")
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid OpenClaw bundle: expected an object")
  }
  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj["skills"])) {
    throw new Error("Invalid OpenClaw bundle: missing skills array")
  }
  const skills = (obj["skills"] as unknown[]).filter(isOpenClawSkill)
  return {
    version: "1.0",
    source: "openclaw",
    exportedAt: String(obj["exportedAt"] ?? ""),
    skills,
  }
}

function isOpenClawSkill(val: unknown): val is OpenClawSkill {
  if (typeof val !== "object" || val === null) return false
  const o = val as Record<string, unknown>
  return typeof o["name"] === "string" && typeof o["prompt"] === "string"
}
