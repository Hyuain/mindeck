/**
 * WorkspaceAgent — the main agent for a single workspace.
 *
 * Handles input from both user (via ChatPanel) and Majordomo (via event bus).
 * Always runs the full agentic loop (tools, multi-turn) unless explicitly disabled.
 * Reports results back to Majordomo via event bus.
 */
import { runAgent, messagesToAgentHistory } from "./agent-runner"
import { eventBus } from "./event-bus"
import { appendMessage, makeMessage } from "./conversation"
import { getToolDefinitions } from "./tools/registry"
import { createWorkspaceTools } from "./tools/workspace-tools"
import { streamChat } from "./providers/bridge"
import { createLogger } from "./logger"
import { updateTaskStatus, recoverPendingTasks } from "./task-manager"
import { loadPendingDispatches, markEventProcessed } from "./event-queue"
import { setPermissionContext } from "./permissions"
import { resolveContentRoot } from "@/components/workspace/WorkspacePanel"
import { discoverWorkspaceSkills, loadFullSkill } from "./skills/skill-discovery"
import { discoverContextRules, buildContextSection } from "./skills/context-injector"
import { useWorkspaceStore } from "@/stores/workspace"
import { useTaskStore } from "@/stores/tasks"
import { useSkillsStore } from "@/stores/skills"
import type {
  AgentMessage,
  Message,
  MessageSource,
  ModelCapabilities,
  ProviderConfig,
  ToolActivity,
  Workspace,
} from "@/types"

export interface AgentDeps {
  getMessages: (workspaceId: string) => Message[]
  appendMessage: (workspaceId: string, msg: Message) => void
  updateLastMessage: (workspaceId: string, patch: Partial<Message>) => void
  getProvider: (providerId: string) => ProviderConfig | undefined
  setStreaming: (workspaceId: string, streaming: boolean) => void
}

export interface UICallbacks {
  onChunk?: (delta: string) => void
  onToolStart?: (activity: ToolActivity) => void
  onToolEnd?: (activity: ToolActivity) => void
  onStreamingChange?: (isStreaming: boolean) => void
  /** Called synchronously when a Majordomo dispatch is received, before processing */
  onDispatchReceived?: (task: string) => void
}

export interface InputSource {
  type: MessageSource
  dispatchId?: string
}

interface QueuedInput {
  content: string
  source: InputSource
  /** Skill IDs selected via slash command for this message only (not always-on) */
  ephemeralSkillIds?: string[]
}

// Workspace agents must NOT dispatch to other workspaces —
// only Majordomo orchestrates cross-workspace delegation.
const WORKSPACE_BLOCKED_TOOLS = ["dispatch_to_workspace"]

/** Resolve the capability profile for the model the workspace is using. */
function resolveModelCapabilities(
  provider: ProviderConfig | undefined,
  modelId: string
): ModelCapabilities {
  if (!provider) return {}
  return provider.models?.find((m) => m.id === modelId)?.capabilities ?? {}
}

export class WorkspaceAgent {
  private readonly workspaceId: string
  private readonly log
  private queue: QueuedInput[] = []
  private processing = false
  private unsubscribeDispatch: (() => void) | null = null
  private callbacks: UICallbacks = {}
  private abortController = new AbortController()

  constructor(
    private workspace: Workspace,
    private deps: AgentDeps
  ) {
    this.workspaceId = workspace.id
    this.log = createLogger(`WorkspaceAgent:${this.workspaceId}`)
  }

  /** Register UI callbacks from ChatPanel (called on mount). */
  setCallbacks(cb: UICallbacks): void {
    this.callbacks = cb
  }

  /** Remove UI callbacks (called on unmount). */
  clearCallbacks(): void {
    this.callbacks = {}
  }

