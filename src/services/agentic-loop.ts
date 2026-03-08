/**
 * Agentic loop — streams, detects tool calls, executes them, and loops
 * until the model produces a final response (no more tool calls).
 */
import { streamChat } from "./providers/bridge"
import { executeTool, getToolDefinitions } from "./tools/registry"
import { createLogger } from "./logger"
import { estimateTokens, compactHistory } from "./context-compaction"
import type { AgentMessage, ToolCall, ToolActivity, ToolDefinition } from "@/types"

const log = createLogger("AgenticLoop")

const DEFAULT_MAX_ITERATIONS = 25
const TOKEN_THRESHOLD = 100_000

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
  extraExecutors?: Map<string, (args: Record<string, unknown>) => Promise<unknown>>
}

function truncateToolResult(result: unknown, maxChars = 8000): string {
  const str = typeof result === "string" ? result : JSON.stringify(result, null, 2)
  if (str.length <= maxChars) return str
  return str.slice(0, maxChars) + `\n... [truncated ${str.length - maxChars} chars]`
}

function makeActivity(
  call: ToolCall,
  status: ToolActivity["status"],
  result?: unknown
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
  }
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    providerId,
    providerType,
    modelId,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    signal,
    onChunk,
    onToolStart,
    onToolEnd,
  } = opts

  const tools = opts.tools ?? getToolDefinitions()
  let workingHistory: AgentMessage[] = [...opts.history]
  const allToolsCalled: string[] = []
  const intermediateMessages: AgentMessage[] = []

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let accumText = ""
    const pendingCalls = new Map<string, { name: string; argBuffer: string }>()
    const completedCalls: ToolCall[] = []

    for await (const chunk of streamChat(
      providerId,
      providerType,
      modelId,
      workingHistory,
      tools.length > 0 ? tools : undefined,
      signal
    )) {
      if (signal?.aborted)
        return { text: accumText, toolsCalled: allToolsCalled, intermediateMessages }

      if (chunk.delta) {
        accumText += chunk.delta
        onChunk(chunk.delta)
      }

      if (chunk.toolCallStart) {
        const { id, name } = chunk.toolCallStart
        pendingCalls.set(id, { name, argBuffer: "" })
        log.debug("tool call start", { name, id })
        onToolStart(makeActivity({ id, name, arguments: {} }, "running"))
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

    // Finalize any tool calls that were started but never got a toolCallEnd
    // (can happen when the stream ends prematurely or the provider omits
    // the end marker). Without this, pending calls are silently dropped and
    // the loop exits thinking the model produced no tool calls.
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

    // No tool calls — model is done (this is the final response, not intermediate)
    if (completedCalls.length === 0) {
      return { text: accumText, toolsCalled: allToolsCalled, intermediateMessages }
    }

    // This assistant turn had tool calls — track it as intermediate
    intermediateMessages.push(assistantTurn)

    // Execute all tool calls (extraExecutors take priority over global registry)
    const results = await Promise.allSettled(
      completedCalls.map(async (call) => {
        allToolsCalled.push(call.name)
        try {
          const extraExec = opts.extraExecutors?.get(call.name)
          const result = extraExec
            ? await extraExec(call.arguments)
            : await executeTool(call.name, call.arguments)
          log.debug("tool result", { name: call.name, ok: true })
          onToolEnd(makeActivity(call, "done", result))
          return { call, result, ok: true as const }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.warn("tool error", { name: call.name, error: msg })
          onToolEnd(makeActivity(call, "error", msg))
          return { call, result: msg, ok: false as const }
        }
      })
    )

    // Append tool result turns
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
        intermediateMessages.push(toolTurn)
      }
    }

    // Compact history if we're approaching token limits
    if (estimateTokens(workingHistory) > TOKEN_THRESHOLD) {
      log.debug("compacting history", { estimatedTokens: estimateTokens(workingHistory) })
      workingHistory = compactHistory(workingHistory, "", { keepRecentTurns: 10 })
    }
  }

  log.warn("max iterations reached", { iterations: maxIterations })
  return {
    text: `Reached maximum iterations (${maxIterations}). Last response may be incomplete.`,
    toolsCalled: allToolsCalled,
    intermediateMessages,
  }
}
