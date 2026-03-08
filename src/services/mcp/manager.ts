/**
 * MCPManager — connection pool for MCP servers across workspaces.
 * One connection per {workspaceId}:{depName}.
 */
import { MCPClient } from "./client"
import { useAgentAppsStore } from "@/stores/agent-apps"
import { createLogger } from "@/services/logger"
import type { MCPDependency, ToolDefinition } from "@/types"

const log = createLogger("MCPManager")

type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>

class MCPManager {
  private pool = new Map<string, MCPClient>()

  private key(workspaceId: string, depName: string): string {
    return `${workspaceId}:${depName}`
  }

  async connectWorkspaceDeps(workspaceId: string, deps: MCPDependency[]): Promise<void> {
    const store = useAgentAppsStore.getState()
    store.setDeps(workspaceId, deps)

    await Promise.allSettled(
      deps.map(async (dep) => {
        const k = this.key(workspaceId, dep.name)
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
      const k = this.key(workspaceId, dep.name)
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
}

export const mcpManager = new MCPManager()
