import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Task, TaskStatus } from "@/types"

const MAX_TASKS_PER_WORKSPACE = 30

const NON_TERMINAL_STATUSES: TaskStatus[] = ["pending", "received", "processing"]

interface TaskState {
  tasks: Task[]

  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  retryTask: (id: string) => void
  removeTask: (id: string) => void

  getTasksForWorkspace: (workspaceId: string) => Task[]
  getPendingForWorkspace: (workspaceId: string) => Task[]

  /** Trim completed/failed tasks beyond MAX_TASKS_PER_WORKSPACE for a given workspace */
  pruneWorkspace: (workspaceId: string) => void
  deleteWorkspaceTasks: (workspaceId: string) => void
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],

      addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),

      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
          ),
        })),

      retryTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id && t.attempts < t.maxAttempts
              ? {
                  ...t,
                  status: "pending" as TaskStatus,
                  attempts: t.attempts + 1,
                  updatedAt: Date.now(),
                  error: undefined,
                  result: undefined,
                }
              : t
          ),
        })),

      removeTask: (id) =>
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

      getTasksForWorkspace: (workspaceId) =>
        get()
          .tasks.filter((t) => t.workspaceId === workspaceId)
          .sort((a, b) => b.createdAt - a.createdAt),

      getPendingForWorkspace: (workspaceId) =>
        get().tasks.filter(
          (t) => t.workspaceId === workspaceId && t.status === "pending"
        ),

      pruneWorkspace: (workspaceId) =>
        set((state) => {
          const wsTasks = state.tasks.filter((t) => t.workspaceId === workspaceId)
          const otherTasks = state.tasks.filter((t) => t.workspaceId !== workspaceId)
          const sorted = [...wsTasks].sort((a, b) => b.createdAt - a.createdAt)
          return { tasks: [...otherTasks, ...sorted.slice(0, MAX_TASKS_PER_WORKSPACE)] }
        }),

      deleteWorkspaceTasks: (workspaceId) =>
        set((state) => ({
          tasks: state.tasks.filter((t) => t.workspaceId !== workspaceId),
        })),
    }),
    {
      name: "mindeck-tasks",
      // On rehydrate: mark ALL non-terminal tasks as "failed" so they
      // don't silently re-run on restart and generate unexpected messages.
      // The user can manually retry via the UI if desired.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.tasks = state.tasks.map((t) =>
          NON_TERMINAL_STATUSES.includes(t.status)
            ? {
                ...t,
                status: "failed" as TaskStatus,
                error: "Interrupted (app restarted)",
              }
            : t
        )
      },
    }
  )
)
