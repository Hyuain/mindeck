/**
 * MCP → AgentApp adapter.
 * Auto-generates AgentAppManifest from a connected MCPDependency.
 */
import type { AgentAppManifest, MCPDependency, ToolDefinition } from "@/types"
import type { MCPTool } from "./client"

/**
 * Convert an MCP tool schema entry to a ToolDefinition.
 * If namespace is provided (dep.toolExposure === "namespaced"), prefixes the name.
 */
export function mcpToolToDefinition(mcpTool: MCPTool, namespace?: string): ToolDefinition {
  const name = namespace ? `${namespace}.${mcpTool.name}` : mcpTool.name
  return {
    name,
    description: mcpTool.description,
    parameters: {
      type: "object",
      properties: (mcpTool.inputSchema.properties as Record<
        string,
        { type: string; description: string }
      >) ?? {},
      required: mcpTool.inputSchema.required,
    },
  }
}

/**
 * Auto-generate an AgentAppManifest from a connected MCPDependency.
 * Called after listTools() succeeds.
 */
export function mcpDependencyToManifest(dep: MCPDependency): AgentAppManifest {
  return {
    id: `mcp:${dep.name}`,
    name: dep.name,
    version: "1.0.0",
    description: `MCP server: ${dep.name}`,
    kind: "tool-provider",
    source: {
      type: "mcp",
      config: {
        transport: dep.transport,
        command: dep.command,
        args: dep.args,
        env: dep.env,
        url: dep.url,
        discoveredTools: dep.discoveredTools,
      },
    },
    capabilities: {
      tools: dep.discoveredTools ?? [],
      acceptsTasks: false,
    },
    toolExposure: dep.toolExposure ?? "direct",
    permissions: {
      filesystem: "none",
      network: dep.transport === "streamable-http" ? "full" : "none",
      shell: dep.transport === "stdio",
    },
    lifecycle: {
      startup: "lazy",
      persistence: "workspace",
    },
  }
}
