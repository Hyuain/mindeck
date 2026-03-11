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
import { getToolDefinitions, filterByIntent } from "./tools/registry"
import { createWorkspaceTools } from "./tools/workspace-tools"
import { streamChat } from "./providers/bridge"
import { createLogger } from "./logger"
import { updateTaskStatus, recoverPendingTasks } from "./task-manager"
import { loadPendingDispatches, markEventProcessed } from "./event-queue"
import { setPermissionContext } from "./permissions"
import { resolveContentRoot } from "@/components/workspace/WorkspacePanel"
import { discoverWorkspaceSkills, loadFullSkill } from "./skills/skill-discovery"
import { discoverContextRules, buildContextSection } from "./skills/context-injector"
import { mcpManager } from "./mcp/manager"
import { harnessEngine } from "./harness-engine"
import { readWorkspaceMemory, appendToWorkspaceMemory } from "./workspace-memory"
import { metricsCollector } from "./observability/metrics-collector"
import { DockerSandbox } from "./sandbox/docker-sandbox"
import {
  connectScriptsToWorkspace,
  disconnectScriptsFromWorkspace,
} from "./agent-apps/script-adapter"
import { ESLINT_APP } from "./native-apps/eslint-app"
import { TSC_APP } from "./native-apps/tsc-app"
import { TEST_RUNNER_APP } from "./native-apps/test-runner-app"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAgentAppsStore } from "@/stores/agent-apps"
import { useTaskStore } from "@/stores/tasks"
import { useSkillsStore } from "@/stores/skills"
import type {
  AgentAppManifest,
  AgentMessage,
  Message,
  MessageSource,
  ModelCapabilities,
  ProviderConfig,
  SandboxMode,
  ToolActivity,
  Workspace,
} from "@/types"

/**
 * Generate a system Agent App manifest for the Orchestrator in a given workspace.
 * This manifest is `kind: "system"` and is NOT shown in the Apps UI.
 */
export function generateOrchestratorManifest(workspace: Workspace): AgentAppManifest {
  return {
    id: `system.orchestrator.${workspace.id}`,
    name: "Orchestrator",
    kind: "system",
    version: "1.0.0",
    description: `Orchestrator for workspace "${workspace.name}". Manages planning, execution, and verification phases.`,
    icon: "🎯",
    mcpDependencies:
      workspace.orchestratorConfig?.mcpDependencies ?? workspace.mcpDependencies,
    capabilities: {},
    toolExposure: "direct",
    permissions: { filesystem: "workspace-only", network: "full", shell: true },
    lifecycle: { startup: "eager", persistence: "workspace" },
  }
}

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

const SANDBOX_READ_ONLY_BLOCKED = new Set(["bash_exec", "write_file", "delete_path"])

/**
 * E4.6: Global registry of active Docker sandboxes keyed by workspaceId.
 * bash_exec in builtins.ts reads this to route commands through the container.
 */
export const activeDockerSandboxes = new Map<
  string,
  import("./sandbox/docker-sandbox").DockerSandbox
>()

/** E4.6: Active sandbox for the currently executing workspace process turn. */
let _activeSandbox: import("./sandbox/docker-sandbox").DockerSandbox | null = null
export function getActiveSandbox() {
  return _activeSandbox
}
export function setActiveSandbox(
  s: import("./sandbox/docker-sandbox").DockerSandbox | null
) {
  _activeSandbox = s
}

type ToolExecutorMap = Map<
  string,
  (args: Record<string, unknown>, onChunk?: (chunk: string) => void) => Promise<unknown>
>

/**
 * Wrap mutation tools with a blocking error when workspace is read-only.
 */
