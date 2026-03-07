/**
 * WorkspaceAgent — the main agent for a single workspace.
 *
 * Handles input from both user (via ChatPanel) and Majordomo (via event bus).
 * Runs the full agentic loop (tools, multi-turn) when enableAgentLoop is set.
 * Majordomo-dispatched tasks ALWAYS run the agentic loop so the agent can use
 * tools (list_dir, read_file, etc.) instead of asking for project info.
 * Reports results back to Majordomo via event bus.
 */
import { runAgentLoop } from "./agentic-loop"
import { eventBus } from "./event-bus"
import { appendMessage, makeMessage } from "./conversation"
import { getToolDefinitions } from "./tools/registry"
import { createWorkspaceTools } from "./tools/workspace-tools"
import { streamChat } from "./providers/bridge"
import { resolveContentRoot } from "@/components/workspace/WorkspacePanel"
import { useWorkspaceStore } from "@/stores/workspace"
import { useChatStore } from "@/stores/chat"
import { useProviderStore } from "@/stores/provider"
import type {
  AgentMessage,
  Message,
  MessageSource,
  ToolActivity,
  Workspace,
} from "@/types"

export interface InputSource {
  type: MessageSource
  dispatchId?: string
}

interface QueuedInput {
  content: string
  source: InputSource
}

interface WorkspaceAgentConfig {
  workspace: Workspace
  /** Signal to abort current processing */
  signal?: AbortSignal
  /** Callbacks to update UI */
  onChunk: (delta: string) => void
  onToolStart: (activity: ToolActivity) => void
  onToolEnd: (activity: ToolActivity) => void
  onStreamingChange: (isStreaming: boolean) => void
  /** Called synchronously when a Majordomo dispatch is received, before processing */
  onDispatchReceived?: (task: string) => void
}

// Workspace agents must NOT dispatch to other workspaces —
// only Majordomo orchestrates cross-workspace delegation.
const WORKSPACE_BLOCKED_TOOLS = ["dispatch_to_workspace"]

export class WorkspaceAgent {
  private readonly workspaceId: string
  private queue: QueuedInput[] = []
  private processing = false
  private unsubscribeDispatch: (() => void) | null = null
  private processedDispatchIds = new Set<string>()

  constructor(private config: WorkspaceAgentConfig) {
    this.workspaceId = config.workspace.id
  }

  /** Start listening for Majordomo dispatches targeting this workspace */
  connect(): void {
    this.unsubscribeDispatch?.()
    this.unsubscribeDispatch = eventBus.on("task:dispatch", (event) => {
      console.log(
        `[WorkspaceAgent:${this.workspaceId}] task:dispatch received — target: ${event.targetWorkspaceId}`
      )
      if (event.targetWorkspaceId !== this.workspaceId) return

      if (this.processedDispatchIds.has(event.id)) {
        console.warn(
          `[WorkspaceAgent:${this.workspaceId}] duplicate dispatch ignored: ${event.id}`
        )
        return
      }
      this.processedDispatchIds.add(event.id)

      console.log(
        `[WorkspaceAgent:${this.workspaceId}] dispatch matched — enqueueing task`
      )

      // Immediate UI feedback before async processing starts
      this.config.onDispatchReceived?.(event.task)

      eventBus.emit("task:status", {
        dispatchId: event.id,
        workspaceId: this.workspaceId,
        status: "received",
      })

      this.enqueue(event.task, {
        type: "majordomo",
        dispatchId: event.id,
      })
    })
  }

  /** Stop listening for dispatches */
  disconnect(): void {
    this.unsubscribeDispatch?.()
    this.unsubscribeDispatch = null
  }

  /** Accept user input (called by ChatPanel on send) */
  send(content: string): void {
    this.enqueue(content, { type: "user" })
  }

  private enqueue(content: string, source: InputSource): void {
    if (this.processing) {
      this.queue.push({ content, source })
      return
    }
    this.processNext({ content, source })
  }

