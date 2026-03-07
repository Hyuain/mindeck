import { invoke } from "@tauri-apps/api/core"
import type { Skill } from "@/types"

// ─── CRUD ─────────────────────────────────────────────────────

export async function listSkills(): Promise<Skill[]> {
  const records = await invoke<Skill[]>("list_skills")
  return records
}

export async function saveSkill(skill: Skill): Promise<void> {
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
  tools?: string[],
): Skill {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    description,
    systemPrompt,
    tools,
    createdAt: now,
    updatedAt: now,
  }
}
