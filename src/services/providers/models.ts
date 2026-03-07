/**
 * Static recommended model lists for providers that don't support dynamic
 * model listing (or where we want curated defaults).
 *
 * Ollama models are fetched dynamically via listProviderModels().
 * MiniMax models are also fetched via listProviderModels() (static list in Rust),
 * but we keep a copy here for the UI form's initial state.
 */
import type { Model } from "@/types"

export const PROVIDER_MODELS: Record<string, Model[]> = {
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek Chat (V3)", contextLength: 64_000 },
    { id: "deepseek-reasoner", name: "DeepSeek R1 (Reasoner)", contextLength: 64_000 },
  ],
  qwen: [
    { id: "qwen-turbo-latest", name: "Qwen Turbo", contextLength: 1_000_000 },
    { id: "qwen-plus-latest", name: "Qwen Plus", contextLength: 131_072 },
    { id: "qwen-max-latest", name: "Qwen Max", contextLength: 32_768 },
    { id: "qwen3-235b-a22b", name: "Qwen3 235B", contextLength: 131_072 },
  ],
  minimax: [
    { id: "MiniMax-M2.5", name: "MiniMax M2.5 (~60 tps)", contextLength: 204_800 },
    { id: "MiniMax-M2.5-highspeed", name: "MiniMax M2.5 Highspeed (~100 tps)", contextLength: 204_800 },
    { id: "MiniMax-M2.1", name: "MiniMax M2.1 (~60 tps)", contextLength: 204_800 },
    { id: "MiniMax-M2.1-highspeed", name: "MiniMax M2.1 Highspeed (~100 tps)", contextLength: 204_800 },
    { id: "MiniMax-M2", name: "MiniMax M2 (Agentic)", contextLength: 204_800 },
  ],
}

/** Return recommended models for a provider id, or empty array if unknown/dynamic. */
export function getRecommendedModels(providerId: string): Model[] {
  return PROVIDER_MODELS[providerId] ?? []
}