  private async processNext(input: QueuedInput): Promise<void> {
    this.processing = true

    try {
      await this.process(input.content, input.source)
    } catch (err: unknown) {
      console.error("[WorkspaceAgent] Error during processing:", err)
    } finally {
      this.processing = false
      const next = this.queue.shift()
      if (next) {
        this.processNext(next)
      }
    }
  }

  private async process(content: string, source: InputSource): Promise<void> {
    const { workspace } = this.config
    const {
      providerId,
      modelId,
      enableAgentLoop,
      tools: allowedTools,
    } = workspace.agentConfig

    // Look up providerType so MiniMax gets correct message formatting
    const providerType =
      useProviderStore.getState().providers.find((p) => p.id === providerId)?.type ?? ""

    // 1. Build and persist user message with source metadata
    const userMsg: Message = {
      ...makeMessage("user", content),
      metadata: {
        source: source.type,
        ...(source.dispatchId ? { dispatchId: source.dispatchId } : {}),
      },
    }

    const {
      appendMessage: storeAppend,
      updateLastMessage,
      messages,
    } = useChatStore.getState()
    storeAppend(this.workspaceId, userMsg)
    appendMessage(this.workspaceId, userMsg).catch(console.warn)

    // 2. Build system prompt (includes project path, tools, context)
    const systemPrompt = await this.buildSystemPrompt(source)

    // 3. Build conversation history as AgentMessage[]
    const history: AgentMessage[] = [
      { role: "system", content: systemPrompt },
      ...[...(messages[this.workspaceId] ?? []), userMsg].map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ]

    // 4. Placeholder AI message
    const aiMsg: Message = makeMessage("assistant", "", modelId, providerId)
    storeAppend(this.workspaceId, aiMsg)
    this.config.onStreamingChange(true)

    let fullContent = ""

    try {
      if (source.dispatchId) {
        eventBus.emit("task:status", {
          dispatchId: source.dispatchId,
          workspaceId: this.workspaceId,
          status: "processing",
        })
      }

      // Majordomo dispatches always run the agentic loop so the agent can use
      // tools (list_dir, read_file, etc.) rather than asking for project info.
      const useAgentLoop = enableAgentLoop || source.type === "majordomo"

      if (useAgentLoop) {
        // Full agentic loop with tools (global builtins + workspace-specific tools)
        const wsTools = createWorkspaceTools({
          providerId,
          providerType,
          modelId,
          workspaceId: this.workspaceId,
          workspaceName: workspace.name,
          onSubAgentToolStart: this.config.onToolStart,
          onSubAgentToolEnd: this.config.onToolEnd,
        })
        const toolDefs = [
          ...getToolDefinitions(allowedTools).filter(
            (t) => !WORKSPACE_BLOCKED_TOOLS.includes(t.name)
          ),
          ...wsTools.definitions,
        ]
        await runAgentLoop({
          providerId,
          providerType,
          modelId,
          history,
          tools: toolDefs,
          extraExecutors: wsTools.executors,
          signal: this.config.signal,
          onChunk: (delta) => {
            fullContent += delta
            updateLastMessage(this.workspaceId, { content: fullContent })
            this.config.onChunk(delta)
          },
          onToolStart: this.config.onToolStart,
          onToolEnd: this.config.onToolEnd,
        })
      } else {
        // Simple streaming chat (no tools)
        for await (const chunk of streamChat(
          providerId,
          providerType,
          modelId,
          history,
          undefined,
          this.config.signal
        )) {
          if (this.config.signal?.aborted) break
          if (chunk.delta) {
            fullContent += chunk.delta
            updateLastMessage(this.workspaceId, { content: fullContent })
            this.config.onChunk(chunk.delta)
          }
        }
      }
    } catch (err: unknown) {
      const isAbort = (err as Error)?.name === "AbortError"
      if (!isAbort) {
        const errText = err instanceof Error ? err.message : "Unknown error"
        console.error("[WorkspaceAgent] Stream error:", errText)
        updateLastMessage(this.workspaceId, { content: `Error: ${errText}` })
        fullContent = `Error: ${errText}`
      }

      if (source.dispatchId) {
        eventBus.emit("task:status", {
          dispatchId: source.dispatchId,
          workspaceId: this.workspaceId,
          status: "failed",
          progress: fullContent,
        })
      }
    } finally {
      this.config.onStreamingChange(false)
    }

    // 5. Persist complete AI message
    const finalAiMsg: Message = {
      ...aiMsg,
      content: fullContent,
      metadata: {
        ...(source.dispatchId ? { dispatchId: source.dispatchId } : {}),
      },
    }
    appendMessage(this.workspaceId, finalAiMsg).catch(console.warn)

    // 6. Update workspace status
    useWorkspaceStore.getState().updateWorkspace(this.workspaceId, {
      status: "idle",
      stateSummary: fullContent.slice(0, 200),
      updatedAt: new Date().toISOString(),
    })

    // 7. Report result back to Majordomo if dispatched
    if (source.dispatchId) {
      eventBus.emit("task:result", {
        dispatchId: source.dispatchId,
        workspaceId: this.workspaceId,
        result: fullContent,
        summary: fullContent.slice(0, 200),
      })

      eventBus.emit("task:status", {
        dispatchId: source.dispatchId,
        workspaceId: this.workspaceId,
        status: "completed",
      })
    }
  }

