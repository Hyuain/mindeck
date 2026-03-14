import { describe, it, expect } from "vitest"
import { parseSkillMd, legacyJsonToSkill, slugify } from "./skill-loader"

describe("slugify", () => {
  it("converts to lowercase hyphenated slug", () => {
    expect(slugify("Hello World")).toBe("hello-world")
  })

  it("strips leading/trailing hyphens", () => {
    expect(slugify("--foo-bar--")).toBe("foo-bar")
  })

  it("replaces non-alphanumeric chars with hyphens", () => {
    expect(slugify("My Skill! (v2)")).toBe("my-skill-v2")
  })

  it("handles empty string", () => {
    expect(slugify("")).toBe("")
  })
})

describe("parseSkillMd", () => {
  it("parses a full SKILL.md with frontmatter and body", () => {
    const raw = `---
name: Code Review
description: Reviews code quality
version: 1.0.0
author: Harvey
tags: [code, review]
allowed-tools: [read_file, bash_exec]
---

Review the code for quality issues.`

    const skill = parseSkillMd(raw, "/skills/code-review/SKILL.md")
    expect(skill.name).toBe("Code Review")
    expect(skill.description).toBe("Reviews code quality")
    expect(skill.version).toBe("1.0.0")
    expect(skill.author).toBe("Harvey")
    expect(skill.tags).toEqual(["code", "review"])
    expect(skill.allowedTools).toEqual(["read_file", "bash_exec"])
    expect(skill.instructions).toBe("Review the code for quality issues.")
    expect(skill.systemPrompt).toBe("Review the code for quality issues.")
    expect(skill.source).toEqual({ type: "skill-md", path: "/skills/code-review/SKILL.md" })
  })

  it("derives name from directory when no frontmatter name", () => {
    const raw = `---
description: Something
---

Body text.`

    const skill = parseSkillMd(raw, "/skills/my-tool/SKILL.md")
    expect(skill.name).toBe("My Tool")
  })

  it("treats entire file as instructions when no frontmatter", () => {
    const raw = "Just plain instructions, no frontmatter."
    const skill = parseSkillMd(raw, "/skills/plain/SKILL.md")
    expect(skill.instructions).toBe("Just plain instructions, no frontmatter.")
    expect(skill.name).toBe("Plain")
    expect(skill.description).toBe("")
  })

  it("derives ID from parent directory name for SKILL.md files", () => {
    const skill = parseSkillMd("---\nname: X\n---\nBody", "/skills/my-dir/SKILL.md")
    expect(skill.id).toBe("my-dir")
  })

  it("derives ID from filename stem for non-SKILL.md files", () => {
    const skill = parseSkillMd("---\nname: X\n---\nBody", "/skills/custom-skill.md")
    expect(skill.id).toBe("custom-skill")
  })

  it("handles frontmatter with YAML-style list items", () => {
    const raw = `---
name: Multi
tags:
  - alpha
  - beta
  - gamma
---

Body`

    const skill = parseSkillMd(raw, "/skills/multi/SKILL.md")
    expect(skill.tags).toEqual(["alpha", "beta", "gamma"])
  })
})

describe("legacyJsonToSkill", () => {
  it("converts a legacy JSON record to Skill", () => {
    const json = {
      id: "legacy-1",
      name: "Old Skill",
      description: "Legacy desc",
      systemPrompt: "Do legacy things",
      tools: ["bash_exec"],
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-06-01T00:00:00Z",
    }
    const skill = legacyJsonToSkill(json)
    expect(skill.id).toBe("legacy-1")
    expect(skill.name).toBe("Old Skill")
    expect(skill.systemPrompt).toBe("Do legacy things")
    expect(skill.instructions).toBe("Do legacy things")
    expect(skill.tools).toEqual(["bash_exec"])
    expect(skill.source).toEqual({ type: "native" })
  })

  it("handles missing fields gracefully", () => {
    const skill = legacyJsonToSkill({})
    expect(skill.id).toBeDefined()
    expect(skill.name).toBe("")
    expect(skill.description).toBe("")
    expect(skill.systemPrompt).toBe("")
  })
})
