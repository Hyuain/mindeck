/**
 * Strip <think>/<thinking> blocks from LLM output.
 * Used to clean task results before they flow to Majordomo.
 */
export function stripThinkingTags(content: string): string {
  return content
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
}
