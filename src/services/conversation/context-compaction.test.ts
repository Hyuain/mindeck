import { describe, it, expect } from "vitest"
import { estimateTokens, compactHistory } from "./context-compaction"
import {
  makeAgentMessage,
  makeAssistantMessage,
  makeTestToolCall,
} from "@/test/factories"

describe("estimateTokens", () => {
  it("returns 0 for empty array", () => {
    expect(estimateTokens([])).toBe(0)
  })

  it("estimates tokens from content length (1 token ≈ 4 chars)", () => {
    const messages = [makeAgentMessage("user", "Hello world!")]
    // "Hello world!" = 12 chars → ceil(12/4) = 3
    expect(estimateTokens(messages)).toBe(3)
  })

  it("includes toolCalls in token count for assistant messages", () => {
    const toolCall = makeTestToolCall()
    const msg = makeAssistantMessage("Ok", [toolCall])
    const tokens = estimateTokens([msg])
    // content "Ok" (2 chars) + JSON.stringify(toolCalls) length
    const expectedChars = 2 + JSON.stringify([toolCall]).length
    expect(tokens).toBe(Math.ceil(expectedChars / 4))
  })

  it("sums tokens across multiple messages", () => {
    const messages = [
      makeAgentMessage("user", "abcd"), // 4 chars → 1 token
      makeAgentMessage("user", "efghijkl"), // 8 chars → 2 tokens
    ]
    expect(estimateTokens(messages)).toBe(3)
  })
})

describe("compactHistory", () => {
  it("returns all messages when under keepTurns limit", () => {
    const messages = [
      makeAgentMessage("system", "You are a bot"),
      makeAgentMessage("user", "Hi"),
      makeAssistantMessage("Hello!"),
    ]
    const result = compactHistory(messages, "")
    expect(result).toHaveLength(3)
  })

  it("preserves system messages and trims non-system from the start", () => {
    const system = makeAgentMessage("system", "System prompt")
    const nonSystem = Array.from({ length: 40 }, (_, i) =>
      makeAgentMessage("user", `Message ${i}`)
    )
    const result = compactHistory([system, ...nonSystem], "", { keepRecentTurns: 5 })
    // System message is always kept
    expect(result[0]).toEqual(system)
    // keepTurns=5 → keepCount=15, so last 15 non-system messages
    expect(result).toHaveLength(1 + 15)
    expect(result[1]).toEqual(nonSystem[40 - 15])
  })

  it("defaults to keepRecentTurns=10", () => {
    const messages = Array.from({ length: 50 }, (_, i) =>
      makeAgentMessage("user", `Message ${i}`)
    )
    const result = compactHistory(messages, "")
    // 10 * 3 = 30 recent messages
    expect(result).toHaveLength(30)
  })

  it("does not trim when under the threshold", () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      makeAgentMessage("user", `Message ${i}`)
    )
    const result = compactHistory(messages, "", { keepRecentTurns: 10 })
    expect(result).toHaveLength(5)
  })
})
