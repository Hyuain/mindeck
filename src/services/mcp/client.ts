/**
 * MCPClient — JSON-RPC 2.0 client for a single MCP server.
 * stdio transport: Rust process management via mcp_start/mcp_invoke/mcp_stop.
 * HTTP transport: direct fetch.
 */
import { invoke } from "@tauri-apps/api/core"
import type { MCPDependency, ToolDefinition } from "@/types"

interface JsonRpcRequest {
  jsonrpc: "2.0"
  id: number
  method: string
  params: unknown
}

interface JsonRpcSuccess {
  jsonrpc: "2.0"
  id: number
  result: unknown
}

interface JsonRpcError {
  jsonrpc: "2.0"
  id: number
  error: { code: number; message: string; data?: unknown }
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError

function buildRequest(method: string, params: unknown, id: number): JsonRpcRequest {
  return { jsonrpc: "2.0", id, method, params }
}

function parseResponse(raw: unknown): unknown {
  const resp = raw as JsonRpcResponse
  if ("error" in resp && resp.error) {
    throw new Error(`MCP error ${resp.error.code}: ${resp.error.message}`)
  }
  return (resp as JsonRpcSuccess).result
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: string
    properties?: Record<string, unknown>
    required?: string[]
  }
}

export class MCPClient {
  private id: string
  private config: MCPDependency
  private nextId = 1

  constructor(workspaceId: string, config: MCPDependency) {
    this.id = `${workspaceId}:${config.name}`
    this.config = config
  }

  async connect(): Promise<void> {
    if (this.config.transport === "stdio") {
      const command = this.config.command ?? ""
      const parts = command.split(" ")
      const cmd = parts[0] ?? ""
      const cmdArgs = [...(parts.slice(1)), ...(this.config.args ?? [])]
      await invoke("mcp_start", {
        id: this.id,
        command: cmd,
        args: cmdArgs,
        env: this.config.env ?? {},
      })
    } else {
      // HTTP: send initialize
      await this._httpCall("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mindeck", version: "1.0.0" },
      })
    }
  }

  async listTools(): Promise<ToolDefinition[]> {
    const result = await this._call("tools/list", {})
    const tools = (result as { tools?: MCPTool[] }).tools ?? []
    return tools.map((t) => this._mcpToolToDefinition(t))
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await this._call("tools/call", { name, arguments: args })
    const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? []
    // Extract text content from MCP tool result
    return content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
  }

  async disconnect(): Promise<void> {
    if (this.config.transport === "stdio") {
      await invoke("mcp_stop", { id: this.id }).catch(() => {})
    }
  }

  private async _call(method: string, params: unknown): Promise<unknown> {
    if (this.config.transport === "stdio") {
      return this._stdioCall(method, params)
    }
    return this._httpCall(method, params)
  }

  private async _stdioCall(method: string, params: unknown): Promise<unknown> {
    const req = buildRequest(method, params, this.nextId++)
    const raw = await invoke("mcp_invoke", {
      id: this.id,
      method: req.method,
      params: req.params,
    })
    return parseResponse({ jsonrpc: "2.0", id: req.id, result: raw })
  }

  private async _httpCall(method: string, params: unknown): Promise<unknown> {
    const url = this.config.url
    if (!url) throw new Error("HTTP MCP transport requires a URL")
    const id = this.nextId++
    const req = buildRequest(method, params, id)
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    })
    if (!resp.ok) {
      throw new Error(`HTTP MCP ${resp.status}: ${resp.statusText}`)
    }
    const raw = (await resp.json()) as unknown
    return parseResponse(raw)
  }

  private _mcpToolToDefinition(tool: MCPTool): ToolDefinition {
    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: (tool.inputSchema.properties as Record<
          string,
          { type: string; description: string }
        >) ?? {},
        required: tool.inputSchema.required,
      },
    }
  }
}
