// ─── Provider ────────────────────────────────────────────────

export interface ModelCapabilities {
  /** How well this model handles function/tool calling */
  functionCalling?: "native" | "weak" | "none"
  /** Whether the model supports extended thinking / reasoning */
  thinking?: boolean
  /** Whether the model accepts image inputs */
  vision?: boolean
}

export interface Model {
  id: string
  name: string
  contextLength?: number
  capabilities?: ModelCapabilities
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

export interface ModelRef {
  providerId: string
  modelId: string
}

export type TaskIntent = "read-only" | "mutation" | "analysis" | "full"

export interface AgentConfig {
  providerId: string
  modelId: string
  systemPrompt?: string
  /** Whether to run the full agentic loop (tools, multi-turn) vs simple chat */
  enableAgentLoop?: boolean
  /** Allowed tool names; undefined = all tools */
  tools?: string[]
  /** Per-phase model routing: planning (iter 0), execution (iter 1+), verification */
  planningModel?: ModelRef
  executionModel?: ModelRef
  verificationModel?: ModelRef
  /** Restricts the action space by blocking certain tool categories */
  taskIntent?: TaskIntent
}

export interface WorkspaceLayout {
  previewPanelWidth: number
  activeRendererId?: string
}

// ─── MCP / Agent Apps ────────────────────────────────────────

export interface MCPDependency {
  /** Namespace key e.g. "web-search" */
  name: string
  transport: "stdio" | "streamable-http"
  /** stdio: "npx @mcp/server-web-search" */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** HTTP transport URL */
  url?: string
  toolExposure?: "direct" | "namespaced"
  /** Whether this server is active; false = persisted but not connected (default true) */
  enabled?: boolean
  /** "workspace" = this workspace only; "global" = all workspaces (default workspace) */
  scope?: "workspace" | "global"
  // Runtime (not persisted)
  status?: "connecting" | "connected" | "disconnected" | "error"
  discoveredTools?: ToolDefinition[]
}

export interface MCPSourceConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  transport: "stdio" | "streamable-http"
  url?: string
  discoveredTools?: ToolDefinition[]
}

export interface HarnessTrigger {
  event: "file_written" | "tool_completed" | "task_completed"
  /** Glob pattern for file_written events */
  pattern?: string
  /** Tool name filter for tool_completed events */
  toolName?: string
}

export interface AgentAppManifest {
  id: string
  name: string
  version: string
  description: string
  icon?: string
  // NOTE: `kind` removed — behavior is inferred from capabilities at runtime.

  /**
   * An Agent App can depend on MULTIPLE MCP servers (not just one).
   * Each entry maps to a separate MCPClient in the pool.
   */
  mcpDependencies?: MCPSourceConfig[]

  /**
   * For built-in native apps (ESLint, TSC, TestRunner).
   * Mutually exclusive with mcpDependencies (can have both in principle, but uncommon).
   */
  nativeComponent?: string

  capabilities: {
    tools?: ToolDefinition[]
    ui?: {
      renderer:
        | { type: "mcp-app"; resourceUri: string }
        | { type: "native"; component: string }
      minWidth?: number
    }
    acceptsTasks?: boolean
  }
  toolExposure: "direct" | "namespaced" | "isolated"
  permissions: {
    filesystem: "none" | "read" | "workspace-only" | "full"
    network: "none" | "full"
    shell: boolean
  }
  lifecycle: {
    startup: "eager" | "lazy" | "on-trigger"
    persistence: "session" | "workspace" | "global"
  }
  /** Harness configuration: when to auto-run this app and feed results back to the agent */
  harness?: {
    triggers: HarnessTrigger[]
    feedbackToAgent: boolean
  }
}

/**
 * A workspace-local activation record for an installed Agent App.
 * Multiple instances of the same app can coexist (e.g. two GitHub instances
 * for different accounts), each with their own isolated MCP pool entries.
 */
export interface AppInstance {
  /** UUID generated at activation time (Mindeck-managed) */
  instanceId: string
  /** References AgentAppManifest.id */
  appId: string
  /** User-assigned label to disambiguate multiple instances of the same app */
  label?: string
}

export type SandboxMode = "read-only" | "workspace-write" | "full"

// ─── Workspace Templates (E4.2) ──────────────────────────

export interface WorkspaceTemplate {
  id: string
  name: string
  description: string
  icon: string
  agentConfig?: Partial<AgentConfig>
  mcpDependencies?: MCPDependency[]
  sandboxMode?: SandboxMode
  /** Appended to the workspace system prompt */
  systemPromptAddendum?: string
}

// ─── Container Sandbox (E4.6) ────────────────────────────

export interface ContainerSandboxConfig {
  enabled: boolean
  /** Docker image to use (default: "node:20-slim") */
  image: string
  networkMode: "none" | "host"
  /** CPU count (default: 2) */
  cpus: number
  /** Memory in MB (default: 2048) */
  memoryMb: number
  /** Per-exec timeout in ms (default: 60000) */
  timeoutMs: number
}

