import { streamChat, probeProvider, listProviderModels } from "./bridge"
import type { ChatChunk, HealthStatus, Model } from "./types"
import type { AgentMessage } from "@/types"

export const providerManager = {
  chat(
    providerId: string,
    modelId: string,
    messages: AgentMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<ChatChunk> {
    // providerType is "" for simple workspace chats — no tool formatting needed
    return streamChat(providerId, "", modelId, messages, undefined, signal)
  },

  healthCheck(providerId: string): Promise<HealthStatus> {
    return probeProvider(providerId)
  },

  listModels(providerId: string): Promise<Model[]> {
    return listProviderModels(providerId)
  },
}
