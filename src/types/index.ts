// ─── Provider ────────────────────────────────────────────────

export interface Model {
  id: string;
  name: string;
  contextLength?: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: "ollama" | "openai-compatible";
  baseUrl: string;
  /** Key alias in OS Keychain — the actual key is never in JS memory */
  keychainAlias?: string;
  models?: Model[];
  isConnected: boolean;
  priority: "p0" | "p1" | "p2";
}

export type HealthStatus =
  | { status: "connected"; latencyMs: number }
  | { status: "error"; message: string };

// ─── Workspace ───────────────────────────────────────────────

export type WorkspaceStatus = "active" | "pending" | "idle";

export interface AgentConfig {
  providerId: string;
  modelId: string;
  systemPrompt?: string;
}

export interface WorkspaceLayout {
  previewPanelWidth: number;
  activeRendererId?: string;
}

export interface Workspace {
  id: string;
  name: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
  agentConfig: AgentConfig;
  layout: WorkspaceLayout;
  repoPath?: string;
  /** Short status summary for Super Agent (≤200 tokens) */
  stateSummary?: string;
  status: WorkspaceStatus;
  lastActivity?: string;
}

// ─── Conversation / Messages ──────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  model?: string;
  providerId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ─── Preview / Renderers ──────────────────────────────────────

export type RendererType = "markdown" | "code" | "image" | "raw";

export interface RenderableContent {
  type: RendererType;
  content: string;
  language?: string;
  filename?: string;
}

// ─── Super Agent ──────────────────────────────────────────────

export interface WorkspaceSummary {
  workspaceId: string;
  workspaceName: string;
  status: WorkspaceStatus;
  snippet: string;
  updatedAt: string;
}

// ─── UI State ────────────────────────────────────────────────

export type Theme = "dark" | "light";