  /** Start listening for Majordomo dispatches targeting this workspace */
  connect(): void {
    this.unsubscribeDispatch?.()
    this.unsubscribeDispatch = eventBus.on("task:dispatch", (event) => {
      this.log.debug("task:dispatch received", { target: event.targetWorkspaceId })
      if (event.targetWorkspaceId !== this.workspaceId) return

      this.log.info("Dispatch matched — enqueueing task", { taskId: event.id })

      // Mark received in TaskStore immediately (prevents recovery double-pickup)
      updateTaskStatus(event.id, "received")

      // Immediate UI feedback before async processing starts
      this.callbacks.onDispatchReceived?.(event.task)

      this.enqueue(event.task, {
        type: "majordomo",
        dispatchId: event.id,
      })
    })

    // Recover any tasks that were pending when this agent wasn't connected
    // (EventBus event was missed — e.g. timing race or app restart)
    const pending = recoverPendingTasks(this.workspaceId)
    for (const task of pending) {
      this.log.info("Recovering pending task", { taskId: task.id })
      updateTaskStatus(task.id, "received")
      this.callbacks.onDispatchReceived?.(task.content)
      this.enqueue(task.content, {
        type: task.sourceType,
        dispatchId: task.id,
      })
    }

    // Recover missed events from disk (survives app restarts — best-effort)
    loadPendingDispatches(this.workspaceId)
      .then((events) => {
        for (const ev of events) {
          // Skip if TaskStore already knows about this task (picked up via memory recovery above)
          const alreadyKnown = useTaskStore.getState().tasks.some((t) => t.id === ev.id)
          if (!alreadyKnown) {
            this.log.info("Recovering missed event from disk", { eventId: ev.id })
            updateTaskStatus(ev.id, "received")
            this.enqueue(ev.task, {
              type: ev.sourceType,
              dispatchId: ev.id,
            })
          }
          // Mark processed regardless to prevent future double-pickup
          markEventProcessed(this.workspaceId, ev.id).catch(() => {})
        }
      })
      .catch((err: unknown) =>
        this.log.warn("Failed to load pending events from disk", err)
      )

    // Discover workspace skills (non-blocking; best-effort)
    this.initWorkspaceContext().catch((err: unknown) =>
      this.log.warn("Workspace context discovery failed", err)
    )
  }

  /** Stop listening for dispatches */
  disconnect(): void {
    this.unsubscribeDispatch?.()
    this.unsubscribeDispatch = null
    this.abortController.abort()
    this.abortController = new AbortController()
  }

  /** Accept user input (called by ChatPanel on send) */
  send(content: string, ephemeralSkillIds?: string[]): void {
    this.enqueue(content, { type: "user" }, ephemeralSkillIds)
  }

  /** Update workspace config (e.g. after model change) */
  updateConfig(workspace: Workspace): void {
    this.workspace = workspace
  }

  private enqueue(
    content: string,
    source: InputSource,
    ephemeralSkillIds?: string[]
  ): void {
    if (this.processing) {
      this.queue.push({ content, source, ephemeralSkillIds })
      return
    }
    this.processNext({ content, source, ephemeralSkillIds })
  }

  private async processNext(input: QueuedInput): Promise<void> {
    this.processing = true

    try {
      await this.process(input.content, input.source, 0, input.ephemeralSkillIds)
    } catch (err: unknown) {
      this.log.error("Error during processing", err)
    } finally {
      this.processing = false
      const next = this.queue.shift()
      if (next) {
        this.processNext(next)
      }
    }
  }

