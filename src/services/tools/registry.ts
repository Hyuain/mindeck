import type { TaskIntent, ToolDefinition } from "@/types"

export interface ToolExecutor {
  definition: ToolDefinition
  execute(args: Record<string, unknown>, onChunk?: (chunk: string) => void): Promise<unknown>
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
  onChunk?: (chunk: string) => void
): Promise<unknown> {
  const executor = toolRegistry.get(name)
  if (!executor) {
    throw new Error(`Tool '${name}' is not registered`)
  }
  return executor.execute(args, onChunk)
}

// ─── Dynamic Action Space (H3.8) ─────────────────────────────

const INTENT_BLOCKLIST: Record<TaskIntent, string[]> = {
  "read-only": ["write_file", "delete_path", "bash_exec"],
  analysis: ["write_file", "delete_path"],
  mutation: [],
  full: [],
}

export function filterByIntent(
  defs: ToolDefinition[],
  intent: TaskIntent
): ToolDefinition[] {
  const blocked = new Set(INTENT_BLOCKLIST[intent])
  if (blocked.size === 0) return defs
  return defs.filter((d) => !blocked.has(d.name))
}
