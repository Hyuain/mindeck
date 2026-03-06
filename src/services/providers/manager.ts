import type { ProviderAdapter } from "./types";
import { OllamaAdapter } from "./ollama";
import { OpenAICompatibleAdapter } from "./openai-compatible";
import type { ProviderConfig } from "@/types";

class ProviderManager {
  private adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): ProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  getOrThrow(id: string): ProviderAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Provider adapter "${id}" not registered`);
    return adapter;
  }

  fromConfig(config: ProviderConfig): ProviderAdapter {
    if (config.type === "ollama") {
      return new OllamaAdapter(config.baseUrl);
    }
    return new OpenAICompatibleAdapter(config.id, config.name, config.baseUrl);
  }

  all(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }
}

// Singleton
export const providerManager = new ProviderManager();

// Register built-in defaults
providerManager.register(new OllamaAdapter());
providerManager.register(
  new OpenAICompatibleAdapter("deepseek", "DeepSeek", "https://api.deepseek.com/v1")
);
providerManager.register(
  new OpenAICompatibleAdapter(
    "qwen",
    "Qwen / 通义",
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  )
);
