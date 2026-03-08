/**
 * Harness Engine (H3.1) — Triggers + Feedback Routing
 *
 * Listens for events (file:written, tool:completed, task:completed) and
 * runs the relevant Agent Apps when their trigger conditions are met.
 * Feeds results back to the active WorkspaceAgent via injectHarnessFeedback().
 */
import { eventBus } from "./event-bus"
import { runNativeApp } from "./native-apps/runner"
import { createLogger } from "./logger"
import type { AgentAppManifest } from "@/types"

const log = createLogger("HarnessEngine")

// Minimatch-style glob matching (simple implementation without extra deps)
function matchGlob(pattern: string, path: string): boolean {
  // Convert glob pattern to regex: ** = any path segment(s), * = any chars except /
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex special chars (not * or ?)
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__DOUBLE_STAR__/g, ".*")
    .replace(/\?/g, "[^/]")
    // Handle {ts,tsx} brace expansion
    .replace(/\{([^}]+)\}/g, (_, group: string) => `(${group.split(",").join("|")})`)
  try {
    return new RegExp(`^${regexStr}$`).test(path)
  } catch {
    return false
  }
}

export interface HarnessContext {
  workspaceRoot: string
}

/** Minimal interface to avoid circular import with WorkspaceAgent */
export interface AgentFeedbackTarget {
  injectHarnessFeedback(appName: string, result: string): void
}

class HarnessEngine {
  private unsubscribers: Map<string, Array<() => void>> = new Map()

  /**
   * Start the harness for a workspace.
   * Registers event listeners that fire the relevant apps.
   */
  start(
    workspaceId: string,
    apps: AgentAppManifest[],
    context: HarnessContext,
    agent: AgentFeedbackTarget
  ): void {
    this.stop(workspaceId)

    const unsubs: Array<() => void> = []
    const harnessApps = apps.filter((a) => a.harness && a.harness.triggers.length > 0)

    if (harnessApps.length === 0) return

    // ── file:written ──────────────────────────────────────────
    const fileWrittenApps = harnessApps.filter((a) =>
      a.harness!.triggers.some((t) => t.event === "file_written")
    )
    if (fileWrittenApps.length > 0) {
      const unsub = eventBus.on("file:written", (ev) => {
        // Only fire for the matching workspace — or the broadcast "__any__" from builtins
        if (ev.workspaceId !== workspaceId && ev.workspaceId !== "__any__") return

        for (const app of fileWrittenApps) {
          const matchingTriggers = app.harness!.triggers.filter(
            (t) => t.event === "file_written" && (!t.pattern || matchGlob(t.pattern, ev.filePath))
          )
          if (matchingTriggers.length > 0) {
            this.runApp(app, context, agent, workspaceId).catch((err: unknown) =>
              log.warn("harness app failed", { app: app.id, err })
            )
          }
        }
      })
      unsubs.push(unsub)
    }

    // ── tool:completed ────────────────────────────────────────
    const toolCompletedApps = harnessApps.filter((a) =>
      a.harness!.triggers.some((t) => t.event === "tool_completed")
    )
    if (toolCompletedApps.length > 0) {
      const unsub = eventBus.on("tool:completed", (ev) => {
        if (ev.workspaceId !== workspaceId) return

        for (const app of toolCompletedApps) {
          const matchingTriggers = app.harness!.triggers.filter(
            (t) =>
              t.event === "tool_completed" && (!t.toolName || t.toolName === ev.toolName)
          )
          if (matchingTriggers.length > 0) {
            this.runApp(app, context, agent, workspaceId).catch((err: unknown) =>
              log.warn("harness app failed", { app: app.id, err })
            )
          }
        }
      })
      unsubs.push(unsub)
    }

    // ── task:completed ────────────────────────────────────────
    const taskCompletedApps = harnessApps.filter((a) =>
      a.harness!.triggers.some((t) => t.event === "task_completed")
    )
    if (taskCompletedApps.length > 0) {
      const unsub = eventBus.on("task:result", (ev) => {
        if (ev.workspaceId !== workspaceId) return

        for (const app of taskCompletedApps) {
          this.runApp(app, context, agent, workspaceId).catch((err: unknown) =>
            log.warn("harness app failed", { app: app.id, err })
          )
        }
      })
      unsubs.push(unsub)
    }

    this.unsubscribers.set(workspaceId, unsubs)
    log.debug("harness started", {
      workspaceId,
      apps: harnessApps.map((a) => a.id),
    })
  }

  /** Stop all listeners for a workspace */
  stop(workspaceId: string): void {
    const unsubs = this.unsubscribers.get(workspaceId)
    if (unsubs) {
      for (const unsub of unsubs) unsub()
      this.unsubscribers.delete(workspaceId)
    }
  }

  private async runApp(
    app: AgentAppManifest,
    context: HarnessContext,
    agent: AgentFeedbackTarget,
    workspaceId: string
  ): Promise<void> {
    log.debug("running harness app", { app: app.id })

    let result: string
    if (app.source.type === "native") {
      result = await runNativeApp(app, context.workspaceRoot)
    } else {
      // MCP apps: not yet implemented in harness — placeholder
      result = `[Harness: ${app.name}] MCP app execution not yet supported in harness context.`
    }

    // Emit harness:feedback event for observability
    eventBus.emit("harness:feedback", {
      workspaceId,
      appName: app.name,
      result,
    })

    // Feed result back to the agent if configured
    if (app.harness?.feedbackToAgent) {
      agent.injectHarnessFeedback(app.name, result)
    }
  }
}

export const harnessEngine = new HarnessEngine()
