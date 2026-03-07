/**
 * Built-in tool executors backed by Tauri commands.
 * Call registerBuiltins() once at app startup.
 */
import { invoke } from "@tauri-apps/api/core"
import { registerTool } from "./registry"
import { eventBus } from "@/services/event-bus"
import { useWorkspaceStore } from "@/stores/workspace"

export function registerBuiltins(): void {
  // ── list_dir ──────────────────────────────────────────────
  registerTool({
    definition: {
      name: "list_dir",
      description: "List files and directories at the given path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the directory" },
        },
        required: ["path"],
      },
    },
    async execute(args) {
      return invoke("list_dir", { path: args.path })
    },
  })

  // ── read_file ─────────────────────────────────────────────
  registerTool({
    definition: {
      name: "read_file",
      description: "Read the text content of a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file" },
        },
        required: ["path"],
      },
    },
    async execute(args) {
      return invoke("read_file", { path: args.path })
    },
  })

  // ── write_file ────────────────────────────────────────────
  registerTool({
    definition: {
      name: "write_file",
      description: "Write text content to a file (creates parent dirs if needed).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file" },
          content: { type: "string", description: "Text content to write" },
        },
        required: ["path", "content"],
      },
    },
    async execute(args) {
      await invoke("write_file", { path: args.path, content: args.content })
      return "File written successfully"
    },
  })

  // ── delete_path ───────────────────────────────────────────
  registerTool({
    definition: {
      name: "delete_path",
      description: "Delete a file or directory (recursive for directories).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to delete" },
        },
        required: ["path"],
      },
    },
    async execute(args) {
      await invoke("delete_path", { path: args.path })
      return "Deleted successfully"
    },
  })

  // ── list_workspaces ───────────────────────────────────────
  registerTool({
    definition: {
      name: "list_workspaces",
      description: "List all Mindeck workspaces with their names, status, and summaries.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    async execute() {
      return invoke("list_workspaces")
    },
  })

  // ── bash_exec ─────────────────────────────────────────────
  registerTool({
    definition: {
      name: "bash_exec",
      description: "Execute a shell command. Requires user confirmation before running.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          cwd: {
            type: "string",
            description: "Working directory (optional, defaults to home)",
          },
        },
        required: ["command"],
      },
    },
    async execute(args) {
      const confirmed = window.confirm(
        `Majordomo wants to run a shell command:\n\n${args.command}\n\nAllow?`
      )
      if (!confirmed) throw new Error("Execution cancelled by user")
      return invoke("bash_exec", { command: args.command, cwd: args.cwd ?? null })
    },
  })

  // ── web_fetch ─────────────────────────────────────────────
  registerTool({
    definition: {
      name: "web_fetch",
      description: "Fetch the text content of a URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
        },
        required: ["url"],
      },
    },
    async execute(args) {
      const res = await fetch(args.url as string)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      return res.text()
    },
  })

  // ── dispatch_to_workspace ─────────────────────────────────
  registerTool({
    definition: {
      name: "dispatch_to_workspace",
      description:
        "Send a task to a specific workspace's main agent. Use this to delegate sub-tasks. Results are reported back ASYNCHRONOUSLY via report_to_majordomo — do NOT call this again for the same task. Use once per delegation.",
      parameters: {
        type: "object",
        properties: {
          workspaceId: { type: "string", description: "The workspace ID to dispatch to" },
          task: {
            type: "string",
            description: "The task or question to send to the workspace agent",
          },
        },
        required: ["workspaceId", "task"],
      },
    },
    async execute(args) {
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
        console.warn(
          `[dispatch_to_workspace] No workspace matched "${input}" — using as-is`
        )
      }

      const dispatchId = crypto.randomUUID()
      eventBus.emit("task:dispatch", {
        id: dispatchId,
        sourceType: "majordomo",
        targetWorkspaceId: resolvedId,
        task: args.task as string,
        priority: "normal",
      })
      return `Task dispatched to workspace "${match?.name ?? resolvedId}" (id: ${resolvedId}, dispatch: ${dispatchId})`
    },
  })

  // ── report_to_majordomo ───────────────────────────────────
  registerTool({
    definition: {
      name: "report_to_majordomo",
      description:
        "Send a status update or result back to Majordomo. Use this to proactively report progress or ask for guidance.",
      parameters: {
        type: "object",
        properties: {
          workspaceId: { type: "string", description: "This workspace's ID" },
          summary: {
            type: "string",
            description: "Short summary of the result or status (≤200 chars)",
          },
          details: {
            type: "string",
            description: "Full details of the result",
          },
        },
        required: ["workspaceId", "summary", "details"],
      },
    },
    async execute(_args) {
      // Result reporting is handled by WorkspaceAgent after the loop completes.
      // Returning the details here so the agent sees confirmation and can
      // include them in its final response.
      return "Report acknowledged. WorkspaceAgent will forward the result to Majordomo."
    },
  })
}
