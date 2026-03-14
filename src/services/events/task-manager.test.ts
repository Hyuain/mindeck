import { describe, it, expect, vi, beforeEach } from "vitest"
import { createTask, updateTaskStatus, retryTask, recoverPendingTasks } from "./task-manager"
import { useTaskStore } from "@/stores/tasks"
import { useWorkspaceStore } from "@/stores/workspace"
import { eventBus } from "./event-bus"
import { makeTestWorkspace, makeTestTask } from "@/test/factories"

// Mock the event-queue module to avoid side effects
vi.mock("./event-queue", () => ({
  enqueueTaskDispatch: vi.fn().mockResolvedValue(undefined),
}))

describe("task-manager", () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [] })
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: null })
  })

  describe("createTask", () => {
    it("creates a task and adds it to the store", () => {
      const ws = makeTestWorkspace({ id: "ws-1", name: "My WS" })
      useWorkspaceStore.setState({ workspaces: [ws] })

      const task = createTask("ws-1", "Do something")
      expect(task.workspaceId).toBe("ws-1")
      expect(task.workspaceName).toBe("My WS")
      expect(task.content).toBe("Do something")
      expect(task.status).toBe("pending")
      expect(task.attempts).toBe(1)
      expect(task.maxAttempts).toBe(3)

      const stored = useTaskStore.getState().tasks
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toBe(task.id)
    })

    it("uses workspaceId as name when workspace not found", () => {
      const task = createTask("unknown-ws", "Do it")
      expect(task.workspaceName).toBe("unknown-ws")
    })

    it("defaults sourceType to 'majordomo'", () => {
      const task = createTask("ws-1", "Task")
      expect(task.sourceType).toBe("majordomo")
    })

    it("accepts custom sourceType", () => {
      const task = createTask("ws-1", "Task", "sub-agent")
      expect(task.sourceType).toBe("sub-agent")
    })
  })

  describe("updateTaskStatus", () => {
    it("updates status in the store", () => {
      const task = makeTestTask({ id: "t1" })
      useTaskStore.setState({ tasks: [task] })

      updateTaskStatus("t1", "processing")
      const updated = useTaskStore.getState().tasks[0]
      expect(updated.status).toBe("processing")
    })

    it("attaches result text on completion", () => {
      const task = makeTestTask({ id: "t1" })
      useTaskStore.setState({ tasks: [task] })

      updateTaskStatus("t1", "completed", { result: "Done!" })
      const updated = useTaskStore.getState().tasks[0]
      expect(updated.result).toBe("Done!")
    })

    it("no-ops for unknown task IDs", () => {
      expect(() => updateTaskStatus("nonexistent", "completed")).not.toThrow()
    })
  })

  describe("retryTask", () => {
    it("increments attempts and resets to pending", () => {
      const task = makeTestTask({ id: "t1", status: "failed", attempts: 1 })
      useTaskStore.setState({ tasks: [task] })

      const emitSpy = vi.spyOn(eventBus, "emit")
      retryTask("t1")

      const updated = useTaskStore.getState().tasks[0]
      expect(updated.status).toBe("pending")
      expect(updated.attempts).toBe(2)
      expect(emitSpy).toHaveBeenCalledWith("task:dispatch", expect.objectContaining({
        id: "t1",
        targetWorkspaceId: task.workspaceId,
      }))
      emitSpy.mockRestore()
    })

    it("does not retry when max attempts reached", () => {
      const task = makeTestTask({ id: "t1", attempts: 3, maxAttempts: 3 })
      useTaskStore.setState({ tasks: [task] })

      retryTask("t1")
      const updated = useTaskStore.getState().tasks[0]
      expect(updated.attempts).toBe(3) // unchanged
    })

    it("does not retry unknown tasks", () => {
      expect(() => retryTask("nonexistent")).not.toThrow()
    })
  })

  describe("recoverPendingTasks", () => {
    it("returns pending tasks for a workspace", () => {
      const tasks = [
        makeTestTask({ id: "t1", workspaceId: "ws-1", status: "pending" }),
        makeTestTask({ id: "t2", workspaceId: "ws-1", status: "completed" }),
        makeTestTask({ id: "t3", workspaceId: "ws-2", status: "pending" }),
      ]
      useTaskStore.setState({ tasks })

      const recovered = recoverPendingTasks("ws-1")
      expect(recovered).toHaveLength(1)
      expect(recovered[0].id).toBe("t1")
    })

    it("returns empty array when no pending tasks", () => {
      expect(recoverPendingTasks("ws-1")).toEqual([])
    })
  })
})
