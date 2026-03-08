/**
 * Context compaction for long-running agentic loops.
 * Keeps token usage under a budget by sliding the history window.
 */
import type { AgentMessage } from "@/types"

/** Rough estimate: 1 token ≈ 4 chars */
export function estimateTokens(messages: AgentMessage[]): number {
  let chars = 0
  for (const m of messages) {
    chars += m.content.length
    if (m.role === "assistant" && m.toolCalls) {
      chars += JSON.stringify(m.toolCalls).length
    }
  }
  return Math.ceil(chars / 4)
}

/**
 * Sliding-window compaction — keeps the system message(s) and last N turns.
 * A "turn" is one assistant message + its tool results (if any).
 */
export function compactHistory(
  history: AgentMessage[],
  _systemPrompt: string,
  options: { keepRecentTurns?: number; maxTokens?: number } = {}
): AgentMessage[] {
  const keepTurns = options.keepRecentTurns ?? 10

  // Separate system messages from the rest
  const systemMessages = history.filter((m) => m.role === "system")
  const nonSystem = history.filter((m) => m.role !== "system")

  // Keep the last keepTurns * 2 messages (rough proxy for turns)
  // Each turn = 1 assistant + N tool results + 1 user (worst case ~3 msgs each)
  const keepCount = keepTurns * 3
  const trimmed = nonSystem.length > keepCount ? nonSystem.slice(-keepCount) : nonSystem

  return [...systemMessages, ...trimmed]
}

/**
 * Claude compact — uses the provider's summarization to compress history.
 * Falls back to sliding window if the API call fails.
 */
export async function claudeCompact(
  history: AgentMessage[],
  providerId: string,
  modelId: string
): Promise<AgentMessage[]> {
  // Lazy import to avoid circular dependency
  const { streamChat } = await import("@/services/providers/bridge")

  const systemMessages = history.filter((m) => m.role === "system")
  const nonSystem = history.filter((m) => m.role !== "system")

  const summaryRequest: AgentMessage[] = [
    ...systemMessages,
    ...nonSystem,
    {
      role: "user",
      content:
        "Please provide a concise summary of the conversation above, preserving key facts, decisions, and results. This summary will replace the conversation history to save context space.",
    },
  ]

  try {
    let summary = ""
    for await (const chunk of streamChat(providerId, "openai-compatible", modelId, summaryRequest)) {
      if (chunk.delta) summary += chunk.delta
    }

    const compactedHistory: AgentMessage[] = [
      ...systemMessages,
      {
        role: "assistant",
        content: `[Previous conversation summary]\n\n${summary}`,
      },
    ]
    return compactedHistory
  } catch {
    // Fallback to sliding window
    return compactHistory(history, "", { keepRecentTurns: 10 })
  }
}
