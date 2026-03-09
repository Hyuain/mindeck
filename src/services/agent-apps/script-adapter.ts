/**
 * E4.8 — Script Adapter
 *
 * Discovers *.ts files in ~/.mindeck/scripts/ and loads them as Agent Apps
 * by calling their `activate(ctx)` export.
 *
 * NOTE: Dynamic import of TypeScript files only works if the Tauri webview
 * has `file://` access and the files are pre-compiled. For the initial cut
 * we provide the infrastructure; real transpilation requires a bundler step.
 * The adapter exposes the context API and discovery mechanism.
 */
import { invoke } from "@tauri-apps/api/core"
import { createLogger } from "@/services/logger"
import { executeTool } from "@/services/tools/registry"
import { eventBus } from "@/services/event-bus"
import type { ScriptAgentApp, ScriptAgentAppContext } from "@/types"

const log = createLogger("ScriptAdapter")

/** Track active script cleanups per workspace */
const activeCleanups = new Map<string, Array<() => void>>()

/**
 * Discover *.ts scripts in ~/.mindeck/scripts/.
 */
export async function discoverScripts(): Promise<ScriptAgentApp[]> {
  try {
    const paths = await invoke<string[]>("list_scripts")
    return paths.map((filePath) => {
      const fileName = filePath.split("/").pop() ?? filePath
      const name = fileName.replace(/\.ts$/, "")
      return {
        id: `script:${name}`,
        name,
        filePath,
        active: true,
      }
    })
  } catch (err) {
    log.warn("Failed to discover scripts", err)
    return []
  }
}

/**
 * Build a ScriptAgentAppContext bound to a specific workspace.
 * Returns both the context and a cleanup function.
 */
function makeContext(
  workspaceId: string,
  onLog: (msg: string) => void
): { ctx: ScriptAgentAppContext; cleanup: () => void } {
  const unsubscribers: Array<() => void> = []

  const ctx: ScriptAgentAppContext = {
    workspaceId,

    async executeTool(name, args) {
      return executeTool(name, args)
    },

    log(msg) {
      log.info(`[script][${workspaceId}] ${msg}`)
      onLog(msg)
    },

    onFileWritten(pattern, handler) {
      const unsub = eventBus.on("file:written", (ev) => {
        if (ev.workspaceId !== workspaceId && ev.workspaceId !== "__any__") return
        // Basic glob: only support ** prefix (everything) or exact suffix match
        const matches =
          pattern === "**" ||
          pattern.startsWith("**") ||
          ev.filePath.endsWith(pattern.replace(/^\*\*\//, ""))
        if (matches) {
          handler(ev.filePath).catch((err: unknown) =>
            log.warn("Script onFileWritten handler error", err)
          )
        }
      })
      unsubscribers.push(unsub)
    },
  }

  return {
    ctx,
    cleanup: () => {
      for (const unsub of unsubscribers) unsub()
      unsubscribers.length = 0
    },
  }
}

/**
 * Connect all discovered scripts to a workspace.
 * Calls `activate(ctx)` on each script module if it exports one.
 *
 * IMPORTANT: Dynamic import of raw .ts files requires a transpiler.
 * In Tauri's webview, this works for pre-built .js files. For the initial
 * cut, we attempt the import and log errors gracefully.
 */
export async function connectScriptsToWorkspace(
  workspaceId: string,
  onLog: (msg: string) => void = () => {}
): Promise<void> {
  // Clean up any existing scripts for this workspace
  disconnectScriptsFromWorkspace(workspaceId)

  const scripts = await discoverScripts()
  if (scripts.length === 0) return

  const cleanups: Array<() => void> = []

  for (const script of scripts) {
    try {
      // Attempt dynamic import — works if Tauri has file:// access
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import(/* @vite-ignore */ script.filePath) as any
      if (typeof mod?.activate !== "function") {
        log.debug("Script has no activate() export — skipping", { name: script.name })
        continue
      }

      const { ctx, cleanup } = makeContext(workspaceId, onLog)
      cleanups.push(cleanup)

      await mod.activate(ctx)
      log.info("Script activated", { name: script.name, workspaceId })
    } catch (err) {
      log.warn("Failed to load/activate script", { name: script.name, err })
    }
  }

  activeCleanups.set(workspaceId, cleanups)
}

/**
 * Disconnect all scripts from a workspace (calls cleanup functions).
 */
export function disconnectScriptsFromWorkspace(workspaceId: string): void {
  const cleanups = activeCleanups.get(workspaceId)
  if (cleanups) {
    for (const cleanup of cleanups) cleanup()
    activeCleanups.delete(workspaceId)
  }
}
