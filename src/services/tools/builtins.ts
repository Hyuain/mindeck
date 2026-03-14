/**
 * Built-in tool executors backed by Tauri commands.
 * Call registerBuiltins() once at app startup.
 */
import { invoke } from "@tauri-apps/api/core"
import { registerTool } from "./registry"
import { eventBus } from "@/services/events/event-bus"
import { createLogger } from "@/services/logger"
import { requestPermission } from "@/services/security/permissions"
import { getActiveSandbox } from "@/services/agents/workspace-agent"
import { stripThinkingTags } from "@/services/thinking"

const log = createLogger("builtins")

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
      // H3.1: Emit file:written for harness trigger routing
      // workspaceId is not known at this scope — harness-engine listens broadly
      eventBus.emit("file:written", {
        workspaceId: "__any__",
        filePath: args.path as string,
      })
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
    async execute(args, onChunk) {
      const granted = await requestPermission(
        "bash_exec",
        "Run shell command",
        args.command as string
      )
      if (!granted) throw new Error("Execution cancelled by user")

      // E4.6: Route through Docker sandbox if active (Layer 2)
      const sandbox = getActiveSandbox()
      if (sandbox?.isRunning) {
        const result = await sandbox.exec(
          args.command as string,
          args.cwd as string | undefined,
          onChunk
        )
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exitCode,
        }
      }

      // E4.3: Use streaming variant when caller provides an onChunk callback
      if (onChunk) {
        const { Channel } = await import("@tauri-apps/api/core")
        type BashChunkEvent =
          | { type: "stdout"; data: string }
          | { type: "stderr"; data: string }
          | { type: "exit"; code: number }
        const channel = new Channel<BashChunkEvent>()
        let stdout = ""
        let stderr = ""
        let exitCode = 0
        channel.onmessage = (ev) => {
          if (ev.type === "stdout") {
            stdout += ev.data + "\n"
            onChunk(ev.data)
          } else if (ev.type === "stderr") {
            stderr += ev.data + "\n"
          } else if (ev.type === "exit") {
            exitCode = ev.code
          }
        }
        await invoke("bash_exec_stream", {
          command: args.command,
          cwd: args.cwd ?? null,
          onEvent: channel,
        })
        return { stdout, stderr, exit_code: exitCode }
      }

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
      const granted = await requestPermission(
        "web_fetch",
        "Fetch URL",
        args.url as string
      )
      if (!granted) throw new Error("Fetch cancelled by user")
      const res = await fetch(args.url as string)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      return res.text()
    },
  })

  // ── report_to_majordomo ───────────────────────────────────
  registerTool({
    definition: {
      name: "report_to_majordomo",
      description:
        "Send a status update or result back to Majordomo. Use this to proactively report progress or findings.",
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
    async execute(args) {
      const { workspaceId, summary, details } = args as {
        workspaceId: string
        summary: string
        details: string
      }
      const cleanDetails = stripThinkingTags(details)
      eventBus.emit("task:result", {
        dispatchId: crypto.randomUUID(),
        workspaceId,
        result: cleanDetails,
        summary: summary.slice(0, 200),
      })
      log.info("report_to_majordomo: emitted task:result", { workspaceId, summary })
      return `Report sent to Majordomo: "${summary}"`
    },
  })
}
