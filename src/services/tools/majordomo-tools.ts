/**
 * Majordomo-only workspace management tools.
 *
 * These are dynamically injected into the Majordomo agent via extraExecutors,
 * following the same pattern as `load_skill`. They are NEVER registered in
 * the global tool registry, so workspace agents cannot access them.
 */
import { invoke } from "@tauri-apps/api/core"
import {
  newWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from "@/services/workspace/workspace"
import {
  WORKSPACE_TEMPLATES,
  applyTemplate,
} from "@/services/templates/workspace-templates"
import { agentPool } from "@/services/agents/agent-pool"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import { eventBus } from "@/services/events/event-bus"
import { createTask } from "@/services/events/task-manager"
import { createLogger } from "@/services/logger"
import type { ToolDefinition, Workspace } from "@/types"

const log = createLogger("MajordomoTools")

// ─── Shared helper ────────────────────────────────────────────────────────────

/**
 * Resolve a workspace by name, ID, or case-insensitive substring match.
 * Throws a descriptive error if no match is found.
 */
function resolveWorkspace(input: string): Workspace {
  const { workspaces } = useWorkspaceStore.getState()
  const lower = input.toLowerCase()

  // Exact ID match
  const byId = workspaces.find((w) => w.id === input)
  if (byId) return byId

  // Exact name match (case-insensitive)
  const byName = workspaces.find((w) => w.name.toLowerCase() === lower)
  if (byName) return byName

  // Substring match
  const bySub = workspaces.filter((w) => w.name.toLowerCase().includes(lower))
  if (bySub.length === 1) return bySub[0]

  if (bySub.length > 1) {
    const names = bySub.map((w) => w.name).join(", ")
    throw new Error(
      `Ambiguous workspace "${input}" — matches: ${names}. Use the exact name.`
    )
  }

  const available = workspaces.map((w) => w.name).join(", ")
  throw new Error(
    `Workspace "${input}" not found. Available workspaces: ${available || "none"}`
  )
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const LIST_WORKSPACES_DEF: ToolDefinition = {
  name: "list_workspaces",
  description: "List all Mindeck workspaces with their names, status, and summaries.",
  parameters: {
    type: "object",
    properties: {},
  },
}

const DISPATCH_TO_WORKSPACE_DEF: ToolDefinition = {
  name: "dispatch_to_workspace",
  description:
    "Send a task to a specific workspace's agent. Use this to delegate sub-tasks to a workspace. Results are reported back asynchronously — you will receive them when the workspace agent completes.",
  parameters: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "The workspace ID or name to dispatch to",
      },
      task: {
        type: "string",
        description: "The task or question to send to the workspace agent",
      },
    },
    required: ["workspaceId", "task"],
  },
}

const CREATE_WORKSPACE_DEF: ToolDefinition = {
  name: "create_workspace",
  description:
    "Create a new workspace. Optionally apply a template (blank, react, python, rust) and set the provider/model.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name for the new workspace",
      },
      template: {
        type: "string",
        description:
          'Template to apply: "blank", "react", "python", or "rust". Defaults to blank.',
        enum: ["blank", "react", "python", "rust"],
      },
      providerId: {
        type: "string",
        description: "Provider ID to use. Falls back to the first available provider.",
      },
      modelId: {
        type: "string",
        description: "Model ID to use. Falls back to the provider's default model.",
      },
    },
    required: ["name"],
  },
}

const DELETE_WORKSPACE_DEF: ToolDefinition = {
  name: "delete_workspace",
  description:
    "Delete a workspace by name or ID. Refuses if it is the only remaining workspace.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name or ID of the workspace to delete",
      },
    },
    required: ["name"],
  },
}

const RENAME_WORKSPACE_DEF: ToolDefinition = {
  name: "rename_workspace",
  description: "Rename an existing workspace.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Current name or ID of the workspace",
      },
      newName: {
        type: "string",
        description: "New name for the workspace",
      },
    },
    required: ["name", "newName"],
  },
}

const CONFIGURE_WORKSPACE_DEF: ToolDefinition = {
  name: "configure_workspace",
  description:
    "Update a workspace's configuration: system prompt, provider, model, or agent loop toggle.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name or ID of the workspace to configure",
      },
      systemPrompt: {
        type: "string",
        description: "New system prompt for the workspace agent",
      },
      providerId: {
        type: "string",
        description: "New provider ID",
      },
      modelId: {
        type: "string",
        description: "New model ID",
      },
      enableAgentLoop: {
        type: "string",
        description:
          '"true" to enable the full agentic loop with tools, "false" for simple chat',
        enum: ["true", "false"],
      },
    },
    required: ["name"],
  },
}

// ─── Executors ────────────────────────────────────────────────────────────────

async function executeCreateWorkspace(args: Record<string, unknown>): Promise<unknown> {
  const name = args.name as string
  const templateId = (args.template as string | undefined) ?? "blank"
  const providerId = args.providerId as string | undefined
  const modelId = args.modelId as string | undefined

  // Resolve provider + model
  const { providers } = useProviderStore.getState()
  const provider = providerId
    ? (providers.find((p) => p.id === providerId) ?? providers[0])
    : providers[0]
  if (!provider) {
    throw new Error("No providers configured. Cannot create workspace.")
  }
  const resolvedModel =
    modelId ?? provider.defaultModel ?? provider.models?.[0]?.id ?? "llama3.2"

  // Create base workspace
  let ws = newWorkspace(name, provider.id, resolvedModel)

  // Apply template if not blank
  const tpl = WORKSPACE_TEMPLATES.find((t) => t.id === templateId)
  if (tpl && tpl.id !== "blank") {
    ws = applyTemplate(ws, tpl)
  }

  // Persist + update store + connect agent
  await createWorkspace(ws)
  useWorkspaceStore.getState().addWorkspace(ws)
  agentPool.getOrCreate(ws)

  return `Workspace "${name}" created (id: ${ws.id}, template: ${templateId}, model: ${resolvedModel}).`
}

