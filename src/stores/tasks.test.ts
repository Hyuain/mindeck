import { describe, it, expect, beforeEach } from "vitest"
import { useTaskStore } from "./tasks"
import { makeTestTask } from "@/test/factories"

describe("useTaskStore", () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [] })
  })

  describe("addTask", () => {
    it("adds a task to the front of the list", () => {
      const t1 = makeTestTask({ id: "t1" })
      const t2 = makeTestTask({ id: "t2" })
      useTaskStore.getState().addTask(t1)
      useTaskStore.getState().addTask(t2)
      expect(useTaskStore.getState().tasks[0].id).toBe("t2")
      expect(useTaskStore.getState().tasks[1].id).toBe("t1")
    })
  })

  describe("updateTask", () => {
    it("updates task fields by id", () => {
      useTaskStore.getState().addTask(makeTestTask({ id: "t1", status: "pending" }))
      useTaskStore.getState().updateTask("t1", { status: "processing" })
      expect(useTaskStore.getState().tasks[0].status).toBe("processing")
    })

    it("updates the updatedAt timestamp", () => {
      useTaskStore.getState().addTask(makeTestTask({ id: "t1", updatedAt: 0 }))
      useTaskStore.getState().updateTask("t1", { status: "completed" })
      expect(useTaskStore.getState().tasks[0].updatedAt).toBeGreaterThan(0)
    })
  })

  describe("retryTask", () => {
    it("increments attempts and resets to pending", () => {
      useTaskStore.getState().addTask(
        makeTestTask({ id: "t1", status: "failed", attempts: 1, maxAttempts: 3 })
      )
      useTaskStore.getState().retryTask("t1")
      const task = useTaskStore.getState().tasks[0]
      expect(task.status).toBe("pending")
      expect(task.attempts).toBe(2)
      expect(task.error).toBeUndefined()
      expect(task.result).toBeUndefined()
    })

    it("does not retry when at max attempts", () => {
      useTaskStore.getState().addTask(
        makeTestTask({ id: "t1", attempts: 3, maxAttempts: 3 })
      )
      useTaskStore.getState().retryTask("t1")
      expect(useTaskStore.getState().tasks[0].attempts).toBe(3)
    })
  })

  describe("removeTask", () => {
    it("removes a task by id", () => {
      useTaskStore.getState().addTask(makeTestTask({ id: "t1" }))
      useTaskStore.getState().removeTask("t1")
      expect(useTaskStore.getState().tasks).toHaveLength(0)
    })
  })

  describe("getTasksForWorkspace", () => {
    it("returns tasks for a specific workspace sorted by createdAt desc", () => {
      useTaskStore.getState().addTask(makeTestTask({ id: "t1", workspaceId: "ws-1", createdAt: 100 }))
      useTaskStore.getState().addTask(makeTestTask({ id: "t2", workspaceId: "ws-1", createdAt: 200 }))
      useTaskStore.getState().addTask(makeTestTask({ id: "t3", workspaceId: "ws-2", createdAt: 300 }))

      const tasks = useTaskStore.getState().getTasksForWorkspace("ws-1")
      expect(tasks).toHaveLength(2)
      expect(tasks[0].id).toBe("t2") // newer first
    })
  })

  describe("getPendingForWorkspace", () => {
    it("returns only pending tasks for a workspace", () => {
      useTaskStore.getState().addTask(makeTestTask({ id: "t1", workspaceId: "ws-1", status: "pending" }))
      useTaskStore.getState().addTask(makeTestTask({ id: "t2", workspaceId: "ws-1", status: "completed" }))

      const pending = useTaskStore.getState().getPendingForWorkspace("ws-1")
      expect(pending).toHaveLength(1)
      expect(pending[0].id).toBe("t1")
    })
  })

  describe("pruneWorkspace", () => {
    it("keeps at most 30 tasks per workspace", () => {
      const tasks = Array.from({ length: 35 }, (_, i) =>
        makeTestTask({ id: `t${i}`, workspaceId: "ws-1", createdAt: i })
      )
      useTaskStore.setState({ tasks })
      useTaskStore.getState().pruneWorkspace("ws-1")
      const remaining = useTaskStore.getState().tasks.filter((t) => t.workspaceId === "ws-1")
      expect(remaining.length).toBeLessThanOrEqual(30)
    })

    it("does not affect tasks from other workspaces", () => {
      useTaskStore.setState({
        tasks: [
          makeTestTask({ id: "t1", workspaceId: "ws-1" }),
          makeTestTask({ id: "t2", workspaceId: "ws-2" }),
        ],
      })
      useTaskStore.getState().pruneWorkspace("ws-1")
      expect(useTaskStore.getState().tasks.find((t) => t.id === "t2")).toBeDefined()
    })
  })

  describe("deleteWorkspaceTasks", () => {
    it("removes all tasks for a workspace", () => {
      useTaskStore.setState({
        tasks: [
          makeTestTask({ id: "t1", workspaceId: "ws-1" }),
          makeTestTask({ id: "t2", workspaceId: "ws-2" }),
        ],
      })
      useTaskStore.getState().deleteWorkspaceTasks("ws-1")
      expect(useTaskStore.getState().tasks).toHaveLength(1)
      expect(useTaskStore.getState().tasks[0].workspaceId).toBe("ws-2")
    })
  })
})
