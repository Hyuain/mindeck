/**
 * AppContext factory — capability-based dependency injection for Agent Apps.
 *
 * Inspects `RuntimeCapabilities` and injects only the clients that the app
 * has declared, enforcing least-privilege at construction time.
 */
import { invoke } from "@tauri-apps/api/core"
import { streamChat } from "@/services/providers/bridge"
import type { ExtendedChatChunk } from "@/services/providers/bridge"
import { executeTool } from "@/services/tools/registry"
import { createStorageClient } from "./storage-client"
import type {
  AgentMessage,
  AppChannel,
  AppContext,
  LLMChunk,
  LLMClient,
  PaneClient,
  RuntimeCapabilities,
  ShellClient,
  ToolClient,
  ToolDefinition,
} from "@/types"

export interface BuildParams {
  appId: string
  workspaceId: string
  workspaceRoot: string
  providerId: string
  providerType: string
  modelId: string
  capabilities: RuntimeCapabilities
  channel?: AppChannel
  pane?: PaneClient
}

// ─── Client builders ─────────────────────────────────────────

function buildShellClient(workspaceRoot: string): ShellClient {
  return {
    async exec(
      command: string,
      cwd?: string
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
      const stdout = await invoke<string>("bash_exec", {
        command,
        cwd: cwd ?? workspaceRoot,
      })
      return { stdout, stderr: "", exitCode: 0 }
    },
  }
}

function buildLLMClient(
  providerId: string,
  providerType: string,
  modelId: string
): LLMClient {
  return {
    chat(
      messages: AgentMessage[],
      tools?: ToolDefinition[],
      signal?: AbortSignal
    ): AsyncIterable<LLMChunk> {
      return mapStreamToLLMChunks(
        streamChat(providerId, providerType, modelId, messages, tools, signal)
      )
    },
  }
}

async function* mapStreamToLLMChunks(
  stream: AsyncIterable<ExtendedChatChunk>
): AsyncIterable<LLMChunk> {
  for await (const chunk of stream) {
    if (chunk.delta) {
      yield { type: "text", content: chunk.delta }
    }
    if (chunk.toolCallStart) {
      yield {
        type: "tool_call_start",
        toolCall: {
          id: chunk.toolCallStart.id,
          name: chunk.toolCallStart.name,
          arguments: "",
        },
      }
    }
    if (chunk.toolCallArgsDelta) {
      yield {
        type: "tool_call_args",
        toolCall: {
          id: chunk.toolCallArgsDelta.id,
          name: "",
          arguments: chunk.toolCallArgsDelta.delta,
        },
      }
    }
    if (chunk.toolCallEnd) {
      yield {
        type: "tool_call_end",
        toolCall: {
          id: chunk.toolCallEnd.id,
          name: "",
          arguments: "",
        },
      }
    }
  }
}

function buildToolClient(allowedTools: string[]): ToolClient {
  const allowed = new Set(allowedTools)
  return {
    async call(name: string, args: Record<string, unknown>) {
      if (!allowed.has(name)) {
        throw new Error(
          `Tool '${name}' is not declared in this app's capabilities. Allowed: [${allowedTools.join(", ")}]`
        )
      }
      const result = await executeTool(name, args)
      return {
        ok: true,
        result: typeof result === "string" ? result : JSON.stringify(result),
      }
    },
  }
}

// ─── Public API ──────────────────────────────────────────────

export function buildAppContext(params: BuildParams): AppContext {
  const { capabilities } = params

  const base: AppContext = {
    appId: params.appId,
    workspaceId: params.workspaceId,
    workspaceRoot: params.workspaceRoot,
  }

  const shell = capabilities.shell ? buildShellClient(params.workspaceRoot) : undefined

  const llm = capabilities.llm
    ? buildLLMClient(params.providerId, params.providerType, params.modelId)
    : undefined

  const tools =
    capabilities.tools && capabilities.tools.length > 0
      ? buildToolClient(capabilities.tools)
      : undefined

  const channel = capabilities.channel && params.channel ? params.channel : undefined

  const pane = capabilities.pane && params.pane ? params.pane : undefined

  const storage = capabilities.storage
    ? createStorageClient(params.workspaceId, params.appId, capabilities.storage.scope)
    : undefined

  return {
    ...base,
    ...(shell !== undefined && { shell }),
    ...(llm !== undefined && { llm }),
    ...(tools !== undefined && { tools }),
    ...(channel !== undefined && { channel }),
    ...(pane !== undefined && { pane }),
    ...(storage !== undefined && { storage }),
  }
}
