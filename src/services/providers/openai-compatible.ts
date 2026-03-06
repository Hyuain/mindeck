import type { ChatParams, ChatChunk, HealthStatus, Model, ProviderAdapter } from "./types";

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly id: string;
  readonly name: string;

  constructor(
    id: string,
    name: string,
    private readonly baseUrl: string,
  ) {
    this.id = id;
    this.name = name;
  }

  async validateKey(key: string): Promise<boolean> {
    return this.healthCheck(key).then((h) => h.status === "connected");
  }

  async listModels(key: string): Promise<Model[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    return (data.data ?? []).map((m) => ({ id: m.id, name: m.id }));
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey ?? ""}`,
      },
      body: JSON.stringify({
        model: params.modelId,
        messages: params.messages,
        stream: true,
      }),
      signal: params.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Provider error ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();

    try {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            yield { delta: "", done: true };
            return;
          }
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            if (delta) yield { delta, done: false };
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async healthCheck(key: string): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { status: "error", message: `HTTP ${response.status}` };
      return { status: "connected", latencyMs: Date.now() - start };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : "Unknown error" };
    }
  }
}
