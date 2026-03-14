import { describe, it, expect, beforeEach } from "vitest"
import {
  toolRegistry,
  registerTool,
  getToolDefinitions,
  executeTool,
  filterByIntent,
} from "./registry"
import type { ToolExecutor } from "./registry"
import { makeTestToolDefinition } from "@/test/factories"

function makeExecutor(name: string): ToolExecutor {
  return {
    definition: makeTestToolDefinition({ name, description: `Tool ${name}` }),
    execute: async (args) => `executed ${name} with ${JSON.stringify(args)}`,
  }
}

describe("toolRegistry", () => {
  beforeEach(() => {
    toolRegistry.clear()
  })

  describe("registerTool", () => {
    it("adds a tool to the registry", () => {
      registerTool(makeExecutor("test_tool"))
      expect(toolRegistry.has("test_tool")).toBe(true)
    })

    it("overwrites existing tool with same name", () => {
      registerTool(makeExecutor("test_tool"))
      const newExecutor = makeExecutor("test_tool")
      newExecutor.execute = async () => "new"
      registerTool(newExecutor)
      expect(toolRegistry.size).toBe(1)
    })
  })

  describe("getToolDefinitions", () => {
    it("returns all definitions when no names specified", () => {
      registerTool(makeExecutor("tool_a"))
      registerTool(makeExecutor("tool_b"))
      const defs = getToolDefinitions()
      expect(defs).toHaveLength(2)
      const names = defs.map((d) => d.name)
      expect(names).toContain("tool_a")
      expect(names).toContain("tool_b")
    })

    it("returns only requested definitions when names specified", () => {
      registerTool(makeExecutor("tool_a"))
      registerTool(makeExecutor("tool_b"))
      registerTool(makeExecutor("tool_c"))
      const defs = getToolDefinitions(["tool_a", "tool_c"])
      expect(defs).toHaveLength(2)
      expect(defs[0].name).toBe("tool_a")
      expect(defs[1].name).toBe("tool_c")
    })

    it("skips unknown tool names", () => {
      registerTool(makeExecutor("tool_a"))
      const defs = getToolDefinitions(["tool_a", "nonexistent"])
      expect(defs).toHaveLength(1)
    })
  })

  describe("executeTool", () => {
    it("executes a registered tool", async () => {
      registerTool(makeExecutor("my_tool"))
      const result = await executeTool("my_tool", { input: "test" })
      expect(result).toBe('executed my_tool with {"input":"test"}')
    })

    it("throws for unregistered tool", async () => {
      await expect(executeTool("nonexistent", {})).rejects.toThrow(
        "Tool 'nonexistent' is not registered"
      )
    })
  })

  describe("filterByIntent", () => {
    const allDefs = [
      makeTestToolDefinition({ name: "read_file" }),
      makeTestToolDefinition({ name: "write_file" }),
      makeTestToolDefinition({ name: "delete_path" }),
      makeTestToolDefinition({ name: "bash_exec" }),
      makeTestToolDefinition({ name: "list_dir" }),
    ]

    it("blocks write/delete/bash for read-only intent", () => {
      const filtered = filterByIntent(allDefs, "read-only")
      const names = filtered.map((d) => d.name)
      expect(names).toContain("read_file")
      expect(names).toContain("list_dir")
      expect(names).not.toContain("write_file")
      expect(names).not.toContain("delete_path")
      expect(names).not.toContain("bash_exec")
    })

    it("blocks write/delete for analysis intent", () => {
      const filtered = filterByIntent(allDefs, "analysis")
      const names = filtered.map((d) => d.name)
      expect(names).toContain("read_file")
      expect(names).toContain("bash_exec")
      expect(names).not.toContain("write_file")
      expect(names).not.toContain("delete_path")
    })

    it("allows everything for mutation intent", () => {
      const filtered = filterByIntent(allDefs, "mutation")
      expect(filtered).toHaveLength(allDefs.length)
    })

    it("allows everything for full intent", () => {
      const filtered = filterByIntent(allDefs, "full")
      expect(filtered).toHaveLength(allDefs.length)
    })
  })
})
