/**
 * E4.5 — Metrics Store
 *
 * Non-persisted Zustand store for in-session observability metrics.
 */
import { create } from "zustand"
import type { LoopCompletionMetric, ToolCallMetric } from "@/types"

interface WorkspaceMetrics {
  toolCalls: ToolCallMetric[]
  loopCompletions: LoopCompletionMetric[]
}

interface MetricsState {
  /** keyed by workspaceId */
  byWorkspace: Record<string, WorkspaceMetrics>

  addToolCall(metric: ToolCallMetric): void
  addLoopCompletion(metric: LoopCompletionMetric): void
  clearWorkspace(workspaceId: string): void
}

function emptyWorkspace(): WorkspaceMetrics {
  return { toolCalls: [], loopCompletions: [] }
}

export const useMetricsStore = create<MetricsState>()((set) => ({
  byWorkspace: {},

  addToolCall(metric) {
    set((state) => {
      const existing = state.byWorkspace[metric.workspaceId] ?? emptyWorkspace()
      return {
        byWorkspace: {
          ...state.byWorkspace,
          [metric.workspaceId]: {
            ...existing,
            toolCalls: [...existing.toolCalls, metric],
          },
        },
      }
    })
  },

  addLoopCompletion(metric) {
    set((state) => {
      const existing = state.byWorkspace[metric.workspaceId] ?? emptyWorkspace()
      return {
        byWorkspace: {
          ...state.byWorkspace,
          [metric.workspaceId]: {
            ...existing,
            loopCompletions: [...existing.loopCompletions, metric],
          },
        },
      }
    })
  },

  clearWorkspace(workspaceId) {
    set((state) => {
      const next = { ...state.byWorkspace }
      delete next[workspaceId]
      return { byWorkspace: next }
    })
  },
}))