// ─── Script Agent App (E4.8) ─────────────────────────────

export interface ScriptAgentApp {
  id: string
  name: string
  filePath: string
  description?: string
  active: boolean
}

export interface ScriptAgentAppContext {
  workspaceId: string
  executeTool(name: string, args: Record<string, unknown>): Promise<unknown>
  log(msg: string): void
  onFileWritten(pattern: string, handler: (path: string) => Promise<void>): void
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
  mcpDependencies?: MCPDependency[]
  /**
   * Globally-installed Agent Apps activated for this workspace.
   * Each entry is a per-workspace activation record (one app can have multiple instances).
   */
  activatedApps?: AppInstance[]
  sandboxMode?: SandboxMode
  /** E4.6: Docker container isolation config (Layer 2) */
  containerSandbox?: ContainerSandboxConfig
}

export interface FileNode {
  path: string
  name: string
  isDir: boolean
  size?: number
}

// ─── Conversation / Messages ──────────────────────────────────
export type MessageRole = "user" | "assistant" | "system" | "tool"

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
  /** Tool calls made by this assistant turn (role: "assistant" with tool calls) */
  toolCalls?: ToolCall[]
  /** For role: "tool" — the call ID this result belongs to */
  toolCallId?: string
  /** For role: "tool" — name of the tool that produced this result */
  toolName?: string
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

export type SkillSource =
  | { type: "native"; path?: string }
  | { type: "skill-md"; path: string }
  | { type: "cursor-rule"; path: string }
  | { type: "agents-md"; path: string }

export interface SkillIndex {
  id: string
  name: string
  description: string
  source: SkillSource
  path?: string
}

export type ContextRuleSource =
  | "agents-md" // AGENTS.md  (priority 10 — universal standard)
  | "claude-md" // CLAUDE.md  (priority 9  — Claude Code)
  | "claude-local" // CLAUDE.local.md (priority 8 — personal, gitignored)
  | "gemini-md" // GEMINI.md  (priority 8  — Gemini CLI)
  | "cursor-rule" // .cursor/rules/*.md (priority 5 — Cursor dir)
  | "cursorrules-file" // .cursorrules (priority 4 — Cursor legacy)
  | "windsurf-rule" // .windsurf/rules/*.md (priority 4 — Windsurf dir)
  | "windsurfrules-file" // .windsurfrules (priority 4 — Windsurf flat)
  | "copilot-instructions" // .github/copilot-instructions.md (priority 3 — Copilot)

export interface ContextRule {
  content: string
  source: ContextRuleSource
  path: string
  priority: number
}

export interface Skill {
  id: string
  name: string
  description: string
  /** Primary instructions field (SKILL.md body / new format) */
  instructions?: string
  /** Legacy field — kept for Majordomo compat; maps from instructions */
  systemPrompt: string
  /** Subset of tool names; undefined = all tools (legacy) */
  tools?: string[]
  /** Subset of tool names from SKILL.md allowed-tools */
  allowedTools?: string[]
  version?: string
  author?: string
  tags?: string[]
  license?: string
  source?: SkillSource
  scope?: "global" | "workspace"
  createdAt: string
  updatedAt: string
  /** Bound Agent App ID — ensures the corresponding app is connected when this skill is active */
  boundAppId?: string
  /** If true, the auto-matcher will never suggest this skill; user must invoke it manually */
  disableAutoInvoke?: boolean
  /** Hint shown in slash command menu after the skill name e.g. "[issue-number]" */
  argumentHint?: string
}

// ─── Tool Activity (UI state) ─────────────────────────────────

export type ToolStatus = "running" | "done" | "error"

export interface InjectionDetection {
  pattern: string
  severity: "high" | "medium" | "low"
  snippet: string
}

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
  /** Set when a prompt injection pattern was detected in the tool result */
  injectionWarning?: InjectionDetection
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

export interface WorkspaceDeletedEvent {
  workspaceId: string
}

export interface FileWrittenEvent {
  workspaceId: string
  filePath: string
}

export interface ToolCompletedEvent {
  workspaceId: string
  toolName: string
  result: string
}

export interface HarnessFeedbackEvent {
  workspaceId: string
  appName: string
  result: string
}

// ─── Observability Metrics (E4.5) ────────────────────────

export interface ToolCallMetric {
  timestamp: string
  workspaceId: string
  toolName: string
  success: boolean
  durationMs: number
}

export interface LoopCompletionMetric {
  timestamp: string
  workspaceId: string
  toolsCalled: string[]
  iterations: number
  /** Character-count ÷ 4 heuristic (no real token counts from providers) */
  estimatedTokens: number
  durationMs: number
  doomLoopDetected: boolean
}

export type MetricEvent =
  | { type: "tool_call"; data: ToolCallMetric }
  | { type: "loop_complete"; data: LoopCompletionMetric }
