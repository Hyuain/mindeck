/**
 * Frontend bridge to Rust provider commands.
 *
 * All HTTP requests are made by Rust (reqwest). API keys are fetched from the
 * OS Keychain inside Rust — they never touch the JS heap.
 *
 * Usage:
 *   for await (const chunk of streamChat(providerId, modelId, messages)) { ... }
 *   const result = await probeProvider(providerId)
 *   const models  = await listProviderModels(providerId)
 */
import { invoke, Channel } from "@tauri-apps/api/core"
import type { ChatChunk, ChatMessage, HealthStatus, Model } from "./types"

// ─── Wire types (must match Rust StreamEvent) ─────────────────

type StreamEvent =
  | { type: "chunk"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string }

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

// ─── Public API ───────────────────────────────────────────────

/**
 * Stream a chat completion from a saved provider.
 * Rust loads the provider config from disk and fetches the API key from
 * the OS Keychain — no credentials pass through the frontend.
 */
export async function* streamChat(
  providerId: string,
  modelId: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncIterable<ChatChunk> {
  // A simple async queue bridges the Channel callback into an AsyncIterable.
  const queue: Array<ChatChunk | Error> = []
  let notify: (() => void) | null = null
  let settled = false

  const push = (item: ChatChunk | Error) => {
    queue.push(item)
    notify?.()
    notify = null
  }

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
    }
  }

  // stream_chat returns Ok(()) immediately; events arrive asynchronously.
  invoke("stream_chat", {
    onEvent: channel,
    providerId,
    modelId,
    messages,
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

/**
 * Health-check a saved provider. Returns latency on success.
 */
export async function probeProvider(providerId: string): Promise<HealthStatus> {
  const result = await invoke<ProbeResult>("probe_provider", { providerId })
  if (result.status === "connected") {
    return { status: "connected", latencyMs: result.latencyMs ?? 0 }
  }
  return { status: "error", message: result.message ?? "Unknown error" }
}

/**
 * Validate a provider connection using raw parameters — used by the
 * "Add Provider" form before the provider has been saved to disk.
 */
export async function probeUrl(
  providerType: string,
  baseUrl: string,
  apiKey: string
): Promise<HealthStatus> {
  const result = await invoke<ProbeResult>("probe_url", { providerType, baseUrl, apiKey })
  if (result.status === "connected") {
    return { status: "connected", latencyMs: result.latencyMs ?? 0 }
  }
  return { status: "error", message: result.message ?? "Unknown error" }
}

/**
 * List models for a saved provider.
 * For Ollama/OpenAI-compatible: fetches from the provider API.
 * For MiniMax: returns the static list embedded in Rust.
 */
export async function listProviderModels(providerId: string): Promise<Model[]> {
  const models = await invoke<ModelInfo[]>("list_provider_models", { providerId })
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    contextLength: m.contextLength,
  }))
}
