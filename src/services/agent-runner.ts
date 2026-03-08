/**
 * Shared agent runner — wraps runAgentLoop with system prompt injection,
 * proper history mapping, and intermediate message tracking.
 *
 * Both WorkspaceAgent and MajordomoPanel use this as their execution engine.
 */
import { runAgentLoop } from "./agentic-loop"
import type {
  AgentMessage,
  Message,
  ModelCapabilities,
  ModelRef,
  ToolActivity,
  ToolDefinition,
} from "@/types"

/**
 * Extra system prompt instructions injected when a model has weak function-calling.
 * Placed at the top of the system prompt so it takes highest precedence.
 */
const WEAK_FC_PREAMBLE = `⚠️ TOOL-CALLING NOTICE: This model has limited native function-calling support.
- You MUST emit real tool function calls — do NOT describe actions in text.
- Every file, command, or dispatch operation must be a structured tool invocation.
- If you cannot produce a real tool call, say so explicitly instead of pretending to act.
- Text descriptions of actions have NO effect on the system.`

export interface AgentRunnerOptions {
  providerId: string
  providerType: string
  modelId: string
  systemPrompt: string
  /** Conversation history (excludes system prompt — it will be prepended automatically) */
  history: AgentMessage[]
  tools?: ToolDefinition[]
  extraExecutors?: Map<string, (args: Record<string, unknown>) => Promise<unknown>>
  maxIterations?: number
  signal?: AbortSignal
  onChunk: (delta: string) => void
  onToolStart: (activity: ToolActivity) => void
  onToolEnd: (activity: ToolActivity) => void
  /**
   * Capability profile of the model being invoked.
   * Controls tool injection and system prompt adjustments.
   */
  modelCapabilities?: ModelCapabilities
  /** H3.7: Per-phase model routing */
  modelRouting?: {
    planningModel?: ModelRef
    executionModel?: ModelRef
    verificationModel?: ModelRef
  }
}

export interface AgentRunResult {
  text: string
  toolsCalled: string[]
  /** All assistant+tool turns from multi-step tool use, for persistence */
  intermediateMessages: AgentMessage[]
}

/**
 * Run the agentic loop with a system prompt prepended to history.
 * Applies capability-based adjustments before invoking the loop:
 *  - `functionCalling: "none"` → strips all tool definitions (model receives no tools)
 *  - `functionCalling: "weak"` → injects a reinforcing preamble into the system prompt
 * Returns the final text response plus all intermediate tool-call turns.
 */
export async function runAgent(opts: AgentRunnerOptions): Promise<AgentRunResult> {
  const caps = opts.modelCapabilities ?? {}

  // For models with no function-calling support, strip tools entirely so the
  // API request doesn't include a tools array (avoids API errors / junk responses).
  const effectiveTools = caps.functionCalling === "none" ? undefined : opts.tools

  // For models with weak function-calling, prepend a reinforcing notice so the
  // instruction appears before any other content in the context window.
  const effectiveSystemPrompt =
    caps.functionCalling === "weak"
      ? `${WEAK_FC_PREAMBLE}\n\n${opts.systemPrompt}`
      : opts.systemPrompt

  const fullHistory: AgentMessage[] = [
    { role: "system", content: effectiveSystemPrompt },
    ...opts.history,
  ]

  return runAgentLoop({
    providerId: opts.providerId,
    providerType: opts.providerType,
    modelId: opts.modelId,
    history: fullHistory,
    tools: effectiveTools,
    extraExecutors: opts.extraExecutors,
    maxIterations: opts.maxIterations,
    signal: opts.signal,
    modelRouting: opts.modelRouting,
    onChunk: opts.onChunk,
    onToolStart: opts.onToolStart,
    onToolEnd: opts.onToolEnd,
  })
}

/**
 * Convert persisted Message[] back to AgentMessage[] for the agentic loop.
 * Handles all roles including "tool" (with toolCallId/toolName) and
 * "assistant" turns with toolCalls arrays.
 */
export function messagesToAgentHistory(messages: Message[]): AgentMessage[] {
  return messages.flatMap((m): AgentMessage[] => {
    if (m.role === "tool") {
      if (!m.toolCallId) return []
      return [
        {
          role: "tool",
          toolCallId: m.toolCallId,
          name: m.toolName ?? "",
          content: m.content,
        },
      ]
    }

    if (m.role === "assistant") {
      return [{ role: "assistant", content: m.content, toolCalls: m.toolCalls }]
    }

    if (m.role === "user" || m.role === "system") {
      return [{ role: m.role, content: m.content }]
    }

    return []
  })
}
