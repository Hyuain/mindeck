/**
 * Native Agent App runner (H3.3).
 * Dispatches to built-in implementations by component name.
 */
import { invoke } from "@tauri-apps/api/core"
import { createLogger } from "@/services/logger"
import type { AgentAppManifest } from "@/types"

const log = createLogger("NativeAppRunner")
const OUTPUT_MAX_CHARS = 3000

export async function runNativeApp(
  app: AgentAppManifest,
  workspaceRoot: string
): Promise<string> {
  if (!app.nativeComponent) {
    throw new Error(`runNativeApp called on non-native app: ${app.id}`)
  }

  const component = app.nativeComponent
  log.debug("running native app", { component, workspaceRoot })

  let command: string
  switch (component) {
    case "EslintRunner":
      command = "pnpm eslint --format compact ."
      break
    case "TscRunner":
      command = "pnpm tsc --noEmit 2>&1"
      break
    case "TestRunner":
      command = "pnpm test --run 2>&1 | tail -50"
      break
    default:
      throw new Error(`Unknown native app component: ${component}`)
  }

  try {
    const output = await invoke<string>("bash_exec", {
      command,
      cwd: workspaceRoot,
    })
    const result = typeof output === "string" ? output : JSON.stringify(output)
    return result.slice(0, OUTPUT_MAX_CHARS)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn("native app execution failed", { component, error: msg })
    return `[${app.name} error]: ${msg}`.slice(0, OUTPUT_MAX_CHARS)
  }
}
