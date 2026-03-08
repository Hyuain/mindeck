/**
 * context-injector.ts — Discover and inject project context rules
 * into the workspace agent's system prompt.
 *
 * Discovery priority (highest first):
 *  10 — AGENTS.md          (universal standard, walks up to home boundary)
 *   9 — CLAUDE.md          (Claude Code, walks up to home boundary)
 *   8 — CLAUDE.local.md    (personal/gitignored, project root only)
 *   8 — GEMINI.md          (Google Gemini CLI)
 *   5 — .cursor/rules/     (Cursor new format, *.md/*.mdc)
 *   4 — .cursorrules       (Cursor legacy flat file)
 *   4 — .windsurf/rules/   (Windsurf new format, *.md)
 *   4 — .windsurfrules     (Windsurf legacy flat file)
 *   3 — .github/copilot-instructions.md
 */

import { invoke } from "@tauri-apps/api/core"
import type { ContextRule, ContextRuleSource } from "@/types"

// ─── Public API ───────────────────────────────────────────────

/**
 * Discover all context rules for a workspace.
 * Returns rules sorted by priority descending, ready for injection.
 */
export async function discoverContextRules(
  workspacePath: string
): Promise<ContextRule[]> {
  const dir = normalizePath(workspacePath)
  const results = await Promise.allSettled([
    discoverWalkingFile(dir, "AGENTS.md", "agents-md", 10),
    discoverWalkingFile(dir, "CLAUDE.md", "claude-md", 9),
    discoverSingleFile(`${dir}/CLAUDE.local.md`, "claude-local", 8),
    discoverWalkingFile(dir, "GEMINI.md", "gemini-md", 8),
    discoverCursorRules(dir),
    discoverSingleFile(`${dir}/.cursorrules`, "cursorrules-file", 4),
    discoverWindsurfRules(dir),
    discoverSingleFile(`${dir}/.windsurfrules`, "windsurfrules-file", 4),
    discoverSingleFile(
      `${dir}/.github/copilot-instructions.md`,
      "copilot-instructions",
      3
    ),
  ])

  const rules: ContextRule[] = []
  for (const r of results) {
    if (r.status === "fulfilled") {
      if (Array.isArray(r.value)) rules.push(...r.value)
      else if (r.value) rules.push(r.value)
    }
  }

  return rules.sort((a, b) => b.priority - a.priority)
}

// Keep individual exports for backward compat with existing callers
export async function discoverAgentsMd(
  workspacePath: string
): Promise<ContextRule | null> {
  return discoverWalkingFile(normalizePath(workspacePath), "AGENTS.md", "agents-md", 10)
}

export async function discoverCursorRules(workspacePath: string): Promise<ContextRule[]> {
  const rulesDir = `${normalizePath(workspacePath)}/.cursor/rules`

  let entries: Array<{ path: string; name: string; isDir: boolean }>
  try {
    entries = await invoke("list_dir", { path: rulesDir })
  } catch {
    return []
  }

  const rules: ContextRule[] = []
  for (const entry of entries) {
    if (entry.isDir) continue
    if (!entry.name.endsWith(".md") && !entry.name.endsWith(".mdc")) continue
    const content = await tryReadFile(entry.path)
    if (content !== null) {
      rules.push({ content, source: "cursor-rule", path: entry.path, priority: 5 })
    }
  }
  rules.sort((a, b) => a.path.localeCompare(b.path))
  return rules
}

export async function discoverWindsurfRules(
  workspacePath: string
): Promise<ContextRule[]> {
  const rulesDir = `${normalizePath(workspacePath)}/.windsurf/rules`

  let entries: Array<{ path: string; name: string; isDir: boolean }>
  try {
    entries = await invoke("list_dir", { path: rulesDir })
  } catch {
    return []
  }

  const rules: ContextRule[] = []
  for (const entry of entries) {
    if (entry.isDir) continue
    if (!entry.name.endsWith(".md")) continue
    const content = await tryReadFile(entry.path)
    if (content !== null) {
      rules.push({ content, source: "windsurf-rule", path: entry.path, priority: 4 })
    }
  }
  rules.sort((a, b) => a.path.localeCompare(b.path))
  return rules
}

/**
 * Build a formatted context section from a list of context rules.
 * Rules are sorted by priority descending.
 */
export function buildContextSection(rules: ContextRule[]): string {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)
  return sorted
    .map((r) => {
      const label = sourceLabel(r.source, r.path)
      return `### ${label}\n\n${r.content.trim()}`
    })
    .join("\n\n---\n\n")
}

// ─── Internal helpers ─────────────────────────────────────────

/** Walk from dir up to home boundary looking for a specific filename. */
async function discoverWalkingFile(
  startDir: string,
  filename: string,
  source: ContextRuleSource,
  priority: number
): Promise<ContextRule | null> {
  let dir = startDir
  while (dir && dir !== "/" && dir !== ".") {
    const candidate = `${dir}/${filename}`
    const content = await tryReadFile(candidate)
    if (content !== null) {
      return { content, source, path: candidate, priority }
    }
    if (isHomeBoundary(dir)) break
    const parent = parentDir(dir)
    if (!parent || parent === dir) break
    dir = parent
  }
  return null
}

/** Try to read a single file at an exact path. */
async function discoverSingleFile(
  path: string,
  source: ContextRuleSource,
  priority: number
): Promise<ContextRule | null> {
  const content = await tryReadFile(path)
  if (content === null) return null
  return { content, source, path, priority }
}

async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await invoke<string>("read_file", { path })
  } catch {
    return null
  }
}

function normalizePath(p: string): string {
  return p.replace(/\/+$/, "")
}

function parentDir(p: string): string {
  const idx = p.lastIndexOf("/")
  if (idx <= 0) return "/"
  return p.slice(0, idx)
}

function basename(p: string): string {
  return p.split("/").pop() ?? p
}

function isHomeBoundary(dir: string): boolean {
  return /^\/(Users|home)\/[^/]+$/.test(dir)
}

function sourceLabel(source: ContextRuleSource, path: string): string {
  switch (source) {
    case "agents-md":
      return "Project Instructions (AGENTS.md)"
    case "claude-md":
      return "Project Instructions (CLAUDE.md)"
    case "claude-local":
      return "Local Instructions (CLAUDE.local.md)"
    case "gemini-md":
      return "Project Instructions (GEMINI.md)"
    case "cursor-rule":
      return `Cursor Rule: ${basename(path)}`
    case "cursorrules-file":
      return "Cursor Rules (.cursorrules)"
    case "windsurf-rule":
      return `Windsurf Rule: ${basename(path)}`
    case "windsurfrules-file":
      return "Windsurf Rules (.windsurfrules)"
    case "copilot-instructions":
      return "Copilot Instructions"
  }
}
