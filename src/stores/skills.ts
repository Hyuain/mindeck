import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Skill } from "@/types"

interface SkillsState {
  // ─── Global skills (Majordomo) ───────────────────────────────
  skills: Skill[]
  /** Active skill IDs for Majordomo (multi-select) */
  activeSkillIds: string[]

  // ─── Workspace-scoped skills ─────────────────────────────────
  /** Discovered skills per workspace: workspaceId → Skill[] */
  workspaceSkills: Record<string, Skill[]>
  /** Active skill IDs per workspace: workspaceId → skillId[] */
  workspaceActiveSkillIds: Record<string, string[]>

  // ─── Global actions ───────────────────────────────────────────
  setSkills: (skills: Skill[]) => void
  activateMajordomoSkill: (id: string) => void
  deactivateMajordomoSkill: (id: string) => void
  getMajordomoActiveSkills: () => Skill[]
  addSkill: (skill: Skill) => void
  updateSkill: (skill: Skill) => void
  removeSkill: (id: string) => void

  // ─── Workspace skill actions ─────────────────────────────────
  setWorkspaceSkills: (workspaceId: string, skills: Skill[]) => void
  activateWorkspaceSkill: (workspaceId: string, skillId: string) => void
  deactivateWorkspaceSkill: (workspaceId: string, skillId: string) => void
  getWorkspaceActiveSkills: (workspaceId: string) => Skill[]
  deleteWorkspaceData: (workspaceId: string) => void
}

export const useSkillsStore = create<SkillsState>()(
  persist(
    (set, get) => ({
      skills: [],
      activeSkillIds: [],
      workspaceSkills: {},
      workspaceActiveSkillIds: {},

      // ─── Global actions ──────────────────────────────────────────
      setSkills: (skills) => set({ skills }),

      activateMajordomoSkill: (id) =>
        set((state) => {
          if (state.activeSkillIds.includes(id)) return state
          return { activeSkillIds: [...state.activeSkillIds, id] }
        }),

      deactivateMajordomoSkill: (id) =>
        set((state) => ({
          activeSkillIds: state.activeSkillIds.filter((sid) => sid !== id),
        })),

      getMajordomoActiveSkills: () => {
        const state = get()
        return state.skills.filter((s) => state.activeSkillIds.includes(s.id))
      },

      addSkill: (skill) => set((state) => ({ skills: [...state.skills, skill] })),

      updateSkill: (skill) =>
        set((state) => ({
          skills: state.skills.map((s) => (s.id === skill.id ? skill : s)),
        })),

      removeSkill: (id) =>
        set((state) => ({
          skills: state.skills.filter((s) => s.id !== id),
          activeSkillIds: state.activeSkillIds.filter((sid) => sid !== id),
        })),

      // ─── Workspace skill actions ─────────────────────────────────
      setWorkspaceSkills: (workspaceId, skills) =>
        set((state) => ({
          workspaceSkills: { ...state.workspaceSkills, [workspaceId]: skills },
        })),

      activateWorkspaceSkill: (workspaceId, skillId) =>
        set((state) => {
          const current = state.workspaceActiveSkillIds[workspaceId] ?? []
          if (current.includes(skillId)) return state
          return {
            workspaceActiveSkillIds: {
              ...state.workspaceActiveSkillIds,
              [workspaceId]: [...current, skillId],
            },
          }
        }),

      deactivateWorkspaceSkill: (workspaceId, skillId) =>
        set((state) => {
          const current = state.workspaceActiveSkillIds[workspaceId] ?? []
          return {
            workspaceActiveSkillIds: {
              ...state.workspaceActiveSkillIds,
              [workspaceId]: current.filter((id) => id !== skillId),
            },
          }
        }),

      getWorkspaceActiveSkills: (workspaceId) => {
        const state = get()
        const activeIds = state.workspaceActiveSkillIds[workspaceId] ?? []
        const skills = state.workspaceSkills[workspaceId] ?? []
        return skills.filter((s) => activeIds.includes(s.id))
      },

      deleteWorkspaceData: (workspaceId) =>
        set((state) => {
          const { [workspaceId]: _ws, ...workspaceSkills } = state.workspaceSkills
          const { [workspaceId]: _wa, ...workspaceActiveSkillIds } =
            state.workspaceActiveSkillIds
          return { workspaceSkills, workspaceActiveSkillIds }
        }),
    }),
    {
      name: "mindeck-skills",
      // Only persist the active ID lists — skill objects are loaded from disk at startup
      partialize: (state) => ({
        activeSkillIds: state.activeSkillIds,
        workspaceActiveSkillIds: state.workspaceActiveSkillIds,
      }),
    }
  )
)
