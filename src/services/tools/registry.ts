import type { ToolDefinition } from "@/types"

export interface ToolExecutor {
  definition: ToolDefinition
  execute(args: Record<string, unknown>): Promise<unknown>
}

export const toolRegistry = new Map<string, ToolExecutor>()

export function registerTool(executor: ToolExecutor): void {
  toolRegistry.set(executor.definition.name, executor)
}

export function getToolDefinitions(names?: string[]): ToolDefinition[] {
  if (!names) {
    return Array.from(toolRegistry.values()).map((e) => e.definition)
  }
  return names
    .map((n) => toolRegistry.get(n)?.definition)
    .filter((d): d is ToolDefinition => d !== undefined)
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const executor = toolRegistry.get(name)
  if (!executor) {
    throw new Error(`Tool '${name}' is not registered`)
  }
  return executor.execute(args)
}
