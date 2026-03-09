/**
 * Agentic loop — streams, detects tool calls, executes them, and loops
 * until the model produces a final response (no more tool calls).
 *
 * H3.4: Doom loop detection + self-verification phase
 * H3.5: Per-tool execution timeout
 * H3.7: Per-iteration model routing (planning / execution / verification)
 */
import { streamChat } from "./providers/bridge"
import { executeTool, getToolDefinitions } from "./tools/registry"
import { createLogger } from "./logger"
import { estimateTokens, compactHistory } from "./context-compaction"
import { detectInjection } from "./prompt-injection"
import { invoke } from "@tauri-apps/api/core"
import type {
  AgentMessage,
  InjectionDetection,
  ModelRef,
  ToolCall,
  ToolActivity,
  ToolDefinition,
} from "@/types"

const log = createLogger("AgenticLoop")

const DEFAULT_MAX_ITERATIONS = 25
const TOKEN_THRESHOLD = 100_000
/** Max iterations for the self-verification follow-up phase (H3.4) */
const VERIFY_MAX_ITERATIONS = 3
/** Sliding window size for doom-loop detection (H3.4) */
const DOOM_WINDOW_SIZE = 6
/** Max unique signatures in window before doom-loop injection (H3.4) */
const DOOM_UNIQUE_THRESHOLD = 2

export interface AgentLoopResult {
  text: string
  /** Names of tools that were actually executed during the loop */
  toolsCalled: string[]
  /**
   * All assistant+tool turns added to history during the loop,
   * EXCLUDING the final text-only assistant response.
   * Used by callers to persist multi-turn tool history.
   */
  intermediateMessages: AgentMessage[]
  /** True if doom-loop correction was injected (H3.4) */
  doomLoopDetected: boolean
  /** True if the self-verify phase was triggered after the main loop (H3.4) */
  selfVerifyTriggered: boolean
  /** Names of tools that timed out during execution (H3.5) */
  timedOutTools: string[]
}

export interface AgentLoopOptions {
  providerId: string
  providerType: string
  modelId: string
  history: AgentMessage[]
  tools?: ToolDefinition[]
  maxIterations?: number
  signal?: AbortSignal
  onChunk: (delta: string) => void
  onToolStart: (activity: ToolActivity) => void
  onToolEnd: (activity: ToolActivity) => void
  /** Extra tool executors that take priority over the global registry */
  extraExecutors?: Map<
    string,
    (args: Record<string, unknown>, onChunk?: (chunk: string) => void) => Promise<unknown>
  >
  /** H3.4: Run a verification pass after the main loop exits naturally */
  selfVerify?: boolean
  /** H3.5: Per-tool execution timeout in ms; undefined = no timeout */
  toolTimeoutMs?: number
  /** H3.7: Override which model to use in each phase */
  modelRouting?: {
    planningModel?: ModelRef
    executionModel?: ModelRef
    verificationModel?: ModelRef
  }
  /** E4.3: Called when a tool emits a streaming output chunk */
  onToolOutput?: (toolCallId: string, chunk: string) => void
  /** E4.5: Called once after the main loop (+ verify phase) completes */
  onLoopComplete?: (metric: import("@/types").LoopCompletionMetric) => void
  /** E4.7: Workspace ID for audit trail events */
  workspaceId?: string
}

// ─── Helpers ────────────────────────────────────────────────

function truncateToolResult(result: unknown, maxChars = 8000): string {
  const str = typeof result === "string" ? result : JSON.stringify(result, null, 2)
  if (str.length <= maxChars) return str
  return str.slice(0, maxChars) + `\n... [truncated ${str.length - maxChars} chars]`
}

function makeActivity(
  call: ToolCall,
  status: ToolActivity["status"],
  result?: unknown,
  injectionWarning?: InjectionDetection
): ToolActivity {
  const now = new Date().toISOString()
  return {
    id: call.id,
    name: call.name,
    args: call.arguments,
    status,
    result,
    startedAt: now,
    finishedAt: status !== "running" ? now : undefined,
    injectionWarning,
  }
}

