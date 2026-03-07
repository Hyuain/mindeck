import { create } from "zustand"
import type { Skill } from "@/types"

interface SkillsState {
  skills: Skill[]
  activeSkillId: string | null
  // actions
  setSkills: (skills: Skill[]) => void
  setActiveSkill: (id: string | null) => void
  addSkill: (skill: Skill) => void
  updateSkill: (skill: Skill) => void
  removeSkill: (id: string) => void
}

export const useSkillsStore = create<SkillsState>((set) => ({
  skills: [],
  activeSkillId: null,

  setSkills: (skills) => set({ skills }),

  setActiveSkill: (activeSkillId) => set({ activeSkillId }),

  addSkill: (skill) =>
    set((state) => ({ skills: [...state.skills, skill] })),

  updateSkill: (skill) =>
    set((state) => ({
      skills: state.skills.map((s) => (s.id === skill.id ? skill : s)),
    })),

  removeSkill: (id) =>
    set((state) => ({
      skills: state.skills.filter((s) => s.id !== id),
      activeSkillId: state.activeSkillId === id ? null : state.activeSkillId,
    })),
}))