  private async process(
    content: string,
    source: InputSource,
    retryCount = 0,
    ephemeralSkillIds?: string[]
  ): Promise<void> {
    const workspace = this.workspace
    const {
      providerId,
      modelId,
      enableAgentLoop,
      tools: allowedTools,
    } = workspace.agentConfig

    // Fix A: Validate provider before touching chat store or starting the LLM call
    const providerExists = this.deps.getProvider(providerId) !== undefined
    if (!providerId || !providerExists) {
      this.log.error("No valid provider configured", {
        providerId,
        workspaceId: this.workspaceId,
      })
      if (source.dispatchId) {
        eventBus.emit("task:result", {
          dispatchId: source.dispatchId,
          workspaceId: this.workspaceId,
          result: `Error: Workspace "${workspace.name}" has no provider configured. Open Settings to add a model.`,
          summary: "Provider not configured",
        })
      }
      return
    }

    // Look up providerType so MiniMax gets correct message formatting
    const provider = this.deps.getProvider(providerId)
    const providerType = provider?.type ?? ""

    // Resolve the model's capability profile — drives tool injection and prompt tuning.
    const modelCapabilities = resolveModelCapabilities(provider, modelId)

    // 1. Build and persist user message with source metadata
    const userMsg: Message = {
      ...makeMessage("user", content),
      metadata: {
        source: source.type,
        ...(source.dispatchId ? { dispatchId: source.dispatchId } : {}),
      },
    }

    this.deps.appendMessage(this.workspaceId, userMsg)
    appendMessage(this.workspaceId, userMsg).catch((err: unknown) =>
      this.log.warn("Failed to persist user message", err)
    )

    // 2. Build system prompt (includes project path, tools, context)
    const systemPrompt = await this.buildSystemPrompt(source, ephemeralSkillIds)

    // 3. Build conversation history as AgentMessage[] — preserves tool call turns
    const history: AgentMessage[] = messagesToAgentHistory([
      ...this.deps.getMessages(this.workspaceId),
      userMsg,
    ])

    // 4. Placeholder AI message
    const aiMsg: Message = makeMessage("assistant", "", modelId, providerId)
    this.deps.appendMessage(this.workspaceId, aiMsg)
    this.callbacks.onStreamingChange?.(true)

    let fullContent = ""
    let loopResult: Awaited<ReturnType<typeof runAgent>> | undefined

    // Always use the agentic loop so the agent has tool access.
    // Previously gated behind `enableAgentLoop` config, but user messages
    // were silently losing all tool capabilities when unset.
    const useAgentLoop = enableAgentLoop !== false

    try {
      if (source.dispatchId) {
        updateTaskStatus(source.dispatchId, "processing")
      }
      this.log.debug("process start", {
        providerId,
        modelId,
        useAgentLoop,
        source: source.type,
      })

      if (useAgentLoop) {
        // Full agentic loop with tools (global builtins + workspace-specific tools)
        // Resolve ephemeral skill IDs to Skill objects so load_skill can serve them
        const allWsSkills =
          useSkillsStore.getState().workspaceSkills[this.workspaceId] ?? []
        const resolvedEphemeralSkills = (ephemeralSkillIds ?? [])
          .map((id) => allWsSkills.find((s) => s.id === id))
          .filter((s): s is (typeof allWsSkills)[number] => s !== undefined)

        const wsTools = createWorkspaceTools({
          providerId,
          providerType,
          modelId,
          workspaceId: this.workspaceId,
          workspaceName: workspace.name,
          onSubAgentToolStart: this.callbacks.onToolStart ?? (() => {}),
          onSubAgentToolEnd: this.callbacks.onToolEnd ?? (() => {}),
          ephemeralSkills: resolvedEphemeralSkills,
        })
        const toolDefs = [
          ...getToolDefinitions(allowedTools).filter(
            (t) => !WORKSPACE_BLOCKED_TOOLS.includes(t.name)
          ),
          ...wsTools.definitions,
        ]
        setPermissionContext(workspace.name)
        loopResult = await runAgent({
          providerId,
          providerType,
          modelId,
          systemPrompt,
          history,
          tools: toolDefs,
          extraExecutors: wsTools.executors,
          modelCapabilities,
          signal: this.abortController.signal,
          onChunk: (delta) => {
            fullContent += delta
            this.deps.updateLastMessage(this.workspaceId, { content: fullContent })
            this.callbacks.onChunk?.(delta)
          },
          onToolStart: this.callbacks.onToolStart ?? (() => {}),
          onToolEnd: this.callbacks.onToolEnd ?? (() => {}),
        })
        setPermissionContext(undefined)
        // The loop may return text even if onChunk was never called
        // (e.g. max-iterations fallback message or tool-only response).
        if (!fullContent.trim() && loopResult.text.trim()) {
          fullContent = loopResult.text
          this.deps.updateLastMessage(this.workspaceId, { content: fullContent })
        }
      } else {
        // Simple streaming chat (no tools)
        for await (const chunk of streamChat(
          providerId,
          providerType,
          modelId,
          history,
          undefined,
          this.abortController.signal
        )) {
          if (this.abortController.signal.aborted) break
          if (chunk.delta) {
            fullContent += chunk.delta
            this.deps.updateLastMessage(this.workspaceId, { content: fullContent })
            this.callbacks.onChunk?.(chunk.delta)
          }
        }
      }
    } catch (err: unknown) {
      const isAbort = (err as Error)?.name === "AbortError"
      if (!isAbort) {
        const errText = err instanceof Error ? err.message : "Unknown error"
        this.log.error("Stream error", { errText, providerId, modelId })
        this.deps.updateLastMessage(this.workspaceId, { content: `Error: ${errText}` })
        fullContent = `Error: ${errText}`
      }

      if (source.dispatchId) {
        updateTaskStatus(source.dispatchId, "failed", { error: fullContent })
      }
    } finally {
      this.callbacks.onStreamingChange?.(false)
    }

    // Persist intermediate tool-call turns (assistant turns + tool results)
    // so the next session can reconstruct the full agentic history.
    if (useAgentLoop && loopResult) {
      for (const im of loopResult.intermediateMessages) {
        const imMsg: Message =
          im.role === "tool"
            ? {
                id: crypto.randomUUID(),
                role: "tool",
                content: im.content,
                timestamp: new Date().toISOString(),
                toolCallId: im.toolCallId,
                toolName: im.name,
              }
            : {
                id: crypto.randomUUID(),
                role: "assistant" as const,
                content: im.content,
                timestamp: new Date().toISOString(),
                model: modelId,
                providerId,
                toolCalls: im.role === "assistant" ? im.toolCalls : undefined,
              }
        appendMessage(this.workspaceId, imMsg).catch((err: unknown) =>
          this.log.warn("Failed to persist intermediate message", err)
        )
      }
    }

    // Detect fake actions: model describes file operations but never called tools.
    // For models with weak function-calling, broaden the pattern — they more often
    // produce text descriptions instead of tool calls even for simple actions.
    if (useAgentLoop && loopResult && retryCount < 1) {
      const isWeakFC = modelCapabilities.functionCalling === "weak"
      const actionMentioned = isWeakFC
        ? /移|创建|删除|复制|文件|目录|操作|执行|已完成|moved|created|deleted|copied|mv |cp |mkdir |rm |wrote|written/i.test(
            fullContent
          )
        : /移[入动]|已移|moved|已[创删复]|created|deleted|copied|mv |cp |mkdir |rm /i.test(
            fullContent
          )
      const mutatingToolCalled = loopResult.toolsCalled.some((t) =>
        ["bash_exec", "write_file", "delete_path"].includes(t)
      )
      if (actionMentioned && !mutatingToolCalled) {
        this.log.warn(
          "Fake action detected — model described mutations without calling tools",
          {
            toolsCalled: loopResult.toolsCalled,
            contentPreview: fullContent.slice(0, 200),
          }
        )
        // Inject correction and retry once
        const correctionMsg: Message = {
          ...makeMessage(
            "user",
            "⚠️ SYSTEM AUDIT: Your response described file operations (move/create/delete) but you did NOT call any tool to actually perform them. Text descriptions do NOT execute. You MUST call bash_exec, write_file, or delete_path to perform real operations. Try again — use the tools."
          ),
          metadata: { source: "system" as MessageSource },
        }
        this.deps.appendMessage(this.workspaceId, correctionMsg)
        appendMessage(this.workspaceId, correctionMsg).catch(console.warn)
        // Retry the process with the correction injected into history
        return this.process(correctionMsg.content, source, retryCount + 1)
      }
    }

    // Fix B: Guard against empty fullContent — prevents silent empty results
    if (!fullContent.trim()) {
      this.log.warn("Agent returned empty response", {
        providerId,
        modelId,
        useAgentLoop: enableAgentLoop !== false,
        source: source.type,
      })
      fullContent =
        "(No response generated. Workspace agent may have a provider configuration issue.)"
      this.deps.updateLastMessage(this.workspaceId, { content: fullContent })
    }

    // 5. Persist complete AI message
    const finalAiMsg: Message = {
      ...aiMsg,
      content: fullContent,
      metadata: {
        ...(source.dispatchId ? { dispatchId: source.dispatchId } : {}),
      },
    }
    appendMessage(this.workspaceId, finalAiMsg).catch((err: unknown) =>
      this.log.warn("Failed to persist AI message", err)
    )

    // 6. Update workspace status (remove "idle" — use TaskStore for status instead)
    useWorkspaceStore.getState().updateWorkspace(this.workspaceId, {
      stateSummary: fullContent.slice(0, 200),
      updatedAt: new Date().toISOString(),
    })

    // 7. Report result back to Majordomo and mark task completed
    if (source.dispatchId) {
      this.log.info("task:result emitting", {
        dispatchId: source.dispatchId,
        workspaceId: this.workspaceId,
        summaryLen: fullContent.length,
      })
      updateTaskStatus(source.dispatchId, "completed", { result: fullContent })
      eventBus.emit("task:result", {
        dispatchId: source.dispatchId,
        workspaceId: this.workspaceId,
        result: fullContent,
        summary: fullContent.slice(0, 200),
      })
    }
  }

