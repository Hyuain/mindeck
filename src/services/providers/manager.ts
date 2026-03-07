import { streamChat, probeProvider, listProviderModels } from "./bridge"
import type { ChatMessage, ChatChunk, HealthStatus, Model } from "./types"

export const providerManager = {
  chat(
    providerId: string,
    modelId: string,
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<ChatChunk> {
    return streamChat(providerId, modelId, messages, signal)
  },

  healthCheck(providerId: string): Promise<HealthStatus> {
    return probeProvider(providerId)
  },

  listModels(providerId: string): Promise<Model[]> {
    return listProviderModels(providerId)
  },
}
