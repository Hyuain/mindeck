import { describe, it, expect, vi, beforeEach } from "vitest"

// We need a fresh EventBus per test, but the module exports a singleton.
// We'll test the singleton behavior and use the module directly.

describe("eventBus", () => {
  // Re-import fresh each time isn't practical with a singleton,
  // so we test the public API and clean up listeners manually.

  let eventBus: typeof import("./event-bus")["eventBus"]

  beforeEach(async () => {
    // Dynamic import to get the singleton
    const mod = await import("./event-bus")
    eventBus = mod.eventBus
  })

  it("calls listener on emit", () => {
    const listener = vi.fn()
    const unsub = eventBus.on("task:dispatch", listener)

    const event = {
      id: "t1",
      sourceType: "majordomo" as const,
      targetWorkspaceId: "ws1",
      task: "do something",
    }
    eventBus.emit("task:dispatch", event)

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(event)
    unsub()
  })

  it("does not call listener after unsubscribe via returned function", () => {
    const listener = vi.fn()
    const unsub = eventBus.on("task:dispatch", listener)
    unsub()

    eventBus.emit("task:dispatch", {
      id: "t1",
      sourceType: "majordomo",
      targetWorkspaceId: "ws1",
      task: "do something",
    })

    expect(listener).not.toHaveBeenCalled()
  })

  it("does not call listener after off()", () => {
    const listener = vi.fn()
    eventBus.on("task:dispatch", listener)
    eventBus.off("task:dispatch", listener)

    eventBus.emit("task:dispatch", {
      id: "t1",
      sourceType: "majordomo",
      targetWorkspaceId: "ws1",
      task: "do something",
    })

    expect(listener).not.toHaveBeenCalled()
  })

  it("once() fires listener only once", () => {
    const listener = vi.fn()
    eventBus.once("task:result", listener)

    const event = {
      dispatchId: "d1",
      workspaceId: "ws1",
      result: "done",
      summary: "ok",
    }
    eventBus.emit("task:result", event)
    eventBus.emit("task:result", event)

    expect(listener).toHaveBeenCalledOnce()
  })

  it("supports multiple listeners on same event", () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    const unsub1 = eventBus.on("task:status", listener1)
    const unsub2 = eventBus.on("task:status", listener2)

    const event = {
      dispatchId: "d1",
      workspaceId: "ws1",
      status: "processing" as const,
    }
    eventBus.emit("task:status", event)

    expect(listener1).toHaveBeenCalledOnce()
    expect(listener2).toHaveBeenCalledOnce()
    unsub1()
    unsub2()
  })

  it("does not throw when emitting event with no listeners", () => {
    expect(() =>
      eventBus.emit("workspace:deleted", { workspaceId: "ws1" })
    ).not.toThrow()
  })

  it("catches synchronous errors in listeners", () => {
    const badListener = vi.fn(() => {
      throw new Error("boom")
    })
    const goodListener = vi.fn()
    const unsub1 = eventBus.on("file:written", badListener)
    const unsub2 = eventBus.on("file:written", goodListener)

    // Should not throw
    expect(() =>
      eventBus.emit("file:written", { workspaceId: "ws1", filePath: "/test" })
    ).not.toThrow()

    // Good listener still runs
    expect(goodListener).toHaveBeenCalledOnce()
    unsub1()
    unsub2()
  })
})
