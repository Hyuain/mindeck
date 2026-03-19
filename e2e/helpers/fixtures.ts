// ─── E2E Test Data Factories ─────────────────────────────────
// These return shapes matching Rust backend return types so the
// service layer's fromRecord() transforms work correctly.

let counter = 0
function uid(): string {
  counter += 1
  return `e2e-${counter}-${Date.now()}`
}

// ── Workspace ────────────────────────────────────────────────

export interface WorkspaceRecordData {
  id?: string
  name?: string
  status?: "active" | "pending" | "idle"
  agentConfig?: {
    providerId?: string
    modelId?: string
    enableAgentLoop?: boolean
    systemPrompt?: string
  }
  layout?: { previewPanelWidth?: number }
  createdAt?: string
  updatedAt?: string
}

export function makeWorkspace(overrides: WorkspaceRecordData = {}) {
  const now = new Date().toISOString()
  return {
    id: overrides.id ?? uid(),
    name: overrides.name ?? "Test Workspace",
    status: overrides.status ?? "idle",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    agentConfig: {
      providerId: "p-1",
      modelId: "test-model",
      ...overrides.agentConfig,
    },
    layout: {
      previewPanelWidth: 400,
      ...overrides.layout,
    },
  }
}

// ── Provider ─────────────────────────────────────────────────

export interface ProviderRecordData {
  id?: string
  name?: string
  type?: "ollama" | "openai-compatible" | "minimax"
  baseUrl?: string
  keychainAlias?: string
  isConnected?: boolean
  priority?: "p0" | "p1" | "p2"
  models?: Array<{ id: string; name: string; contextLength?: number }>
  defaultModel?: string
}

export function makeProvider(overrides: ProviderRecordData = {}) {
  return {
    id: overrides.id ?? uid(),
    name: overrides.name ?? "Test Provider",
    type: overrides.type ?? "openai-compatible",
    baseUrl: overrides.baseUrl ?? "http://localhost:11434",
    keychainAlias: overrides.keychainAlias,
    isConnected: overrides.isConnected ?? false,
    priority: overrides.priority ?? "p1",
    models: overrides.models ?? [],
    defaultModel: overrides.defaultModel,
  }
}

// ── Skill ────────────────────────────────────────────────────

export interface SkillData {
  id?: string
  name?: string
  description?: string
  systemPrompt?: string
  instructions?: string
  scope?: "global" | "workspace"
  tags?: string[]
}

export function makeSkill(overrides: SkillData = {}) {
  const now = new Date().toISOString()
  return {
    id: overrides.id ?? uid(),
    name: overrides.name ?? "test-skill",
    description: overrides.description ?? "A test skill",
    systemPrompt: overrides.systemPrompt ?? "You are a test assistant.",
    instructions: overrides.instructions ?? "You are a test assistant.",
    scope: overrides.scope ?? "global",
    tags: overrides.tags ?? [],
    createdAt: now,
    updatedAt: now,
  }
}

// ── Message ──────────────────────────────────────────────────

export interface MessageData {
  id?: string
  role?: "user" | "assistant" | "system" | "tool"
  content?: string
  model?: string
  providerId?: string
  timestamp?: string
  metadata?: Record<string, unknown>
}

export function makeMessage(overrides: MessageData = {}) {
  return {
    id: overrides.id ?? uid(),
    role: overrides.role ?? "user",
    content: overrides.content ?? "Hello",
    model: overrides.model,
    providerId: overrides.providerId,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    metadata: overrides.metadata,
  }
}

// ── Agent App ────────────────────────────────────────────────

export function makeAgentApp(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? uid(),
    name: overrides.name ?? "Test App",
    version: overrides.version ?? "1.0.0",
    description: overrides.description ?? "A test app",
    kind: overrides.kind ?? "native",
    capabilities: overrides.capabilities ?? { tools: [], acceptsTasks: false },
    toolExposure: overrides.toolExposure ?? "direct",
    permissions: overrides.permissions ?? {
      filesystem: "none",
      network: "none",
      shell: false,
    },
    lifecycle: overrides.lifecycle ?? {
      startup: "lazy",
      persistence: "session",
    },
  }
}

// ── File Node ────────────────────────────────────────────────

export function makeFileNode(
  name: string,
  isDir: boolean,
  parentPath = "/mock-home/project"
) {
  return {
    path: `${parentPath}/${name}`,
    name,
    isDir,
    size: isDir ? undefined : 1024,
  }
}
