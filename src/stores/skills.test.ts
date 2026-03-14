import { describe, it, expect, beforeEach } from "vitest"
import { useSkillsStore } from "./skills"
import { makeTestSkill } from "@/test/factories"

describe("useSkillsStore", () => {
  beforeEach(() => {
    useSkillsStore.setState({
      skills: [],
      activeSkillIds: [],
      workspaceSkills: {},
      workspaceActiveSkillIds: {},
    })
  })

  describe("global skills", () => {
    it("sets skills", () => {
      const skills = [makeTestSkill({ id: "s1" })]
      useSkillsStore.getState().setSkills(skills)
      expect(useSkillsStore.getState().skills).toHaveLength(1)
    })

    it("adds a skill", () => {
      useSkillsStore.getState().addSkill(makeTestSkill({ id: "s1" }))
      expect(useSkillsStore.getState().skills).toHaveLength(1)
    })

    it("updates a skill by id", () => {
      useSkillsStore.getState().addSkill(makeTestSkill({ id: "s1", name: "Old" }))
      useSkillsStore.getState().updateSkill(makeTestSkill({ id: "s1", name: "New" }))
      expect(useSkillsStore.getState().skills[0].name).toBe("New")
    })

    it("removes a skill and its active state", () => {
      useSkillsStore.getState().addSkill(makeTestSkill({ id: "s1" }))
      useSkillsStore.getState().activateMajordomoSkill("s1")
      useSkillsStore.getState().removeSkill("s1")
      expect(useSkillsStore.getState().skills).toHaveLength(0)
      expect(useSkillsStore.getState().activeSkillIds).not.toContain("s1")
    })
  })

  describe("majordomo skill activation", () => {
    it("activates a skill", () => {
      useSkillsStore.getState().activateMajordomoSkill("s1")
      expect(useSkillsStore.getState().activeSkillIds).toContain("s1")
    })

    it("does not duplicate active skill ids", () => {
      useSkillsStore.getState().activateMajordomoSkill("s1")
      useSkillsStore.getState().activateMajordomoSkill("s1")
      expect(useSkillsStore.getState().activeSkillIds.filter((id) => id === "s1")).toHaveLength(1)
    })

    it("deactivates a skill", () => {
      useSkillsStore.getState().activateMajordomoSkill("s1")
      useSkillsStore.getState().deactivateMajordomoSkill("s1")
      expect(useSkillsStore.getState().activeSkillIds).not.toContain("s1")
    })

    it("getMajordomoActiveSkills returns matching skill objects", () => {
      const skill = makeTestSkill({ id: "s1" })
      useSkillsStore.getState().setSkills([skill])
      useSkillsStore.getState().activateMajordomoSkill("s1")
      expect(useSkillsStore.getState().getMajordomoActiveSkills()).toEqual([skill])
    })
  })

  describe("workspace skills", () => {
    it("sets workspace skills", () => {
      const skills = [makeTestSkill({ id: "ws-s1" })]
      useSkillsStore.getState().setWorkspaceSkills("ws-1", skills)
      expect(useSkillsStore.getState().workspaceSkills["ws-1"]).toHaveLength(1)
    })

    it("activates a workspace skill", () => {
      useSkillsStore.getState().activateWorkspaceSkill("ws-1", "ws-s1")
      expect(useSkillsStore.getState().workspaceActiveSkillIds["ws-1"]).toContain("ws-s1")
    })

    it("deactivates a workspace skill", () => {
      useSkillsStore.getState().activateWorkspaceSkill("ws-1", "ws-s1")
      useSkillsStore.getState().deactivateWorkspaceSkill("ws-1", "ws-s1")
      expect(useSkillsStore.getState().workspaceActiveSkillIds["ws-1"]).not.toContain("ws-s1")
    })

    it("does not duplicate workspace active skill ids", () => {
      useSkillsStore.getState().activateWorkspaceSkill("ws-1", "ws-s1")
      useSkillsStore.getState().activateWorkspaceSkill("ws-1", "ws-s1")
      const ids = useSkillsStore.getState().workspaceActiveSkillIds["ws-1"]
      expect(ids.filter((id) => id === "ws-s1")).toHaveLength(1)
    })

    it("getWorkspaceActiveSkills returns matching skill objects", () => {
      const skill = makeTestSkill({ id: "ws-s1" })
      useSkillsStore.getState().setWorkspaceSkills("ws-1", [skill])
      useSkillsStore.getState().activateWorkspaceSkill("ws-1", "ws-s1")
      expect(useSkillsStore.getState().getWorkspaceActiveSkills("ws-1")).toEqual([skill])
    })

    it("deleteWorkspaceData removes workspace skills and active ids", () => {
      useSkillsStore.getState().setWorkspaceSkills("ws-1", [makeTestSkill()])
      useSkillsStore.getState().activateWorkspaceSkill("ws-1", "s1")
      useSkillsStore.getState().deleteWorkspaceData("ws-1")
      expect(useSkillsStore.getState().workspaceSkills["ws-1"]).toBeUndefined()
      expect(useSkillsStore.getState().workspaceActiveSkillIds["ws-1"]).toBeUndefined()
    })
  })
})
