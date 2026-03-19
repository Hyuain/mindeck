/**
 * AgentAppRuntime — lifecycle management, dispatch, and trigger routing
 * for registered Agent Apps within a workspace.
 */
import type {
  AgentApp,
  AgentAppManifest,
  AppChannel,
  AppHealth,
  HarnessTrigger,
  TriggerPayload,
} from "@/types"
import { createAppChannel } from "./channel"
import { buildAppContext } from "./context-factory"
import { createLogger } from "@/services/logger"

const log = createLogger("AgentAppRuntime")

export interface RuntimeConfig {
  providerId: string
  providerType: string
  modelId: string
  workspaceRoot: string
}

interface ActiveApp {
  manifest: AgentAppManifest
  app: AgentApp
  health: AppHealth
  agentChannel: AppChannel
  appChannel: AppChannel
}

export class AgentAppRuntime {
  private readonly apps = new Map<string, ActiveApp>()
  private readonly registry = new Map<string, AgentApp>()
  private workspaceId = ""
  private config: RuntimeConfig | null = null

  registerApp(manifest: AgentAppManifest, app: AgentApp): void {
    this.registry.set(manifest.id, app)
  }

  async start(
    workspaceId: string,
    manifests: readonly AgentAppManifest[],
    config: RuntimeConfig
  ): Promise<void> {
    this.workspaceId = workspaceId
    this.config = config

    for (const manifest of manifests) {
      const app = this.registry.get(manifest.id)
      if (!app) continue

      const [agentChannel, appChannel] = createAppChannel(manifest.id)
      const health: AppHealth = {
        appId: manifest.id,
        status: "inactive",
        errorCount: 0,
        totalDispatches: 0,
      }

      this.apps.set(manifest.id, { manifest, app, health, agentChannel, appChannel })

      // Eager activation for non-lazy apps
      if (
        manifest.lifecycle.startup !== "lazy" &&
        manifest.lifecycle.startup !== "on-trigger"
      ) {
        await this.activateApp(manifest.id)
      }
    }
  }

  async dispatch(appId: string, task: unknown): Promise<unknown> {
    const entry = this.apps.get(appId)
    if (!entry) throw new Error(`App not found: ${appId}`)

    if (entry.health.status === "error") {
      throw new Error(`App ${appId} is in error state`)
    }

    // Lazy activation
    if (entry.health.status === "inactive") {
      await this.activateApp(appId)
    }

    if (!entry.app.handleDispatch) {
      throw new Error(`App ${appId} does not support dispatch`)
    }

    const start = Date.now()
    entry.health = { ...entry.health, totalDispatches: entry.health.totalDispatches + 1 }

    try {
      const result = await entry.app.handleDispatch(task)
      entry.health = {
        ...entry.health,
        lastDispatch: {
          timestamp: new Date().toISOString(),
          success: true,
          durationMs: Date.now() - start,
        },
      }
      return result
    } catch (err) {
      entry.health = {
        ...entry.health,
        errorCount: entry.health.errorCount + 1,
        lastDispatch: {
          timestamp: new Date().toISOString(),
          success: false,
          durationMs: Date.now() - start,
        },
      }
      throw err
    }
  }

  async trigger(
    appId: string,
    event: HarnessTrigger,
    payload: TriggerPayload
  ): Promise<void> {
    const entry = this.apps.get(appId)
    if (!entry) return

    if (entry.health.status === "error") return

    // Lazy activation
    if (entry.health.status === "inactive") {
      await this.activateApp(appId)
    }

    if (entry.health.status !== "active") return
    if (!entry.app.handleTrigger) return

    try {
      await entry.app.handleTrigger(event, payload)
    } catch (err) {
      entry.health = { ...entry.health, errorCount: entry.health.errorCount + 1 }
      log.warn("App trigger failed", {
        appId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  getAppHealth(appId: string): AppHealth | undefined {
    return this.apps.get(appId)?.health
  }

  getAgentChannel(appId: string): AppChannel | undefined {
    return this.apps.get(appId)?.agentChannel
  }

  async stop(): Promise<void> {
    for (const [appId, entry] of this.apps) {
      try {
        if (entry.app.deactivate && entry.health.status === "active") {
          await entry.app.deactivate()
        }
        entry.agentChannel.close()
        entry.health = { ...entry.health, status: "inactive" }
      } catch (err) {
        log.warn("App deactivation failed", {
          appId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    this.apps.clear()
  }

  // ─── Private ─────────────────────────────────────────────

  private async activateApp(appId: string): Promise<void> {
    const entry = this.apps.get(appId)
    if (!entry || !this.config) return

    entry.health = { ...entry.health, status: "activating" }

    try {
      const ctx = buildAppContext({
        appId,
        workspaceId: this.workspaceId,
        workspaceRoot: this.config.workspaceRoot,
        providerId: this.config.providerId,
        providerType: this.config.providerType,
        modelId: this.config.modelId,
        capabilities: entry.manifest.runtimeCapabilities ?? {},
        channel: entry.appChannel,
      })

      await entry.app.activate(ctx)
      entry.health = { ...entry.health, status: "active" }
      log.debug("App activated", { appId })
    } catch (err) {
      entry.health = {
        ...entry.health,
        status: "error",
        errorCount: entry.health.errorCount + 1,
      }
      log.warn("App activation failed", {
        appId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
