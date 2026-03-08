/**
 * skill-discovery.ts — Multi-path discovery engine for skills.
 *
 * Discovery paths (priority order):
 *
 * Global (~/.mindeck/skills/ + ~/.claude/skills/ + plugin cache):
 *   - {name}/SKILL.md  → SKILL.md format
 *   - {id}.json        → legacy JSON format
 *
 * Workspace (given workspacePath):
 *   - .agents/skills/{name}/SKILL.md
 *   - .claude/skills/{name}/SKILL.md
 *   - .mindeck/skills/{name}/SKILL.md
 *   - .opencode/skills/{name}/SKILL.md
 *
 * Plugin cache (~/.claude/plugins/cache/<source>/<pkg>/<version>/):
 *   - .agents/skills/{name}/SKILL.md
 *   - .cursor/skills/{name}/SKILL.md
 *   - skills/{name}/SKILL.md
 */

import { invoke } from "@tauri-apps/api/core"
import type { FileNode } from "@/types"
import type { Skill, SkillIndex, SkillSource } from "@/types"
import { parseSkillMd, legacyJsonToSkill } from "./skill-loader"

// ─── Public API ───────────────────────────────────────────────

export async function discoverGlobalSkills(): Promise<SkillIndex[]> {
  const home = await resolveHome()

  const [userSkills, pluginSkills] = await Promise.all([
    // User-level dirs
    Promise.all(
      [`${home}/.mindeck/skills`, `${home}/.claude/skills`].map((dir) =>
        discoverSkillsInDir(dir, "global").catch(() => [])
      )
    ).then((r) => r.flat()),
    // Plugin cache
    discoverPluginSkills(home),
  ])

  return deduplicateByIds([...userSkills, ...pluginSkills])
}

export async function discoverWorkspaceSkills(
  workspacePath: string
): Promise<SkillIndex[]> {
  const home = await resolveHome()
  const searchDirs = [
    // Project-local dirs (highest priority)
    `${workspacePath}/.agents/skills`,
    `${workspacePath}/.claude/skills`,
    `${workspacePath}/.mindeck/skills`,
    `${workspacePath}/.opencode/skills`,
    // User-level global dirs (shown in catalog with source badge)
    `${home}/.claude/skills`,
    `${home}/.mindeck/skills`,
  ]

  const [dirSkills, pluginSkills] = await Promise.all([
    Promise.all(
      searchDirs.map((dir) => discoverSkillsInDir(dir, "workspace").catch(() => []))
    ).then((r) => r.flat()),
    discoverPluginSkills(home),
  ])

  return deduplicateByIds([...dirSkills, ...pluginSkills])
}

/**
 * Scan ~/.claude/plugins/cache for SKILL.md files.
 *
 * Cache layout: <cacheDir>/<source>/<package>/<version>/
 * Within each version dir, skills live in:
 *   .agents/skills/<name>/SKILL.md
 *   .cursor/skills/<name>/SKILL.md
 *   skills/<name>/SKILL.md
 */
export async function discoverPluginSkills(home: string): Promise<SkillIndex[]> {
  const cacheDir = `${home}/.claude/plugins/cache`
  const results: SkillIndex[] = []

  let sources: FileNode[]
  try {
    sources = (await invoke<FileNode[]>("list_dir", { path: cacheDir })).filter((e) => e.isDir)
  } catch {
    return results
  }

  await Promise.all(
    sources.map(async (source) => {
      let packages: FileNode[]
      try {
        packages = (await invoke<FileNode[]>("list_dir", { path: source.path })).filter((e) => e.isDir)
      } catch {
        return
      }

      await Promise.all(
        packages.map(async (pkg) => {
          let versions: FileNode[]
          try {
            versions = (await invoke<FileNode[]>("list_dir", { path: pkg.path })).filter((e) => e.isDir)
          } catch {
            return
          }

          // Only scan the latest version (last entry, typically sorted by semver)
          const latest = versions[versions.length - 1]
          if (!latest) return

          const skillSubDirs = [
            `${latest.path}/.agents/skills`,
            `${latest.path}/.cursor/skills`,
            `${latest.path}/skills`,
          ]

          const found = await Promise.all(
            skillSubDirs.map((dir) => discoverSkillsInDir(dir, "global").catch(() => []))
          )

          for (const batch of found) {
            results.push(...batch)
          }
        })
      )
    })
  )

  return results
}

export async function loadFullSkill(index: SkillIndex): Promise<Skill> {
  const source = index.source

  if (source.type === "skill-md" && source.path) {
    const raw = await invoke<string>("read_file", { path: source.path })
    return parseSkillMd(raw, source.path)
  }

  if (source.type === "native" && index.path) {
    const raw = await invoke<string>("read_file", { path: index.path })
    return legacyJsonToSkill(JSON.parse(raw) as Record<string, unknown>)
  }

  // Fallback: construct from index data
  const now = new Date().toISOString()
  return {
    id: index.id,
    name: index.name,
    description: index.description,
    instructions: "",
    systemPrompt: "",
    source: index.source,
    createdAt: now,
    updatedAt: now,
  }
}

// ─── Internal helpers ─────────────────────────────────────────

async function discoverSkillsInDir(
  dir: string,
  _scope: "global" | "workspace"
): Promise<SkillIndex[]> {
  let entries: FileNode[]
  try {
    entries = await invoke<FileNode[]>("list_dir", { path: dir })
  } catch {
    // Dir doesn't exist — not an error
    return []
  }

  const results: SkillIndex[] = []

  for (const entry of entries) {
    if (entry.isDir) {
      // Try to read {name}/SKILL.md — buildSkillMdIndex returns null on any error
      const index = await buildSkillMdIndex(`${entry.path}/SKILL.md`)
      if (index) results.push(index)
    } else if (entry.name.endsWith(".json") && !entry.name.startsWith(".")) {
      // Legacy {id}.json
      const index = await buildLegacyJsonIndex(entry.path)
      if (index) results.push(index)
    }
  }

  return results
}

/** Deduplicate a list of SkillIndex by id, keeping the first occurrence. */
function deduplicateByIds(skills: SkillIndex[]): SkillIndex[] {
  const seen = new Set<string>()
  return skills.filter((s) => {
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  })
}

async function buildSkillMdIndex(path: string): Promise<SkillIndex | null> {
  try {
    const raw = await invoke<string>("read_file", { path })
    const skill = parseSkillMd(raw, path)
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      source: { type: "skill-md", path } satisfies SkillSource,
      path,
    }
  } catch {
    return null
  }
}

async function buildLegacyJsonIndex(path: string): Promise<SkillIndex | null> {
  try {
    const raw = await invoke<string>("read_file", { path })
    const json = JSON.parse(raw) as Record<string, unknown>
    if (!json["id"]) return null
    return {
      id: String(json["id"]),
      name: String(json["name"] ?? ""),
      description: String(json["description"] ?? ""),
      source: { type: "native" } satisfies SkillSource,
      path,
    }
  } catch {
    return null
  }
}

/** Get the user home directory via Tauri's path API. */
async function resolveHome(): Promise<string> {
  try {
    const { homeDir } = await import("@tauri-apps/api/path")
    return await homeDir()
  } catch {
    return "~"
  }
}