function sandboxExtraExecutors(
  executors: ToolExecutorMap,
  mode: SandboxMode
): ToolExecutorMap {
  if (mode !== "read-only") return executors
  const wrapped = new Map(executors)
  for (const name of SANDBOX_READ_ONLY_BLOCKED) {
    wrapped.set(name, async () => {
      throw new Error(`Tool '${name}' is blocked in read-only sandbox mode`)
    })
  }
  return wrapped
}

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
  /** H3.6: Cross-session memory injected into system prompt */
  private memory = ""
  /** H3.1: Pending harness feedback messages to drain on next process() */
  private pendingHarnessFeedback: Array<{ appName: string; result: string }> = []
  /** E4.6: Active Docker sandbox (Layer 2), null = Layer 1 only */
  private dockerSandbox: DockerSandbox | null = null

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
  async connect(): Promise<void> {
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

    // Recover missed events from disk
    loadPendingDispatches(this.workspaceId)
      .then((events) => {
        for (const ev of events) {
          const alreadyKnown = useTaskStore.getState().tasks.some((t) => t.id === ev.id)
          if (!alreadyKnown) {
            this.log.info("Recovering missed event from disk", { eventId: ev.id })
            updateTaskStatus(ev.id, "received")
            this.enqueue(ev.task, {
              type: ev.sourceType,
              dispatchId: ev.id,
            })
          }
          markEventProcessed(this.workspaceId, ev.id).catch(() => {})
        }
      })
      .catch((err: unknown) =>
        this.log.warn("Failed to load pending events from disk", err)
      )

    // H3.6: Load cross-session memory (non-blocking)
    readWorkspaceMemory(this.workspaceId)
      .then((mem) => {
        this.memory = mem
        if (mem) {
          this.log.debug("Loaded workspace memory", { chars: mem.length })
        }
      })
      .catch(() => {})

    // Discover workspace skills (non-blocking; best-effort)
    this.initWorkspaceContext().catch((err: unknown) =>
      this.log.warn("Workspace context discovery failed", err)
    )

    // Connect MCP dependencies (non-blocking; best-effort)
    // Prefer orchestratorConfig.mcpDependencies (new model), fall back to workspace.mcpDependencies (legacy)
    const deps =
      this.workspace.orchestratorConfig?.mcpDependencies ??
      this.workspace.mcpDependencies ??
      []
    if (deps.length > 0) {
      mcpManager
        .connectWorkspaceDeps(this.workspaceId, deps)
        .catch((err: unknown) => this.log.warn("MCP dependency connection failed", err))
    }

    // Connect activated app instances (non-blocking; best-effort)
    const activatedApps = this.workspace.activatedApps ?? []
    if (activatedApps.length > 0) {
      const installedApps = useAgentAppsStore.getState().installedApps
      for (const inst of activatedApps) {
        const manifest = installedApps.find((a) => a.id === inst.appId)
        if (manifest && manifest.mcpDependencies && manifest.mcpDependencies.length > 0) {
          mcpManager.connectAppInstance(inst.instanceId, manifest).catch((err: unknown) =>
            this.log.warn("App instance MCP connection failed", {
              instanceId: inst.instanceId,
              err,
            })
          )
        }
      }
    }

    // H3.2: Connect MCPs for skills with boundAppId (non-blocking)
    this.connectBoundSkillApps().catch((err: unknown) =>
      this.log.warn("Bound skill app connection failed", err)
    )

    // H3.1: Start harness engine with native apps + workspace apps
    this.startHarness()

    // E4.8: Connect user-written scripts (non-blocking; best-effort)
    connectScriptsToWorkspace(this.workspaceId).catch((err: unknown) =>
      this.log.warn("Script adapter connection failed", err)
    )

    // E4.6: Start Docker sandbox if configured and available
    const containerConfig = this.workspace.containerSandbox
    if (containerConfig?.enabled) {
      DockerSandbox.isAvailable()
        .then(async (available) => {
          if (!available) {
            this.log.warn("Docker not available — container sandbox disabled")
            return
          }
          const sandbox = new DockerSandbox(containerConfig)
          const contentRoot = await resolveContentRoot(this.workspace).catch(
            () => `~/.mindeck/workspaces/${this.workspaceId}/files`
          )
          await sandbox.start(contentRoot)
          this.dockerSandbox = sandbox
          // Register with global registry so bash_exec can pick it up
          activeDockerSandboxes.set(this.workspaceId, sandbox)
          this.log.info("Docker sandbox started")
        })
        .catch((err: unknown) => this.log.warn("Docker sandbox startup failed", err))
    }
  }

  /** Stop listening for dispatches */
  disconnect(): void {
    this.unsubscribeDispatch?.()
    this.unsubscribeDispatch = null
    this.abortController.abort()
    this.abortController = new AbortController()
    harnessEngine.stop(this.workspaceId)
    mcpManager.disconnectWorkspace(this.workspaceId).catch(() => {})
    // E4.8: Disconnect user scripts
    disconnectScriptsFromWorkspace(this.workspaceId)
    // E4.6: Stop Docker sandbox if running
    if (this.dockerSandbox) {
      activeDockerSandboxes.delete(this.workspaceId)
      this.dockerSandbox.stop().catch(() => {})
      this.dockerSandbox = null
    }
  }

  /** Accept user input (called by ChatPanel on send) */
  send(content: string, ephemeralSkillIds?: string[]): void {
    this.enqueue(content, { type: "user" }, ephemeralSkillIds)
  }

  /** Update workspace config (e.g. after model change) */
  updateConfig(workspace: Workspace): void {
    this.workspace = workspace
  }

  /**
   * H3.1: Called by HarnessEngine when an app produces feedback.
   * The message is injected into the conversation context on the next process() call.
   */
  injectHarnessFeedback(appName: string, result: string): void {
    this.pendingHarnessFeedback.push({ appName, result })
    this.log.debug("harness feedback queued", { appName, chars: result.length })
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

    // H3.1: Drain pending harness feedback into conversation before user message
    if (this.pendingHarnessFeedback.length > 0) {
      const feedbackBatch = this.pendingHarnessFeedback.splice(0)
      for (const fb of feedbackBatch) {
        const feedbackMsg: Message = {
          ...makeMessage("user", `[Harness: ${fb.appName}]\n${fb.result}`),
          metadata: { source: "system" as MessageSource },
        }
        this.deps.appendMessage(this.workspaceId, feedbackMsg)
        appendMessage(this.workspaceId, feedbackMsg).catch((err: unknown) =>
          this.log.warn("Failed to persist harness feedback message", err)
        )
      }
    }

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
      // E4.6: Expose this workspace's sandbox to bash_exec during this process turn
      setActiveSandbox(this.dockerSandbox)
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

        // Merge MCP tools into definitions and executors
        // Legacy: workspace mcpDependencies (old model)
        const mcpTools = mcpManager.getToolsForWorkspace(this.workspaceId)
        const mcpExecutors = mcpManager.getExecutorsForWorkspace(this.workspaceId)

        // New model: activated app instances
        const activatedApps = this.workspace.activatedApps ?? []
        const instanceTools: import("@/types").ToolDefinition[] = []
        const instanceExecutors = new Map<
          string,
          (args: Record<string, unknown>) => Promise<unknown>
        >()
        for (const inst of activatedApps) {
          const tools = mcpManager.getToolsForInstance(inst.instanceId)
          const execs = mcpManager.getExecutorsForInstance(inst.instanceId)
          instanceTools.push(...tools)
          execs.forEach((fn, name) => instanceExecutors.set(name, fn))
        }

        const mergedDefs = [...toolDefs, ...mcpTools, ...instanceTools]

        // H3.8: Apply dynamic action space filtering based on taskIntent
        const taskIntent = workspace.agentConfig.taskIntent
        const allToolDefs = taskIntent
          ? filterByIntent(mergedDefs, taskIntent)
          : mergedDefs

        const allExecutors = new Map([
          ...wsTools.executors,
          ...mcpExecutors,
          ...instanceExecutors,
        ])

        // Apply sandbox restrictions
        const sandboxMode = workspace.sandboxMode ?? "full"
        const finalExecutors = sandboxExtraExecutors(allExecutors, sandboxMode)

        setPermissionContext(workspace.name)
        loopResult = await runAgent({
          providerId,
          providerType,
          modelId,
          systemPrompt,
          history,
          tools: allToolDefs,
          extraExecutors: finalExecutors,
          modelCapabilities,
          modelRouting: {
            planningModel: workspace.agentConfig.planningModel,
            executionModel: workspace.agentConfig.executionModel,
            verificationModel: workspace.agentConfig.verificationModel,
          },
          signal: this.abortController.signal,
          workspaceId: this.workspaceId,
          onChunk: (delta) => {
            fullContent += delta
            this.deps.updateLastMessage(this.workspaceId, { content: fullContent })
            this.callbacks.onChunk?.(delta)
          },
          onToolStart: this.callbacks.onToolStart ?? (() => {}),
          onToolEnd: (activity) => {
            this.callbacks.onToolEnd?.(activity)
            // E4.5: Record tool call metric
            const startedAt = new Date(activity.startedAt).getTime()
            const finishedAt = activity.finishedAt
              ? new Date(activity.finishedAt).getTime()
              : Date.now()
            metricsCollector.recordToolCall({
              timestamp: activity.startedAt,
              workspaceId: this.workspaceId,
              toolName: activity.name,
              success: activity.status === "done",
              durationMs: finishedAt - startedAt,
            })
          },
          onLoopComplete: (metric) => {
            metricsCollector.recordLoopCompletion(metric)
          },
        })
        setPermissionContext(undefined)
        // H3.6: Persist memory if tools were called
        if (loopResult.toolsCalled.length > 0 && fullContent.trim()) {
          const summary = fullContent.slice(0, 300)
          appendToWorkspaceMemory(this.workspaceId, summary, providerId, modelId).catch(
            (err: unknown) => this.log.warn("Failed to append workspace memory", err)
          )
        }
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
      // E4.6: Clear active sandbox after process turn completes
      setActiveSandbox(null)
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
${userPrompt ? `\nAdditional instructions:\n${userPrompt}` : ""}
${workspace.sandboxMode === "read-only" ? "\n⚠️ SANDBOX: This workspace is in read-only mode. File mutation tools (bash_exec, write_file, delete_path) are blocked." : ""}`.trim()

    // ─── Context injection ────────────────────────────────────────
    const sections: string[] = [basePrompt]

    // H3.6: Inject cross-session memory
    if (this.memory.trim()) {
      sections.push(`## Memory\n\n${this.memory}`)
    }

    // Inject all project context rules (AGENTS.md, CLAUDE.md, .cursorrules, .windsurfrules, etc.)
    try {
      const contextRules = await discoverContextRules(contentRoot)
      if (contextRules.length > 0) {
        sections.push(`## Project Context\n\n${buildContextSection(contextRules)}`)
      }
    } catch {
      // Discovery failure is non-fatal
    }

    // List MCP tools available to the agent
    const mcpTools = mcpManager.getToolsForWorkspace(this.workspaceId)
    if (mcpTools.length > 0) {
      const mcpLines = mcpTools.map((t) => `- ${t.name}: ${t.description}`).join("\n")
      sections.push(`## MCP Tools\n\n${mcpLines}`)
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

  /**
   * H3.1: Start harness engine with native apps (if workspace has repoPath)
   * and any Agent App manifests registered for this workspace.
   */
  private startHarness(): void {
    const repoPath = this.workspace.repoPath
    const workspaceRoot = repoPath ?? `~/.mindeck/workspaces/${this.workspaceId}/files`

    // Collect apps from agent-apps store (legacy workspaceApps)
    const appsStore = useAgentAppsStore.getState()
    const wsApps: AgentAppManifest[] = appsStore.workspaceApps[this.workspaceId] ?? []

    // New model: resolve activated app instance manifests from global installedApps
    const activatedInstances = this.workspace.activatedApps ?? []
    const installedApps = appsStore.installedApps
    const activatedManifests: AgentAppManifest[] = activatedInstances
      .map((inst) => installedApps.find((a) => a.id === inst.appId))
      .filter((m): m is AgentAppManifest => m !== undefined)

    // Prepend native apps if workspace has a repo path
    const nativeApps: AgentAppManifest[] = repoPath
      ? [ESLINT_APP, TSC_APP, TEST_RUNNER_APP]
      : []

    const allApps = [...nativeApps, ...wsApps, ...activatedManifests]
    harnessEngine.start(this.workspaceId, allApps, { workspaceRoot }, this)
  }

  /**
   * H3.2: For each active skill with a boundAppId, ensure the corresponding
   * Agent App's MCP dependency is connected.
   */
  private async connectBoundSkillApps(): Promise<void> {
    const skillsStore = useSkillsStore.getState()
    const activeSkills = skillsStore.getWorkspaceActiveSkills(this.workspaceId)
    const boundIds = activeSkills
      .map((s) => s.boundAppId)
      .filter((id): id is string => Boolean(id))

    if (boundIds.length === 0) return

    const appsStore = useAgentAppsStore.getState()
    // Search across all workspace apps to find the manifest by ID
    const allApps = Object.values(appsStore.workspaceApps).flat()

    for (const appId of boundIds) {
      const manifest = allApps.find((a) => a.id === appId)
      if (!manifest) {
        this.log.warn("Bound app not found for skill", { appId })
        continue
      }
      // Connect first MCP dependency (legacy: single-MCP bound skill apps)
      const firstDep = manifest.mcpDependencies?.[0]
      if (firstDep) {
        const dep = {
          name: appId,
          transport: firstDep.transport,
          command: firstDep.command,
          args: firstDep.args,
          env: firstDep.env,
          url: firstDep.url,
        }
        this.log.debug("Connecting bound skill MCP dep", { appId })
        await mcpManager
          .connectWorkspaceDeps(this.workspaceId, [dep])
          .catch((err: unknown) =>
            this.log.warn("Failed to connect bound skill MCP dep", { appId, err })
          )
      }
    }
  }
}
