/**
 * MCPManager — connection pool for MCP servers across workspaces and app instances.
 *
 * Pool key format:
 *   Legacy workspace deps: `{workspaceId}:{depName}`
 *   App instances:          `{instanceId}:{mcpDepName}`
 */
import { MCPClient } from "./client"
import { useAgentAppsStore } from "@/stores/agent-apps"
import { createLogger } from "@/services/logger"
import type { AgentAppManifest, MCPDependency, ToolDefinition } from "@/types"

const log = createLogger("MCPManager")

type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>

class MCPManager {
  private pool = new Map<string, MCPClient>()

  private legacyKey(workspaceId: string, depName: string): string {
    return `${workspaceId}:${depName}`
  }

  // ── Legacy workspace deps (kept for backward compat) ─────────

  async connectWorkspaceDeps(workspaceId: string, deps: MCPDependency[]): Promise<void> {
    const store = useAgentAppsStore.getState()
    store.setDeps(workspaceId, deps)

    await Promise.allSettled(
      deps.map(async (dep) => {
        const k = this.legacyKey(workspaceId, dep.name)
        if (this.pool.has(k)) return // already connected

        store.updateDepStatus(workspaceId, dep.name, { status: "connecting" })
        const client = new MCPClient(workspaceId, dep)

        try {
          await client.connect()
          const tools = await client.listTools()
          this.pool.set(k, client)
          store.updateDepStatus(workspaceId, dep.name, {
            status: "connected",
            discoveredTools: tools,
          })
          log.debug("MCP dep connected", { workspaceId, dep: dep.name, toolCount: tools.length })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.warn("MCP dep failed to connect", { workspaceId, dep: dep.name, error: msg })
          store.updateDepStatus(workspaceId, dep.name, { status: "error" })
        }
      })
    )
  }

  async disconnectWorkspace(workspaceId: string): Promise<void> {
    const toRemove = [...this.pool.keys()].filter((k) => k.startsWith(`${workspaceId}:`))
    await Promise.allSettled(
      toRemove.map(async (k) => {
        const client = this.pool.get(k)
        this.pool.delete(k)
        await client?.disconnect().catch(() => {})
      })
    )
    log.debug("MCP workspace disconnected", { workspaceId, removed: toRemove.length })
  }

  getToolsForWorkspace(workspaceId: string): ToolDefinition[] {
    const deps = useAgentAppsStore.getState().workspaceDeps[workspaceId] ?? []
    const tools: ToolDefinition[] = []

    for (const dep of deps) {
      if (!dep.discoveredTools) continue
      const prefix = dep.toolExposure === "namespaced" ? `${dep.name}.` : ""
      for (const tool of dep.discoveredTools) {
        tools.push({ ...tool, name: `${prefix}${tool.name}` })
      }
    }

    return tools
  }

  getExecutorsForWorkspace(workspaceId: string): Map<string, ToolExecutor> {
    const executors = new Map<string, ToolExecutor>()
    const deps = useAgentAppsStore.getState().workspaceDeps[workspaceId] ?? []

    for (const dep of deps) {
      if (!dep.discoveredTools) continue
      const k = this.legacyKey(workspaceId, dep.name)
      const client = this.pool.get(k)
      if (!client) continue

      const prefix = dep.toolExposure === "namespaced" ? `${dep.name}.` : ""
      for (const tool of dep.discoveredTools) {
        const exposedName = `${prefix}${tool.name}`
        const originalName = tool.name
        executors.set(exposedName, (args) => client.callTool(originalName, args))
      }
    }

    return executors
  }

  // ── App instance methods (new model) ─────────────────────────

  /**
   * Connect all MCP dependencies for an app instance.
   * Each dep gets its own pool entry keyed by `{instanceId}:{depName}`.
   */
  async connectAppInstance(instanceId: string, manifest: AgentAppManifest): Promise<void> {
    const deps = manifest.mcpDependencies ?? []
    await Promise.allSettled(
      deps.map(async (dep, idx) => {
        const depName = dep.command ?? `dep-${idx}`
        const k = `${instanceId}:${depName}`
        if (this.pool.has(k)) return

        // Convert MCPSourceConfig to MCPDependency-like for MCPClient
        const mcpDep: MCPDependency = {
          name: depName,
          transport: dep.transport,
          command: dep.command,
          args: dep.args,
          env: dep.env,
          url: dep.url,
        }
        const client = new MCPClient(instanceId, mcpDep)

        try {
          await client.connect()
          const tools = await client.listTools()
          this.pool.set(k, client)
          log.debug("App instance MCP connected", {
            instanceId,
            depName,
            toolCount: tools.length,
          })

          // Annotate client with discovered tools (accessible via getToolsForInstance)
          ;(client as MCPClient & { _tools: ToolDefinition[] })._tools = tools
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.warn("App instance MCP failed to connect", { instanceId, depName, error: msg })
        }
      })
    )
  }

  /** Disconnect all MCP connections belonging to an app instance. */
  async disconnectInstance(instanceId: string): Promise<void> {
    const toRemove = [...this.pool.keys()].filter((k) => k.startsWith(`${instanceId}:`))
    await Promise.allSettled(
      toRemove.map(async (k) => {
        const client = this.pool.get(k)
        this.pool.delete(k)
        await client?.disconnect().catch(() => {})
      })
    )
    log.debug("App instance disconnected", { instanceId, removed: toRemove.length })
  }

  /** Get all tools available from the MCP deps of an app instance. */
  getToolsForInstance(instanceId: string): ToolDefinition[] {
    const tools: ToolDefinition[] = []
    for (const [key, client] of this.pool) {
      if (!key.startsWith(`${instanceId}:`)) continue
      const c = client as MCPClient & { _tools?: ToolDefinition[] }
      if (!c._tools) continue
      for (const tool of c._tools) {
        tools.push(tool)
      }
    }
    return tools
  }

  /** Get all tool executors for an app instance. */
  getExecutorsForInstance(instanceId: string): Map<string, ToolExecutor> {
    const executors = new Map<string, ToolExecutor>()
    for (const [key, client] of this.pool) {
      if (!key.startsWith(`${instanceId}:`)) continue
      const c = client as MCPClient & { _tools?: ToolDefinition[] }
      if (!c._tools) continue
      for (const tool of c._tools) {
        executors.set(tool.name, (args) => client.callTool(tool.name, args))
      }
    }
    return executors
  }

  /**
   * Get all MCP connections as a read-only list for display purposes.
   * Returns entries grouped by pool key (workspaceId or instanceId).
   */
  getPoolEntries(): Array<{ key: string; toolCount: number }> {
    return [...this.pool.entries()].map(([key, client]) => {
      const c = client as MCPClient & { _tools?: ToolDefinition[] }
      return { key, toolCount: c._tools?.length ?? 0 }
    })
  }
}

export const mcpManager = new MCPManager()
