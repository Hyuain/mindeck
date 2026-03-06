import type { HealthStatus, Model } from "@/types"
export type { HealthStatus, Model }

export interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
}

export interface ChatParams {
  modelId: string
  messages: ChatMessage[]
  apiKey?: string
  signal?: AbortSignal
}

export interface ChatChunk {
  delta: string
  done: boolean
}

export interface ProviderAdapter {
  readonly id: string
  readonly name: string
  validateKey(key: string): Promise<boolean>
  listModels(key: string): Promise<Model[]>
  chat(params: ChatParams): AsyncIterable<ChatChunk>
  healthCheck(key: string): Promise<HealthStatus>
}
