import { describe, it, expect } from "vitest"
import { scoreSkillForTask, suggestSkills } from "./auto-matcher"
import { makeTestSkill } from "@/test/factories"

describe("scoreSkillForTask", () => {
  it("returns 0 for empty task text", () => {
    const skill = makeTestSkill({ name: "Code Review", description: "Reviews code" })
    expect(scoreSkillForTask(skill, "")).toBe(0)
    expect(scoreSkillForTask(skill, "   ")).toBe(0)
  })

  it("returns 0 for skill with no name/description/tags tokens", () => {
    const skill = makeTestSkill({ name: "", description: "", tags: [] })
    expect(scoreSkillForTask(skill, "review code")).toBe(0)
  })

  it("scores higher for tag matches (3x weight)", () => {
    const withTags = makeTestSkill({
      name: "Linter",
      description: "Check style",
      tags: ["review", "code"],
    })
    const withoutTags = makeTestSkill({
      name: "Linter",
      description: "Check style",
      tags: [],
    })
    const scoreWith = scoreSkillForTask(withTags, "review code")
    const scoreWithout = scoreSkillForTask(withoutTags, "review code")
    expect(scoreWith).toBeGreaterThan(scoreWithout)
  })

  it("scores higher for name matches (2x weight) vs description (1x)", () => {
    const nameMatch = makeTestSkill({
      name: "Code Review",
      description: "Something else",
    })
    const descMatch = makeTestSkill({
      name: "Something Else",
      description: "Code review helper",
    })
    expect(scoreSkillForTask(nameMatch, "review code")).toBeGreaterThan(
      scoreSkillForTask(descMatch, "review code")
    )
  })

  it("returns a value between 0 and 1", () => {
    const skill = makeTestSkill({
      name: "Test Runner",
      description: "Runs tests",
      tags: ["testing"],
    })
    const score = scoreSkillForTask(skill, "run tests for testing")
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it("filters out stop words", () => {
    const skill = makeTestSkill({ name: "Deploy", description: "Deploy app" })
    // "the" is a stop word — should not match
    const score = scoreSkillForTask(skill, "the")
    expect(score).toBe(0)
  })
})

describe("suggestSkills", () => {
  it("returns empty array for empty task text", () => {
    const skills = [makeTestSkill({ name: "Code Review" })]
    expect(suggestSkills("", skills)).toEqual([])
  })

  it("returns empty array when no skills provided", () => {
    expect(suggestSkills("review code", [])).toEqual([])
  })

  it("returns matching skills ranked by score", () => {
    const skills = [
      makeTestSkill({ name: "Code Review", description: "Reviews code", tags: ["review"] }),
      makeTestSkill({ name: "Deploy", description: "Deploys apps" }),
      makeTestSkill({ name: "Test Runner", description: "Runs code tests" }),
    ]
    const result = suggestSkills("review code", skills)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].name).toBe("Code Review")
  })

  it("respects the limit parameter", () => {
    const skills = Array.from({ length: 10 }, (_, i) =>
      makeTestSkill({ name: `Skill ${i}`, description: "code review testing", tags: ["code"] })
    )
    const result = suggestSkills("code review testing", skills, 2)
    expect(result.length).toBeLessThanOrEqual(2)
  })

  it("excludes skills with disableAutoInvoke", () => {
    const skills = [
      makeTestSkill({ name: "Code Review", description: "Reviews code", disableAutoInvoke: true }),
      makeTestSkill({ name: "Test Runner", description: "Runs code tests" }),
    ]
    const result = suggestSkills("review code tests", skills)
    const names = result.map((s) => s.name)
    expect(names).not.toContain("Code Review")
  })

  it("filters out skills below threshold", () => {
    const skills = [
      makeTestSkill({ name: "Unrelated", description: "Completely different domain" }),
    ]
    const result = suggestSkills("review code", skills)
    // "Unrelated" + "Completely different domain" should not match "review code"
    expect(result).toHaveLength(0)
  })
})
