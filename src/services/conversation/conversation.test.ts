import { describe, it, expect, vi, beforeEach } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import {
  loadMessages,
  appendMessage,
  makeMessage,
  MAJORDOMO_WS_ID,
  loadMajordomoMessages,
  appendMajordomoMessage,
  clearMessages,
  clearMajordomoMessages,
} from "./conversation"
import { makeTestMessage, makeTestToolCall } from "@/test/factories"

describe("conversation", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
  })

  describe("makeMessage", () => {
    it("creates a message with role, content, model, and providerId", () => {
      const msg = makeMessage("user", "Hello", "gpt-4", "openai")
      expect(msg.role).toBe("user")
      expect(msg.content).toBe("Hello")
      expect(msg.model).toBe("gpt-4")
      expect(msg.providerId).toBe("openai")
      expect(msg.id).toBeDefined()
      expect(msg.timestamp).toBeDefined()
    })

    it("allows optional model and providerId", () => {
      const msg = makeMessage("assistant", "Hi")
      expect(msg.model).toBeUndefined()
      expect(msg.providerId).toBeUndefined()
    })
  })

  describe("loadMessages", () => {
    it("calls invoke with correct params and maps results", async () => {
      const jsonlMessages = [
        { id: "1", role: "user", content: "Hi", timestamp: "2026-01-01T00:00:00Z" },
        { id: "2", role: "assistant", content: "Hello!", timestamp: "2026-01-01T00:00:01Z" },
      ]
      vi.mocked(invoke).mockResolvedValue(jsonlMessages)

      const result = await loadMessages("ws-1", 50)

      expect(invoke).toHaveBeenCalledWith("load_messages", {
        workspaceId: "ws-1",
        limit: 50,
      })
      expect(result).toHaveLength(2)
      expect(result[0].role).toBe("user")
      expect(result[1].content).toBe("Hello!")
    })

    it("preserves toolCalls and toolCallId in round-trip", async () => {
      const toolCall = makeTestToolCall({ id: "tc-1", name: "read_file" })
      const jsonlMessages = [
        {
          id: "1",
          role: "assistant",
          content: "",
          timestamp: "2026-01-01T00:00:00Z",
          toolCalls: [toolCall],
        },
        {
          id: "2",
          role: "tool",
          content: "file contents",
          timestamp: "2026-01-01T00:00:01Z",
          toolCallId: "tc-1",
          toolName: "read_file",
        },
      ]
      vi.mocked(invoke).mockResolvedValue(jsonlMessages)

      const result = await loadMessages("ws-1")
      expect(result[0].toolCalls).toEqual([toolCall])
      expect(result[1].toolCallId).toBe("tc-1")
      expect(result[1].toolName).toBe("read_file")
    })
  })

  describe("appendMessage", () => {
    it("calls invoke with serialized message", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      const msg = makeTestMessage({ id: "m1", content: "Test" })

      await appendMessage("ws-1", msg)

      expect(invoke).toHaveBeenCalledWith("append_message", {
        workspaceId: "ws-1",
        message: expect.objectContaining({
          id: "m1",
          content: "Test",
        }),
      })
    })
  })

  describe("MAJORDOMO_WS_ID", () => {
    it("is '__majordomo__'", () => {
      expect(MAJORDOMO_WS_ID).toBe("__majordomo__")
    })
  })

  describe("loadMajordomoMessages", () => {
    it("loads from the majordomo workspace", async () => {
      vi.mocked(invoke).mockResolvedValue([])
      await loadMajordomoMessages()
      expect(invoke).toHaveBeenCalledWith("load_messages", {
        workspaceId: "__majordomo__",
        limit: 200,
      })
    })
  })

  describe("appendMajordomoMessage", () => {
    it("appends to the majordomo workspace", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      const msg = makeTestMessage()
      await appendMajordomoMessage(msg)
      expect(invoke).toHaveBeenCalledWith("append_message", {
        workspaceId: "__majordomo__",
        message: expect.objectContaining({ id: msg.id }),
      })
    })
  })

  describe("clearMessages", () => {
    it("calls invoke with correct workspace", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      await clearMessages("ws-1")
      expect(invoke).toHaveBeenCalledWith("clear_messages", { workspaceId: "ws-1" })
    })
  })

  describe("clearMajordomoMessages", () => {
    it("clears the majordomo workspace", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      await clearMajordomoMessages()
      expect(invoke).toHaveBeenCalledWith("clear_messages", { workspaceId: "__majordomo__" })
    })
  })
})