/** H3.4: Stable hash of tool arguments — sorted keys, first 40 chars */
function stableHash(args: Record<string, unknown>): string {
  return JSON.stringify(args, Object.keys(args).sort()).slice(0, 40)
}

/** H3.5: Returns a promise that rejects after `ms` milliseconds */
function timeoutReject(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Tool timed out after ${ms}ms`)), ms)
  )
}

/** H3.7: Pick the active model for the current iteration */
function resolveModel(
  opts: AgentLoopOptions,
  iteration: number,
  verifyPhase: boolean
): { providerId: string; providerType: string; modelId: string } {
  const routing = opts.modelRouting
  if (!routing) {
    return {
      providerId: opts.providerId,
      providerType: opts.providerType,
      modelId: opts.modelId,
    }
  }

  let ref: ModelRef | undefined
  if (verifyPhase) {
    ref = routing.verificationModel
  } else if (iteration === 0) {
    ref = routing.planningModel
  } else {
    ref = routing.executionModel
  }

  if (!ref) {
    return {
      providerId: opts.providerId,
      providerType: opts.providerType,
      modelId: opts.modelId,
    }
  }
  return {
    providerId: ref.providerId,
    // providerType not in ModelRef — fall back to the configured type
    providerType: opts.providerType,
    modelId: ref.modelId,
  }
}

// ─── Core loop logic (extracted for reuse in verify phase) ───

interface LoopRunOptions {
  opts: AgentLoopOptions
  tools: ToolDefinition[]
  workingHistory: AgentMessage[]
  allToolsCalled: string[]
  intermediateMessages: AgentMessage[]
  timedOutTools: string[]
  maxIter: number
  verifyPhase: boolean
  /** Doom-loop state shared across main + verify phases */
  doomState: { recentSignatures: string[]; injected: boolean; detected: boolean }
}

interface LoopRunResult {
  text: string
  workingHistory: AgentMessage[]
}

async function runLoop(ctx: LoopRunOptions): Promise<LoopRunResult> {
  const { opts, tools, timedOutTools, doomState } = ctx
  let { workingHistory } = ctx

  for (let iteration = 0; iteration < ctx.maxIter; iteration++) {
    const { providerId, providerType, modelId } = resolveModel(
      opts,
      iteration,
      ctx.verifyPhase
    )

    let accumText = ""
    const pendingCalls = new Map<string, { name: string; argBuffer: string }>()
    const completedCalls: ToolCall[] = []

    for await (const chunk of streamChat(
      providerId,
      providerType,
      modelId,
      workingHistory,
      tools.length > 0 ? tools : undefined,
      opts.signal
    )) {
      if (opts.signal?.aborted) {
        return { text: accumText, workingHistory }
      }

      if (chunk.delta) {
        accumText += chunk.delta
        opts.onChunk(chunk.delta)
      }

      if (chunk.toolCallStart) {
        const { id, name } = chunk.toolCallStart
        pendingCalls.set(id, { name, argBuffer: "" })
        log.debug("tool call start", { name, id })
        opts.onToolStart(makeActivity({ id, name, arguments: {} }, "running"))
      }

      if (chunk.toolCallArgsDelta) {
        const pending = pendingCalls.get(chunk.toolCallArgsDelta.id)
        if (pending) {
          pending.argBuffer += chunk.toolCallArgsDelta.delta
        }
      }

      if (chunk.toolCallEnd) {
        const pending = pendingCalls.get(chunk.toolCallEnd.id)
        if (pending) {
          let parsedArgs: Record<string, unknown> = {}
          try {
            parsedArgs = JSON.parse(pending.argBuffer)
          } catch {
            parsedArgs = { raw: pending.argBuffer }
          }
          completedCalls.push({
            id: chunk.toolCallEnd.id,
            name: pending.name,
            arguments: parsedArgs,
          })
          pendingCalls.delete(chunk.toolCallEnd.id)
        }
      }
    }

    // Finalize orphaned tool calls (stream ended before toolCallEnd marker)
    if (pendingCalls.size > 0) {
      log.warn("finalizing orphaned tool calls", {
        count: pendingCalls.size,
        names: [...pendingCalls.values()].map((p) => p.name),
      })
      for (const [id, pending] of pendingCalls) {
        let parsedArgs: Record<string, unknown> = {}
        try {
          parsedArgs = JSON.parse(pending.argBuffer)
        } catch {
          if (pending.argBuffer.trim()) {
            parsedArgs = { raw: pending.argBuffer }
          }
        }
        completedCalls.push({ id, name: pending.name, arguments: parsedArgs })
      }
      pendingCalls.clear()
    }

    // Append assistant turn
    const assistantTurn: AgentMessage = {
      role: "assistant",
      content: accumText,
      toolCalls: completedCalls.length > 0 ? completedCalls : undefined,
    }
    workingHistory = [...workingHistory, assistantTurn]

    // No tool calls — model is done (final response)
    if (completedCalls.length === 0) {
      return { text: accumText, workingHistory }
    }

    // Track as intermediate (had tool calls)
    ctx.intermediateMessages.push(assistantTurn)

    // H3.4: Update doom-loop sliding window
    for (const call of completedCalls) {
      doomState.recentSignatures.push(call.name + stableHash(call.arguments))
    }
    while (doomState.recentSignatures.length > DOOM_WINDOW_SIZE) {
      doomState.recentSignatures.shift()
    }

    // Execute all tool calls (extraExecutors take priority over global registry)
    const results = await Promise.allSettled(
      completedCalls.map(async (call) => {
        ctx.allToolsCalled.push(call.name)
        try {
          const extraExec = opts.extraExecutors?.get(call.name)
          // E4.3: Build per-tool chunk callback
          const toolOnChunk = opts.onToolOutput
            ? (chunk: string) => opts.onToolOutput!(call.id, chunk)
            : undefined
          const execPromise = extraExec
            ? extraExec(call.arguments, toolOnChunk)
            : executeTool(call.name, call.arguments, toolOnChunk)

          // H3.5: Wrap in timeout race if configured
          let result =
            opts.toolTimeoutMs !== undefined
              ? await Promise.race([execPromise, timeoutReject(opts.toolTimeoutMs)])
              : await execPromise

          // E4.7: Detect prompt injection in tool result
          const resultStr = typeof result === "string" ? result : JSON.stringify(result)
          const detection = detectInjection(resultStr)
          let injectionWarning: InjectionDetection | undefined
          if (detection) {
            injectionWarning = detection
            log.warn(`Injection detected [${detection.severity}]`, {
              pattern: detection.pattern,
              snippet: detection.snippet,
              tool: call.name,
            })
            // Persist audit event (fire-and-forget — never blocks the loop)
            invoke("append_audit_event", {
              event: {
                type: "injection_detected",
                severity: detection.severity,
                pattern: detection.pattern,
                snippet: detection.snippet,
                toolName: call.name,
                workspaceId: opts.workspaceId ?? null,
                timestamp: new Date().toISOString(),
              },
            }).catch(() => {})
            // Redact high-severity results before injecting into LLM history
            if (detection.severity === "high") {
              result = `[INJECTION DETECTED — response blocked]\n\n${resultStr.slice(0, 200)}...`
            }
          }

          log.debug("tool result", { name: call.name, ok: true })
          opts.onToolEnd(makeActivity(call, "done", result, injectionWarning))
          return { call, result, ok: true as const }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          // H3.5: Track timed-out tools
          if (opts.toolTimeoutMs !== undefined && msg.includes("timed out after")) {
            timedOutTools.push(call.name)
          }
          log.warn("tool error", { name: call.name, error: msg })
          opts.onToolEnd(makeActivity(call, "error", msg))
          return { call, result: msg, ok: false as const }
        }
      })
    )

    // Emit tool:completed events and append tool result turns
    for (const settled of results) {
      if (settled.status === "fulfilled") {
        const { call, result } = settled.value
        const toolTurn: AgentMessage = {
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: truncateToolResult(result),
        }
        workingHistory = [...workingHistory, toolTurn]
        ctx.intermediateMessages.push(toolTurn)
      }
    }

    // H3.4: Check for doom loop (window full + too few unique signatures)
    if (doomState.recentSignatures.length === DOOM_WINDOW_SIZE && !doomState.injected) {
      const unique = new Set(doomState.recentSignatures).size
      if (unique <= DOOM_UNIQUE_THRESHOLD) {
        doomState.detected = true
        doomState.injected = true
        log.warn("doom loop detected — injecting correction", {
          window: doomState.recentSignatures,
          uniqueCount: unique,
        })
        workingHistory = [
          ...workingHistory,
          {
            role: "user",
            content:
              "⚠️ LOOP DETECTED: You have been calling the same tools repeatedly without making progress. Stop repeating the same actions. Re-evaluate your approach, identify what is blocking you, and try a different strategy or report the issue.",
          },
        ]
      }
    }

    // Compact history if approaching token limits
    if (estimateTokens(workingHistory) > TOKEN_THRESHOLD) {
      log.debug("compacting history", { estimatedTokens: estimateTokens(workingHistory) })
      workingHistory = compactHistory(workingHistory, "", { keepRecentTurns: 10 })
    }
  }

  log.warn("max iterations reached", { maxIter: ctx.maxIter })
  return {
    text: `Reached maximum iterations (${ctx.maxIter}). Last response may be incomplete.`,
    workingHistory,
  }
}

// ─── Public API ──────────────────────────────────────────────

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const { maxIterations = DEFAULT_MAX_ITERATIONS } = opts
  const loopStartedAt = Date.now()

  const tools = opts.tools ?? getToolDefinitions()
  const workingHistory: AgentMessage[] = [...opts.history]
  const allToolsCalled: string[] = []
  const intermediateMessages: AgentMessage[] = []
  const timedOutTools: string[] = []
  const doomState = { recentSignatures: [] as string[], injected: false, detected: false }

  // ─── Main loop ──────────────────────────────────────────────
  const mainResult = await runLoop({
    opts,
    tools,
    workingHistory,
    allToolsCalled,
    intermediateMessages,
    timedOutTools,
    maxIter: maxIterations,
    verifyPhase: false,
    doomState,
  })

  // H3.4: Self-verification phase — only triggered if tools were called
  let selfVerifyTriggered = false
  let finalText = mainResult.text

  if (opts.selfVerify && allToolsCalled.length > 0 && !opts.signal?.aborted) {
    selfVerifyTriggered = true
    log.debug("entering self-verification phase")

    const verifyHistory: AgentMessage[] = [
      ...mainResult.workingHistory,
      {
        role: "user",
        content:
          "Review your tool call results. Did all steps complete without error? If yes respond DONE. If not, address remaining issues.",
      },
    ]

    const verifyResult = await runLoop({
      opts,
      tools,
      workingHistory: verifyHistory,
      allToolsCalled,
      intermediateMessages,
      timedOutTools,
      maxIter: VERIFY_MAX_ITERATIONS,
      verifyPhase: true,
      doomState,
    })

    finalText = verifyResult.text
  }

  // E4.5: Emit loop completion metric
  if (opts.onLoopComplete && opts.workspaceId) {
    const historyStr = JSON.stringify(mainResult.workingHistory)
    opts.onLoopComplete({
      timestamp: new Date().toISOString(),
      workspaceId: opts.workspaceId,
      toolsCalled: allToolsCalled,
      iterations: allToolsCalled.length,
      estimatedTokens: Math.round(historyStr.length / 4),
      durationMs: Date.now() - loopStartedAt,
      doomLoopDetected: doomState.detected,
    })
  }

  return {
    text: finalText,
    toolsCalled: allToolsCalled,
    intermediateMessages,
    doomLoopDetected: doomState.detected,
    selfVerifyTriggered,
    timedOutTools,
  }
}
