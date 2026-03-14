/**
 * Frontend bridge to Rust provider commands.
 *
 * All HTTP requests are made by Rust (reqwest). API keys are fetched from the
 * OS Keychain inside Rust — they never touch the JS heap.
 *
 * Usage (simple):
 *   for await (const chunk of streamChat(providerId, "", modelId, messages)) { ... }
 *
 * Usage (agentic):
 *   for await (const chunk of streamChat(providerId, providerType, modelId, messages, tools)) { ... }
 */
import { invoke, Channel } from "@tauri-apps/api/core"
import type { AgentMessage, ToolDefinition, ToolCall } from "@/types"
import type { ChatChunk, HealthStatus, Model } from "./types"

// ─── Wire types (must match Rust StreamEvent) ─────────────────

type StreamEvent =
  | { type: "chunk"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "toolCallStart"; id: string; name: string }
  | { type: "toolCallArgsDelta"; id: string; delta: string }
  | { type: "toolCallEnd"; id: string }

// Re-export extended ChatChunk
export type { ChatChunk }

export interface ExtendedChatChunk extends ChatChunk {
  toolCallStart?: { id: string; name: string }
  toolCallArgsDelta?: { id: string; delta: string }
  toolCallEnd?: { id: string }
}

interface ProbeResult {
  status: "connected" | "error"
  latencyMs?: number
  message?: string
}

interface ModelInfo {
  id: string
  name: string
  contextLength?: number
}

// ─── Message formatting ───────────────────────────────────────

function formatToolsOpenAI(tools: ToolDefinition[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

function formatToolsAnthropic(tools: ToolDefinition[]): unknown[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))
}

function formatHistoryOpenAI(messages: AgentMessage[]): unknown[] {
  return messages.map((msg) => {
    if (msg.role === "tool") {
      return {
        role: "tool",
        tool_call_id: msg.toolCallId,
        content: msg.content,
      }
    }
    if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc: ToolCall) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      }
    }
    return { role: msg.role, content: (msg as { content: string }).content }
  })
}

function formatHistoryAnthropic(messages: AgentMessage[]): unknown[] {
  const result: unknown[] = []
  let pendingToolResults: Array<{ id: string; content: string }> = []

  const flushToolResults = () => {
    if (pendingToolResults.length === 0) return
    result.push({
      role: "user",
      content: pendingToolResults.map((tr) => ({
        type: "tool_result",
        tool_use_id: tr.id,
        content: tr.content,
      })),
    })
    pendingToolResults = []
  }

  for (const msg of messages) {
    if (msg.role === "tool") {
      pendingToolResults.push({ id: msg.toolCallId, content: msg.content })
      continue
    }

    flushToolResults()

    if (msg.role === "user" || msg.role === "system") {
      result.push({ role: msg.role, content: msg.content })
    } else if (msg.role === "assistant") {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const content: unknown[] = []
        if (msg.content) content.push({ type: "text", text: msg.content })
        for (const tc of msg.toolCalls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          })
        }
        result.push({ role: "assistant", content })
      } else {
        result.push({ role: "assistant", content: msg.content })
      }
    }
  }

  flushToolResults()
  return result
}

function formatMessages(messages: AgentMessage[], providerType: string): unknown[] {
  const hasToolMessages = messages.some(
    (m) =>
      m.role === "tool" ||
      (m.role === "assistant" && (m as { toolCalls?: ToolCall[] }).toolCalls?.length)
  )

  if (!hasToolMessages) {
    // Simple path — just pass role/content
    return messages.map((m) => ({
      role: m.role,
      content: (m as { content: string }).content,
    }))
  }

  if (providerType === "minimax") {
    return formatHistoryAnthropic(messages)
  }
  return formatHistoryOpenAI(messages)
}

function formatTools(tools: ToolDefinition[], providerType: string): unknown[] {
  if (providerType === "minimax") {
    return formatToolsAnthropic(tools)
  }
  return formatToolsOpenAI(tools)
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Stream a chat completion from a saved provider.
 * Pass `providerType` (the provider's type field) for correct tool formatting.
 * Pass `""` as providerType for simple chats without tools.
 */
export async function* streamChat(
  providerId: string,
  providerType: string,
  modelId: string,
  messages: AgentMessage[],
  tools?: ToolDefinition[],
  signal?: AbortSignal
): AsyncIterable<ExtendedChatChunk> {
  const queue: Array<ExtendedChatChunk | Error> = []
  let notify: (() => void) | null = null
  let settled = false

  const push = (item: ExtendedChatChunk | Error) => {
    queue.push(item)
    notify?.()
    notify = null
  }

  const formattedMessages = formatMessages(messages, providerType)
  const formattedTools =
    tools && tools.length > 0 ? formatTools(tools, providerType) : undefined

  const channel = new Channel<StreamEvent>()
  channel.onmessage = (event) => {
    if (event.type === "chunk") {
      push({ delta: event.delta, done: false })
    } else if (event.type === "done") {
      push({ delta: "", done: true })
      settled = true
    } else if (event.type === "error") {
      push(new Error(event.message))
      settled = true
    } else if (event.type === "toolCallStart") {
      push({ delta: "", done: false, toolCallStart: { id: event.id, name: event.name } })
    } else if (event.type === "toolCallArgsDelta") {
      push({
        delta: "",
        done: false,
        toolCallArgsDelta: { id: event.id, delta: event.delta },
      })
    } else if (event.type === "toolCallEnd") {
      push({ delta: "", done: false, toolCallEnd: { id: event.id } })
    }
  }

  invoke("stream_chat", {
    onEvent: channel,
    providerId,
    modelId,
    messages: formattedMessages,
    tools: formattedTools ?? null,
  }).catch((err: unknown) => {
    push(new Error(String(err)))
    settled = true
    notify?.()
    notify = null
  })

  while (true) {
    if (signal?.aborted) return

    if (queue.length === 0) {
      if (settled) return
      await new Promise<void>((resolve) => {
        notify = resolve
      })
      continue
    }

    const item = queue.shift()!
    if (item instanceof Error) throw item
    if (item.done) return
    yield item
  }
}

/** Health-check a saved provider. */
export async function probeProvider(providerId: string): Promise<HealthStatus> {
  const result = await invoke<ProbeResult>("probe_provider", { providerId })
  if (result.status === "connected") {
    return { status: "connected", latencyMs: result.latencyMs ?? 0 }
  }
  return { status: "error", message: result.message ?? "Unknown error" }
}

/** Validate a provider connection using raw parameters. */
export async function probeUrl(
  providerType: string,
  baseUrl: string,
  keychainAlias?: string
): Promise<HealthStatus> {
  const result = await invoke<ProbeResult>("probe_url", {
    providerType,
    baseUrl,
    keychainAlias: keychainAlias ?? null,
  })
  if (result.status === "connected") {
    return { status: "connected", latencyMs: result.latencyMs ?? 0 }
  }
  return { status: "error", message: result.message ?? "Unknown error" }
}

/** List models for a saved provider. */
export async function listProviderModels(providerId: string): Promise<Model[]> {
  const models = await invoke<ModelInfo[]>("list_provider_models", { providerId })
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    contextLength: m.contextLength,
  }))
}
