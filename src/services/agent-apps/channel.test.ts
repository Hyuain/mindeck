import { describe, expect, it, vi } from "vitest"
import { createAppChannel } from "./channel"
import type { ChannelMessage } from "@/types"

function makeMsg(
  overrides: Partial<ChannelMessage> = {},
): ChannelMessage {
  return {
    id: "",
    type: "dispatch",
    from: "test",
    payload: { data: "hello" },
    ...overrides,
  }
}

describe("createAppChannel", () => {
  // ─── send / onMessage ────────────────────────────────────

  describe("send / onMessage delivery", () => {
    it("delivers messages from agent side to app side", () => {
      const [agent, app] = createAppChannel("test-app")
      const received: ChannelMessage[] = []

      app.onMessage((msg) => received.push(msg))
      agent.send(makeMsg({ payload: "ping" }))

      expect(received).toHaveLength(1)
      expect(received[0].payload).toBe("ping")
      expect(received[0].id).toBeTruthy()
    })

    it("delivers messages from app side to agent side", () => {
      const [agent, app] = createAppChannel("test-app")
      const received: ChannelMessage[] = []

      agent.onMessage((msg) => received.push(msg))
      app.send(makeMsg({ payload: "pong" }))

      expect(received).toHaveLength(1)
      expect(received[0].payload).toBe("pong")
    })

    it("auto-generates a UUID id on each send", () => {
      const [agent, app] = createAppChannel("test-app")
      const ids: string[] = []

      app.onMessage((msg) => ids.push(msg.id))
      agent.send(makeMsg())
      agent.send(makeMsg())

      expect(ids).toHaveLength(2)
      expect(ids[0]).not.toBe(ids[1])
      // UUID v4 format
      for (const id of ids) {
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        )
      }
    })

    it("supports multiple onMessage handlers", () => {
      const [agent, app] = createAppChannel("test-app")
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      app.onMessage(handler1)
      app.onMessage(handler2)
      agent.send(makeMsg())

      expect(handler1).toHaveBeenCalledOnce()
      expect(handler2).toHaveBeenCalledOnce()
    })

    it("does not mutate the original message", () => {
      const [agent, app] = createAppChannel("test-app")
      const original = makeMsg({ payload: { nested: true } })
      const originalId = original.id

      app.onMessage(() => {})
      agent.send(original)

      expect(original.id).toBe(originalId)
    })
  })

  // ─── request / onRequest ─────────────────────────────────

  describe("request / onRequest correlation", () => {
    it("resolves with response from peer request handler", async () => {
      const [agent, app] = createAppChannel("test-app")

      app.onRequest(async (msg) => ({
        id: "",
        type: "result" as const,
        from: "test-app",
        payload: `echo: ${msg.payload}`,
      }))

      const response = await agent.request(
        makeMsg({ payload: "question" }),
      )

      expect(response.payload).toBe("echo: question")
      expect(response.type).toBe("result")
      expect(response.replyTo).toBeTruthy()
    })

    it("stamps replyTo with the request message id", async () => {
      const [agent, app] = createAppChannel("test-app")
      let receivedId = ""

      app.onRequest(async (msg) => {
        receivedId = msg.id
        return {
          id: "",
          type: "result" as const,
          from: "test-app",
          payload: null,
        }
      })

      const response = await agent.request(makeMsg())

      expect(response.replyTo).toBe(receivedId)
    })

    it("rejects when no request handler is registered", async () => {
      const [agent] = createAppChannel("test-app")

      await expect(agent.request(makeMsg())).rejects.toThrow(
        "No request handler registered on peer",
      )
    })

    it("rejects when peer handler throws", async () => {
      const [agent, app] = createAppChannel("test-app")

      app.onRequest(async () => {
        throw new Error("handler failed")
      })

      await expect(agent.request(makeMsg())).rejects.toThrow(
        "handler failed",
      )
    })

    it("works bidirectionally (app requests agent)", async () => {
      const [agent, app] = createAppChannel("test-app")

      agent.onRequest(async (msg) => ({
        id: "",
        type: "result" as const,
        from: "workspace-agent",
        payload: `agent-echo: ${msg.payload}`,
      }))

      const response = await app.request(
        makeMsg({ from: "test-app", payload: "help" }),
      )
      expect(response.payload).toBe("agent-echo: help")
    })
  })

  // ─── AbortSignal cancellation ────────────────────────────

  describe("AbortSignal cancellation", () => {
    it("rejects with abort error when signal is aborted", async () => {
      const [agent, app] = createAppChannel("test-app")

      // Slow handler that never resolves naturally
      app.onRequest(
        () =>
          new Promise<ChannelMessage>(() => {
            // intentionally hangs
          }),
      )

      const controller = new AbortController()

      const promise = agent.request(makeMsg(), controller.signal)
      controller.abort()

      await expect(promise).rejects.toThrow("Request aborted")
    })

    it("rejects immediately when signal is already aborted", async () => {
      const [agent, app] = createAppChannel("test-app")

      app.onRequest(async (msg) => ({
        id: "",
        type: "result" as const,
        from: "test-app",
        payload: msg.payload,
      }))

      const controller = new AbortController()
      controller.abort()

      await expect(
        agent.request(makeMsg(), controller.signal),
      ).rejects.toThrow("Request aborted")
    })
  })

  // ─── close lifecycle ─────────────────────────────────────

  describe("close removes all listeners", () => {
    it("silently drops send() after close", () => {
      const [agent, app] = createAppChannel("test-app")
      const handler = vi.fn()

      app.onMessage(handler)
      agent.close()
      agent.send(makeMsg())

      expect(handler).not.toHaveBeenCalled()
    })

    it("rejects request() after close", async () => {
      const [agent, app] = createAppChannel("test-app")

      app.onRequest(async (msg) => ({
        id: "",
        type: "result" as const,
        from: "test-app",
        payload: msg.payload,
      }))

      agent.close()

      await expect(agent.request(makeMsg())).rejects.toThrow(
        "Channel is closed",
      )
    })

    it("rejects pending requests when close is called", async () => {
      const [agent, app] = createAppChannel("test-app")

      app.onRequest(
        () =>
          new Promise<ChannelMessage>(() => {
            // intentionally hangs
          }),
      )

      const promise = agent.request(makeMsg())
      agent.close()

      await expect(promise).rejects.toThrow("Channel closed")
    })

    it("silently drops send on the peer side when peer is closed", () => {
      const [agent, app] = createAppChannel("test-app")
      const handler = vi.fn()

      agent.onMessage(handler)
      app.close()

      // Agent tries to send to closed app — app's handlers are gone,
      // but agent side also checks peer.closed
      agent.send(makeMsg())
      expect(handler).not.toHaveBeenCalled()
    })

    it("does not register new handlers after close", () => {
      const [agent, app] = createAppChannel("test-app")
      const handler = vi.fn()

      app.close()
      app.onMessage(handler)

      agent.send(makeMsg())
      expect(handler).not.toHaveBeenCalled()
    })
  })
})
