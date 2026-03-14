import { invoke } from "@tauri-apps/api/core"
import { createLogger } from "../logger"
import type { Message, ToolCall } from "@/types"

const log = createLogger("conversation")

const VALID_ROLES = new Set<string>(["user", "assistant", "system", "tool"])

interface JsonlMessage {
  id: string
  role: string
  content: string
  model?: string
  providerId?: string
  timestamp: string
  metadata?: Record<string, unknown>
  toolCalls?: ToolCall[]
  toolCallId?: string
  toolName?: string
}

function fromJsonl(m: JsonlMessage): Message | null {
  if (!VALID_ROLES.has(m.role)) {
    log.warn("Skipping message with invalid role from disk", {
      id: m.id,
      role: m.role,
    })
    return null
  }
  return {
    id: m.id,
    role: m.role as Message["role"],
    content: m.content,
    model: m.model,
    providerId: m.providerId,
    timestamp: m.timestamp,
    metadata: m.metadata,
    toolCalls: m.toolCalls,
    toolCallId: m.toolCallId,
    toolName: m.toolName,
  }
}

function toJsonl(m: Message): JsonlMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    model: m.model,
    providerId: m.providerId,
    timestamp: m.timestamp,
    metadata: m.metadata as Record<string, unknown> | undefined,
    toolCalls: m.toolCalls,
    toolCallId: m.toolCallId,
    toolName: m.toolName,
  }
}

export async function loadMessages(workspaceId: string, limit = 100): Promise<Message[]> {
  const records = await invoke<JsonlMessage[]>("load_messages", {
    workspaceId,
    limit,
  })
  return records.map(fromJsonl).filter((m): m is Message => m !== null)
}

export async function appendMessage(
  workspaceId: string,
  message: Message
): Promise<void> {
  await invoke("append_message", { workspaceId, message: toJsonl(message) })
}

export function makeMessage(
  role: Message["role"],
  content: string,
  model?: string,
  providerId?: string
): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    model,
    providerId,
    timestamp: new Date().toISOString(),
  }
}

/** Reserved workspace ID used to persist Majordomo's conversation */
export const MAJORDOMO_WS_ID = "__majordomo__"

export async function loadMajordomoMessages(limit = 200): Promise<Message[]> {
  return loadMessages(MAJORDOMO_WS_ID, limit)
}

export async function appendMajordomoMessage(message: Message): Promise<void> {
  return appendMessage(MAJORDOMO_WS_ID, message)
}

export async function clearMessages(workspaceId: string): Promise<void> {
  await invoke("clear_messages", { workspaceId })
}

export async function clearMajordomoMessages(): Promise<void> {
  return clearMessages(MAJORDOMO_WS_ID)
}
