// ─── Provider ────────────────────────────────────────────────

export interface Model {
  id: string
  name: string
  contextLength?: number
}

export interface ProviderConfig {
  id: string
  name: string
  type: "ollama" | "openai-compatible" | "minimax"
  baseUrl: string
  /** Key alias in OS Keychain — the actual key is never in JS memory */
  keychainAlias?: string
  models?: Model[]
  /** Default model ID to use for new chats */
  defaultModel?: string
  isConnected: boolean
  priority: "p0" | "p1" | "p2"
}

export type HealthStatus =
  | { status: "connected"; latencyMs: number }
  | { status: "error"; message: string }

// ─── Workspace ───────────────────────────────────────────────

export type WorkspaceStatus = "active" | "pending" | "idle"

export type WorkspaceType = "internal" | "linked"

export interface AgentConfig {
  providerId: string
  modelId: string
  systemPrompt?: string
  /** Whether to run the full agentic loop (tools, multi-turn) vs simple chat */
  enableAgentLoop?: boolean
  /** Allowed tool names; undefined = all tools */
  tools?: string[]
}

export interface WorkspaceLayout {
  previewPanelWidth: number
  activeRendererId?: string
}

export interface Workspace {
  id: string
  name: string
  icon?: string
  createdAt: string
  updatedAt: string
  agentConfig: AgentConfig
  layout: WorkspaceLayout
  workspaceType?: WorkspaceType
  repoPath?: string
  /** Short status summary for Super Agent (≤200 tokens) */
  stateSummary?: string
  status: WorkspaceStatus
  lastActivity?: string
}

export interface FileNode {
  path: string
  name: string
  isDir: boolean
  size?: number
}

// ─── Conversation / Messages ──────────────────────────────────
export type MessageRole = "user" | "assistant" | "system"

/** Who initiated this message */
export type MessageSource = "user" | "majordomo" | "sub-agent" | "system"

export interface MessageMetadata {
  /** Who sent this message */
  source?: MessageSource
  /** Correlation ID linking to a TaskDispatchEvent */
  dispatchId?: string
  /** Sub-agent identifier (if source is "sub-agent") */
  agentId?: string
  /** dispatchId of the task this is a reply to */
  replyTo?: string
  [key: string]: unknown
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  model?: string
  providerId?: string
  timestamp: string
  metadata?: MessageMetadata
}

// ─── Preview / Renderers ──────────────────────────────────────

export type RendererType = "markdown" | "code" | "image" | "raw"

export interface RenderableContent {
  type: RendererType
  content: string
  language?: string
  filename?: string
}

// ─── Super Agent ──────────────────────────────────────────────

export interface WorkspaceSummary {
  workspaceId: string
  workspaceName: string
  status: WorkspaceStatus
  snippet: string
  updatedAt: string
}

// ─── UI State ────────────────────────────────────────────────

export type Theme = "dark" | "light"

// ─── Tool Calling ─────────────────────────────────────────────

export interface ToolParameterProperty {
  type: string
  description: string
  enum?: string[]
  /** For array types */
  items?:
    | ToolParameterProperty
    | {
        type: string
        properties?: Record<string, ToolParameterProperty>
        required?: string[]
      }
}

export interface ToolParameterSchema {
  type: "object"
  properties: Record<string, ToolParameterProperty>
  required?: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolParameterSchema
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type AgentMessage =
  | { role: "user" | "system"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string }

// ─── Skills ──────────────────────────────────────────────────

export interface Skill {
  id: string
  name: string
  description: string
  systemPrompt: string
  /** Subset of tool names; undefined = all tools */
  tools?: string[]
  createdAt: string
  updatedAt: string
}

// ─── Tool Activity (UI state) ─────────────────────────────────

export type ToolStatus = "running" | "done" | "error"

export interface ToolActivity {
  id: string
  name: string
  args: Record<string, unknown>
  status: ToolStatus
  result?: unknown
  startedAt: string
  finishedAt?: string
  /** Set when this activity was spawned inside a sub-agent */
  subAgent?: string
}

export interface PermissionRequest {
  id: string
  type: string
  label: string
  details: string
  requestedAt: string
  /** Workspace or agent name that triggered this permission request */
  requestedBy?: string
}

// ─── Task Management ─────────────────────────────────────────

export type TaskStatus = "pending" | "received" | "processing" | "completed" | "failed"

export interface Task {
  /** Doubles as dispatchId — used for EventBus correlation */
  id: string
  workspaceId: string
  workspaceName: string
  content: string
  status: TaskStatus
  sourceType: MessageSource
  createdAt: number
  updatedAt: number
  /** How many times this task has been attempted (starts at 1) */
  attempts: number
  maxAttempts: number
  result?: string
  error?: string
}

// ─── Event Bus Events ────────────────────────────────────────

export interface TaskDispatchEvent {
  /** Unique correlation ID for this dispatch */
  id: string
  sourceType: MessageSource
  targetWorkspaceId: string
  task: string
  priority?: "normal" | "high"
}

export interface TaskStatusEvent {
  dispatchId: string
  workspaceId: string
  status: "received" | "processing" | "completed" | "failed"
  progress?: string
}

export interface TaskResultEvent {
  dispatchId: string
  workspaceId: string
  /** Full result text */
  result: string
  /** Short summary (≤200 chars) for Majordomo display */
  summary: string
}