  /**
   * Discover workspace skills and store them for system prompt injection.
   * Called once on connect() — best-effort, non-blocking.
   */
  private async initWorkspaceContext(): Promise<void> {
    const contentRoot = await resolveContentRoot(this.workspace).catch(
      () => `~/.mindeck/workspaces/${this.workspaceId}/files`
    )
    const indices = await discoverWorkspaceSkills(contentRoot)
    const skills = await Promise.all(
      indices.map((idx) => loadFullSkill(idx).catch(() => null))
    )
    const validSkills = skills.filter((s): s is NonNullable<typeof s> => s !== null)
    useSkillsStore.getState().setWorkspaceSkills(this.workspaceId, validSkills)
    this.log.debug("Workspace skills discovered", {
      count: validSkills.length,
      contentRoot,
    })
  }

  /**
   * Build a system prompt that gives the agent context about its workspace,
   * project directory, available tools, and any active skills / project rules.
   */
  private async buildSystemPrompt(
    source: InputSource,
    ephemeralSkillIds?: string[]
  ): Promise<string> {
    const workspace = this.workspace

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

    const basePrompt =
      `You are the AI agent for the workspace "${workspace.name}" (ID: ${workspace.id}).

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
- load_skill(name): Load a named active skill's full instructions into context

CRITICAL RULES — EVERY TURN IS AUDITED:
1. To perform ANY file operation (move, copy, create, delete, rename), you MUST call the appropriate tool (bash_exec, write_file, delete_path, etc.). Writing text about an action does NOT perform it.
2. NEVER write "让我移动", "已移动", "files moved", "让我检查" and then produce a result summary WITHOUT having called the actual tool in between. Describing what you would do is NOT the same as doing it.
3. After calling a tool, check the tool result to confirm it succeeded before reporting success.
4. If you need to move files, use bash_exec with "mv" command. If you need to check directory contents, call list_dir — do NOT guess or assume.
5. Only report success AFTER tool results confirm the operation completed.
${majordomoInstructions}
${userPrompt ? `\nAdditional instructions:\n${userPrompt}` : ""}`.trim()

    // ─── Context injection ────────────────────────────────────────
    const sections: string[] = [basePrompt]

    // Inject all project context rules (AGENTS.md, CLAUDE.md, .cursorrules, .windsurfrules, etc.)
    try {
      const contextRules = await discoverContextRules(contentRoot)
      if (contextRules.length > 0) {
        sections.push(`## Project Context\n\n${buildContextSection(contextRules)}`)
      }
    } catch {
      // Discovery failure is non-fatal
    }

    // List active workspace skills — agent calls load_skill to get full content
    const skillsStore = useSkillsStore.getState()
    const alwaysOnSkills = skillsStore.getWorkspaceActiveSkills(this.workspaceId)
    // Merge always-on skills with per-message ephemeral skills (deduplicated)
    const allWorkspaceSkills = skillsStore.workspaceSkills[this.workspaceId] ?? []
    const ephemeralSkills = (ephemeralSkillIds ?? [])
      .map((id) => allWorkspaceSkills.find((s) => s.id === id))
      .filter((s): s is (typeof allWorkspaceSkills)[number] => s !== undefined)
    const alwaysOnIds = new Set(alwaysOnSkills.map((s) => s.id))
    const combinedSkills = [
      ...alwaysOnSkills,
      ...ephemeralSkills.filter((s) => !alwaysOnIds.has(s.id)),
    ]
    if (combinedSkills.length > 0) {
      const skillLines = combinedSkills
        .map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ""}`)
        .join("\n")
      sections.push(
        `## Available Skills\n\n${skillLines}\n\nUse the \`load_skill\` tool to load a skill's full instructions into context before applying it.`
      )
    }

    return sections.join("\n\n")
  }
}
