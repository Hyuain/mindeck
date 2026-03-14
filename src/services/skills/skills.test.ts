import { describe, it, expect } from "vitest"
import { makeSkill } from "./crud"

describe("makeSkill", () => {
  it("creates a skill with required fields", () => {
    const skill = makeSkill("Code Review", "Reviews code", "Review the code carefully")
    expect(skill.name).toBe("Code Review")
    expect(skill.description).toBe("Reviews code")
    expect(skill.systemPrompt).toBe("Review the code carefully")
    expect(skill.instructions).toBe("Review the code carefully")
    expect(skill.id).toBeDefined()
    expect(skill.createdAt).toBeDefined()
    expect(skill.updatedAt).toBeDefined()
    expect(skill.source).toEqual({ type: "native" })
  })

  it("includes optional tools list", () => {
    const skill = makeSkill("Bash", "Runs commands", "Run bash", [
      "bash_exec",
      "read_file",
    ])
    expect(skill.tools).toEqual(["bash_exec", "read_file"])
  })

  it("omits tools when not provided", () => {
    const skill = makeSkill("Simple", "Simple skill", "Do it")
    expect(skill.tools).toBeUndefined()
  })

  it("creates unique IDs for each call", () => {
    const s1 = makeSkill("A", "a", "a")
    const s2 = makeSkill("B", "b", "b")
    expect(s1.id).not.toBe(s2.id)
  })
})
