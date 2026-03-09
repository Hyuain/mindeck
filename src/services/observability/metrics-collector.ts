/**
 * E4.5 — Metrics Collector
 *
 * Singleton that accumulates in-memory tool-call and loop-completion metrics.
 * Writes events to ~/.mindeck/metrics/{date}.jsonl via Tauri (fire-and-forget).
 */
import { invoke } from "@tauri-apps/api/core"
import type { LoopCompletionMetric, MetricEvent, ToolCallMetric } from "@/types"
import { useMetricsStore } from "./metrics-store"

class MetricsCollector {
  recordToolCall(metric: ToolCallMetric): void {
    const event: MetricEvent = { type: "tool_call", data: metric }
    useMetricsStore.getState().addToolCall(metric)
    invoke("append_metric_event", { event }).catch(() => {})
  }

  recordLoopCompletion(metric: LoopCompletionMetric): void {
    const event: MetricEvent = { type: "loop_complete", data: metric }
    useMetricsStore.getState().addLoopCompletion(metric)
    invoke("append_metric_event", { event }).catch(() => {})
  }
}

export const metricsCollector = new MetricsCollector()