  /**
   * Build a system prompt that gives the agent context about its workspace,
   * project directory, and available tools.
   */
  private async buildSystemPrompt(source: InputSource): Promise<string> {
    const { workspace } = this.config

    // Use any explicitly configured system prompt as a base
    const userPrompt = workspace.agentConfig.systemPrompt ?? ""

    // Resolve the project content root (the directory the agent should work in)
    const contentRoot = await resolveContentRoot(workspace).catch(
      () => `~/.mindeck/workspaces/${workspace.id}/files`
    )

    const projectType =
      workspace.workspaceType === "linked"
        ? "Linked external project"
        : "Internal workspace"

    const fromMajordomo = source.type === "majordomo"
    const majordomoInstructions = fromMajordomo
      ? `
You are receiving this task from Majordomo (the global orchestrator).
- Use your tools to explore the project and answer the task — do NOT ask for project info.
- After completing the task, use report_to_majordomo to send your findings back.
  report_to_majordomo(workspaceId="${workspace.id}", summary="...", details="...")`
      : ""

    return `You are the AI agent for the workspace "${workspace.name}" (ID: ${workspace.id}).

Project type: ${projectType}
Project directory: ${contentRoot}

You have access to these tools:
- list_dir(path): List files and folders at a path
- read_file(path): Read a file's content
- write_file(path, content): Write content to a file
- delete_path(path): Delete a file or directory
- bash_exec(command, cwd?): Run a shell command (requires user confirmation)
- list_workspaces(): List all Mindeck workspaces
- report_to_majordomo(workspaceId, summary, details): Report results back to Majordomo
- spawn_sub_agent(name, task): Spawn a temporary sub-agent to handle a focused subtask. The sub-agent runs autonomously and returns its result to you.
- spawn_sub_agent_team(agents): Spawn multiple sub-agents IN PARALLEL. Pass an array of {name, task} objects. All sub-agents run simultaneously and their results are returned together. Use this to parallelize independent subtasks (e.g. one sub-agent per topic, file, or software).
${majordomoInstructions}
${userPrompt ? `\nAdditional instructions:\n${userPrompt}` : ""}`.trim()
  }

  /** Update the workspace config (e.g., after model change) */
  updateConfig(workspace: Workspace): void {
    this.config = { ...this.config, workspace }
  }
}
