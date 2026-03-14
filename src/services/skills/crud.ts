import { invoke } from "@tauri-apps/api/core"
import type { Skill } from "@/types"
import { exportSkillMd, exportToOpenClaw, importFromOpenClaw } from "./import-export"

// Re-export adapter functions for use throughout the app
export { exportSkillMd, exportToOpenClaw, importFromOpenClaw }

// ─── CRUD ─────────────────────────────────────────────────────

export async function listSkills(): Promise<Skill[]> {
  const records = await invoke<Skill[]>("list_skills")
  return records
}

export async function saveSkill(skill: Skill): Promise<void> {
  // New skills with SKILL.md source are saved as Markdown
  if (skill.source?.type === "skill-md") {
    const content = exportSkillMd(skill)
    const dirName = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    await invoke("save_skill_md", { name: dirName, content })
    return
  }
  // Legacy / native skills saved as JSON
  await invoke("save_skill", { record: skill })
}

export async function deleteSkill(id: string): Promise<void> {
  await invoke("delete_skill", { id })
}

// ─── Helpers ──────────────────────────────────────────────────

export function makeSkill(
  name: string,
  description: string,
  systemPrompt: string,
  tools?: string[]
): Skill {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    description,
    instructions: systemPrompt,
    systemPrompt,
    tools,
    source: { type: "native" },
    createdAt: now,
    updatedAt: now,
  }
}
