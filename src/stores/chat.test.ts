import { describe, it, expect, beforeEach } from "vitest"
import { useChatStore } from "./chat"
import { makeTestMessage } from "@/test/factories"

describe("useChatStore", () => {
  beforeEach(() => {
    useChatStore.setState({ messages: {}, streaming: {} })
  })

  describe("setMessages", () => {
    it("sets messages for a workspace", () => {
      const msgs = [makeTestMessage({ content: "Hello" })]
      useChatStore.getState().setMessages("ws-1", msgs)
      expect(useChatStore.getState().messages["ws-1"]).toHaveLength(1)
    })

    it("replaces existing messages", () => {
      useChatStore.getState().setMessages("ws-1", [makeTestMessage()])
      useChatStore.getState().setMessages("ws-1", [makeTestMessage(), makeTestMessage()])
      expect(useChatStore.getState().messages["ws-1"]).toHaveLength(2)
    })
  })

  describe("appendMessage", () => {
    it("appends to existing messages", () => {
      useChatStore.getState().setMessages("ws-1", [makeTestMessage()])
      useChatStore.getState().appendMessage("ws-1", makeTestMessage({ content: "New" }))
      expect(useChatStore.getState().messages["ws-1"]).toHaveLength(2)
    })

    it("creates array for new workspace", () => {
      useChatStore.getState().appendMessage("new-ws", makeTestMessage())
      expect(useChatStore.getState().messages["new-ws"]).toHaveLength(1)
    })
  })

  describe("removeDraftIfEmpty", () => {
    it("removes last message if it is an empty assistant draft", () => {
      useChatStore.getState().setMessages("ws-1", [
        makeTestMessage({ role: "user", content: "Hi" }),
        makeTestMessage({ role: "assistant", content: "" }),
      ])
      useChatStore.getState().removeDraftIfEmpty("ws-1")
      expect(useChatStore.getState().messages["ws-1"]).toHaveLength(1)
    })

    it("does not remove if last message has content", () => {
      useChatStore.getState().setMessages("ws-1", [
        makeTestMessage({ role: "assistant", content: "Hello!" }),
      ])
      useChatStore.getState().removeDraftIfEmpty("ws-1")
      expect(useChatStore.getState().messages["ws-1"]).toHaveLength(1)
    })

    it("does not remove if last message is not assistant", () => {
      useChatStore.getState().setMessages("ws-1", [
        makeTestMessage({ role: "user", content: "" }),
      ])
      useChatStore.getState().removeDraftIfEmpty("ws-1")
      expect(useChatStore.getState().messages["ws-1"]).toHaveLength(1)
    })

    it("no-ops for empty message array", () => {
      useChatStore.getState().setMessages("ws-1", [])
      useChatStore.getState().removeDraftIfEmpty("ws-1")
      expect(useChatStore.getState().messages["ws-1"]).toHaveLength(0)
    })
  })

  describe("updateLastMessage", () => {
    it("updates the last message with patch", () => {
      useChatStore.getState().setMessages("ws-1", [
        makeTestMessage({ content: "Old" }),
      ])
      useChatStore.getState().updateLastMessage("ws-1", { content: "New" })
      expect(useChatStore.getState().messages["ws-1"][0].content).toBe("New")
    })

    it("no-ops for empty message array", () => {
      useChatStore.getState().setMessages("ws-1", [])
      useChatStore.getState().updateLastMessage("ws-1", { content: "X" })
      expect(useChatStore.getState().messages["ws-1"]).toHaveLength(0)
    })
  })

  describe("setStreaming", () => {
    it("sets streaming state for a workspace", () => {
      useChatStore.getState().setStreaming("ws-1", true)
      expect(useChatStore.getState().streaming["ws-1"]).toBe(true)
    })
  })

  describe("clearMessages", () => {
    it("clears messages for a workspace", () => {
      useChatStore.getState().setMessages("ws-1", [makeTestMessage()])
      useChatStore.getState().clearMessages("ws-1")
      expect(useChatStore.getState().messages["ws-1"]).toHaveLength(0)
    })
  })

  describe("deleteWorkspaceData", () => {
    it("removes all data for a workspace", () => {
      useChatStore.getState().setMessages("ws-1", [makeTestMessage()])
      useChatStore.getState().setStreaming("ws-1", true)
      useChatStore.getState().deleteWorkspaceData("ws-1")
      expect(useChatStore.getState().messages["ws-1"]).toBeUndefined()
      expect(useChatStore.getState().streaming["ws-1"]).toBeUndefined()
    })

    it("does not affect other workspaces", () => {
      useChatStore.getState().setMessages("ws-1", [makeTestMessage()])
      useChatStore.getState().setMessages("ws-2", [makeTestMessage()])
      useChatStore.getState().deleteWorkspaceData("ws-1")
      expect(useChatStore.getState().messages["ws-2"]).toHaveLength(1)
    })
  })

  describe("per-workspace isolation", () => {
    it("messages in one workspace do not affect another", () => {
      useChatStore.getState().appendMessage("ws-1", makeTestMessage({ content: "A" }))
      useChatStore.getState().appendMessage("ws-2", makeTestMessage({ content: "B" }))
      expect(useChatStore.getState().messages["ws-1"][0].content).toBe("A")
      expect(useChatStore.getState().messages["ws-2"][0].content).toBe("B")
    })
  })
})