async function executeDeleteWorkspace(args: Record<string, unknown>): Promise<unknown> {
  const input = args.name as string
  const ws = resolveWorkspace(input)

  const { workspaces } = useWorkspaceStore.getState()
  if (workspaces.length <= 1) {
    throw new Error("Cannot delete the only remaining workspace.")
  }

  // If deleting the active workspace, switch to another
  const { activeWorkspaceId } = useWorkspaceStore.getState()
  if (activeWorkspaceId === ws.id) {
    const next = workspaces.find((w) => w.id !== ws.id)
    if (next) {
      useWorkspaceStore.getState().setActiveWorkspace(next.id)
    }
  }

  await deleteWorkspace(ws.id)
  useWorkspaceStore.getState().removeWorkspace(ws.id)
  agentPool.remove(ws.id)
  eventBus.emit("workspace:deleted", { workspaceId: ws.id })

  return `Workspace "${ws.name}" deleted.`
}

async function executeRenameWorkspace(args: Record<string, unknown>): Promise<unknown> {
  const input = args.name as string
  const newName = args.newName as string
  const ws = resolveWorkspace(input)

  const updated: Workspace = {
    ...ws,
    name: newName,
    updatedAt: new Date().toISOString(),
  }

  await updateWorkspace(updated)
  useWorkspaceStore.getState().updateWorkspace(ws.id, { name: newName })
  agentPool.getOrCreate(updated)

  return `Workspace renamed from "${ws.name}" to "${newName}".`
}

async function executeConfigureWorkspace(
  args: Record<string, unknown>
): Promise<unknown> {
  const input = args.name as string
  const ws = resolveWorkspace(input)

  const changes: string[] = []
  const agentConfigPatch: Record<string, unknown> = {}
  const wsPatch: Partial<Workspace> = {}

  if (args.systemPrompt !== undefined) {
    agentConfigPatch.systemPrompt = args.systemPrompt as string
    changes.push("systemPrompt")
  }
  if (args.providerId !== undefined) {
    agentConfigPatch.providerId = args.providerId as string
    changes.push("providerId")
  }
  if (args.modelId !== undefined) {
    agentConfigPatch.modelId = args.modelId as string
    changes.push("modelId")
  }
  if (args.enableAgentLoop !== undefined) {
    agentConfigPatch.enableAgentLoop = args.enableAgentLoop === "true"
    changes.push("enableAgentLoop")
  }

  if (changes.length === 0) {
    return "No configuration changes specified."
  }

  wsPatch.agentConfig = { ...ws.agentConfig, ...agentConfigPatch }

  const updated: Workspace = {
    ...ws,
    ...wsPatch,
    updatedAt: new Date().toISOString(),
  }

  await updateWorkspace(updated)
  useWorkspaceStore.getState().updateWorkspace(ws.id, wsPatch)
  agentPool.getOrCreate(updated)

  return `Workspace "${ws.name}" updated: ${changes.join(", ")}.`
}

async function executeListWorkspaces(): Promise<unknown> {
  return invoke("list_workspaces")
}

async function executeDispatchToWorkspace(
  args: Record<string, unknown>
): Promise<unknown> {
  const input = args.workspaceId as string

  // Resolve name/slug → UUID if the model passed a name instead of a UUID
  const { workspaces } = useWorkspaceStore.getState()
  const match = workspaces.find(
    (ws) =>
      ws.id === input ||
      ws.name.toLowerCase() === input.toLowerCase() ||
      ws.name.toLowerCase().replace(/\s+/g, "-") === input.toLowerCase()
  )
  const resolvedId = match?.id ?? input

  if (!match) {
    log.warn(`dispatch_to_workspace: no workspace matched "${input}" — using as-is`)
  }

  // Create task in TaskStore first (engineering guarantee — not prompt-based)
  const task = createTask(resolvedId, args.task as string, "majordomo")

  log.info("dispatch_to_workspace", {
    targetWorkspace: match?.name ?? resolvedId,
    taskId: task.id,
    content: (args.task as string).slice(0, 80),
  })

  // Notify agent via EventBus (real-time delivery; recovery via TaskStore if missed)
  eventBus.emit("task:dispatch", {
    id: task.id,
    sourceType: "majordomo",
    targetWorkspaceId: resolvedId,
    task: args.task as string,
    priority: "normal",
  })

  return `Task dispatched to "${match?.name ?? resolvedId}" (taskId: ${task.id})`
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createMajordomoWorkspaceTools(): {
  definitions: ToolDefinition[]
  executors: Map<string, (args: Record<string, unknown>) => Promise<unknown>>
} {
  const definitions: ToolDefinition[] = [
    LIST_WORKSPACES_DEF,
    DISPATCH_TO_WORKSPACE_DEF,
    CREATE_WORKSPACE_DEF,
    DELETE_WORKSPACE_DEF,
    RENAME_WORKSPACE_DEF,
    CONFIGURE_WORKSPACE_DEF,
  ]

  const executors = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()
  executors.set("list_workspaces", executeListWorkspaces)
  executors.set("dispatch_to_workspace", executeDispatchToWorkspace)
  executors.set("create_workspace", executeCreateWorkspace)
  executors.set("delete_workspace", executeDeleteWorkspace)
  executors.set("rename_workspace", executeRenameWorkspace)
  executors.set("configure_workspace", executeConfigureWorkspace)

  return { definitions, executors }
}
