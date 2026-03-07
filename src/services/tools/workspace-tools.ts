/**
 * Workspace-specific tools created per WorkspaceAgent instance.
 * These tools capture workspace context (provider, model) in a closure,
 * so they are NOT registered in the global tool registry.
 */
import { runAgentLoop } from "../agentic-loop"
import { getToolDefinitions } from "./registry"
import type { AgentMessage, ToolActivity, ToolDefinition } from "@/types"

export interface WorkspaceToolContext {
  providerId: string
  providerType: string
  modelId: string
  workspaceId: string
  workspaceName: string
  onSubAgentToolStart: (activity: ToolActivity) => void
  onSubAgentToolEnd: (activity: ToolActivity) => void
}

export interface WorkspaceTools {
  definitions: ToolDefinition[]
  executors: Map<string, (args: Record<string, unknown>) => Promise<unknown>>
}

export function createWorkspaceTools(ctx: WorkspaceToolContext): WorkspaceTools {
  const definitions: ToolDefinition[] = [
    {
      name: "spawn_sub_agent",
      description:
        "Spawn a temporary sub-agent to work on a specific subtask. The sub-agent has access to file tools (list_dir, read_file, write_file, bash_exec, web_fetch) and returns its result when done. Use this to delegate a focused, self-contained subtask.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Short identifier for this sub-agent, e.g. 'blender-researcher'",
          },
          task: {
            type: "string",
            description: "Complete, self-contained task description for the sub-agent",
          },
        },
        required: ["name", "task"],
      },
    },
    {
      name: "spawn_sub_agent_team",
      description:
        "Spawn multiple sub-agents in parallel, each working on its own independent subtask. All results are returned together once all sub-agents finish. Use this to parallelize work across independent subtasks (e.g. one sub-agent per software/topic/file).",
      parameters: {
        type: "object",
        properties: {
          agents: {
            type: "array",
            description: "List of sub-agents to spawn in parallel",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Short identifier for this sub-agent",
                },
                task: {
                  type: "string",
                  description: "Complete, self-contained task for this sub-agent",
                },
              },
              required: ["name", "task"],
            },
          },
        },
        required: ["agents"],
      },
    },
  ]

  const executors = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()

  executors.set("spawn_sub_agent", async (args) => {
    const name = args.name as string
    const task = args.task as string
    return runSubAgent(name, task, ctx)
  })

  executors.set("spawn_sub_agent_team", async (args) => {
    const agents = args.agents as Array<{ name: string; task: string }>
    const results = await Promise.all(
      agents.map(({ name, task }) => runSubAgent(name, task, ctx))
    )
    return agents.map(({ name }, i) => `## ${name}\n\n${results[i]}`).join("\n\n---\n\n")
  })

  return { definitions, executors }
}

async function runSubAgent(
  name: string,
  task: string,
  ctx: WorkspaceToolContext
): Promise<string> {
  const subId = crypto.randomUUID()

  // Announce sub-agent start as a special top-level activity
  ctx.onSubAgentToolStart({
    id: subId,
    name: `[${name}]`,
    args: { task: task.slice(0, 120) + (task.length > 120 ? "…" : "") },
    status: "running",
    subAgent: name,
    startedAt: new Date().toISOString(),
  })

  const systemPrompt = [
    `You are sub-agent "${name}", a temporary specialist spawned by the workspace agent for "${ctx.workspaceName}".`,
    "Complete the given task autonomously using your tools. Do NOT ask clarifying questions.",
    "When finished, your final response is returned directly to the parent agent as your result.",
    "",
    "Available tools: list_dir, read_file, write_file, delete_path, bash_exec, web_fetch.",
  ].join("\n")

  const history: AgentMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ]

  // Sub-agents get the standard global tools but NOT spawn_sub_agent (no infinite nesting)
  const subTools = getToolDefinitions()

  let result = ""
  try {
    result = await runAgentLoop({
      providerId: ctx.providerId,
      providerType: ctx.providerType,
      modelId: ctx.modelId,
      history,
      tools: subTools,
      // Sub-agent chunks are not streamed to parent UI — result returned as tool output
      onChunk: () => {},
      onToolStart: (activity) => {
        ctx.onSubAgentToolStart({ ...activity, subAgent: name })
      },
      onToolEnd: (activity) => {
        ctx.onSubAgentToolEnd({ ...activity, subAgent: name })
      },
    })
  } catch (err) {
    result = `Sub-agent "${name}" failed: ${err instanceof Error ? err.message : String(err)}`
  }

  ctx.onSubAgentToolEnd({
    id: subId,
    name: `[${name}]`,
    args: { task: task.slice(0, 120) + (task.length > 120 ? "…" : "") },
    status: "done",
    result: result.slice(0, 300) + (result.length > 300 ? "…" : ""),
    subAgent: name,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  })

  return result
}
