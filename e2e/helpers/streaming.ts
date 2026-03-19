// ─── E2E Streaming Helpers ───────────────────────────────────
// Build mock stream_chat handlers that simulate real LLM streaming
// through the Channel-based protocol.

interface StreamTextTurn {
  type: "text"
  content: string
  /** Chunk size (characters per event). Default: 10 */
  chunkSize?: number
}

interface StreamToolCallTurn {
  type: "toolCall"
  id: string
  name: string
  args: Record<string, unknown>
}

export type StreamTurn = StreamTextTurn | StreamToolCallTurn

/**
 * Creates a stream_chat invoke handler that emits events through
 * the Channel mock. Matches the real Rust streaming protocol.
 *
 * Usage in addInitScript:
 * ```
 * window.__E2E_HANDLERS__.stream_chat = buildStreamHandler([
 *   { type: "text", content: "Hello world!" },
 * ])
 * ```
 */
export function buildStreamHandler(turns: StreamTurn[]) {
  // Return a serializable function body (for addInitScript)
  return `(args) => {
    const channel = args.onEvent;
    return new Promise((resolve) => {
      const turns = ${JSON.stringify(turns)};
      let delay = 10;

      function schedule(fn, ms) {
        setTimeout(fn, ms);
      }

      let offset = delay;
      for (const turn of turns) {
        if (turn.type === "text") {
          const chunkSize = turn.chunkSize || 10;
          const chunks = [];
          for (let i = 0; i < turn.content.length; i += chunkSize) {
            chunks.push(turn.content.slice(i, i + chunkSize));
          }
          for (const chunk of chunks) {
            const t = offset;
            schedule(() => channel.onmessage({ type: "chunk", delta: chunk }), t);
            offset += 5;
          }
        } else if (turn.type === "toolCall") {
          const t1 = offset;
          schedule(() => channel.onmessage({
            type: "toolCallStart",
            id: turn.id,
            name: turn.name,
          }), t1);
          offset += 5;

          const argsStr = JSON.stringify(turn.args);
          const t2 = offset;
          schedule(() => channel.onmessage({
            type: "toolCallArgsDelta",
            id: turn.id,
            delta: argsStr,
          }), t2);
          offset += 5;

          const t3 = offset;
          schedule(() => channel.onmessage({
            type: "toolCallEnd",
            id: turn.id,
          }), t3);
          offset += 10;
        }
      }

      schedule(() => {
        channel.onmessage({ type: "done" });
        resolve(null);
      }, offset + 10);
    });
  }`
}

/**
 * Builds an inline handler string for a simple text response.
 */
export function buildSimpleStreamHandler(text: string): string {
  return buildStreamHandler([{ type: "text", content: text }])
}
