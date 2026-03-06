import type { ChatParams, ChatChunk, HealthStatus, Model, ProviderAdapter } from "./types";

export class OllamaAdapter implements ProviderAdapter {
  readonly id = "ollama";
  readonly name = "Ollama (Local)";

  constructor(private readonly baseUrl: string = "http://localhost:11434") {}

  async validateKey(_key: string): Promise<boolean> {
    // Ollama has no key — just check connectivity
    return this.healthCheck("").then((h) => h.status === "connected");
  }

  async listModels(_key: string): Promise<Model[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) return [];
    const data = (await response.json()) as { models?: Array<{ name: string; details?: { parameter_size?: string } }> };
    return (data.models ?? []).map((m) => ({
      id: m.name,
      name: m.name,
    }));
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.modelId,
        messages: params.messages,
        stream: true,
      }),
      signal: params.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n").filter(Boolean)) {
          const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
          if (parsed.message?.content) {
            yield { delta: parsed.message.content, done: false };
          }
          if (parsed.done) {
            yield { delta: "", done: true };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async healthCheck(_key: string): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) return { status: "error", message: response.statusText };
      return { status: "connected", latencyMs: Date.now() - start };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : "Unknown error" };
    }
  }
}
