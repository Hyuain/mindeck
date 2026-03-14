import type {
  Message,
  Workspace,
  ProviderConfig,
  ToolCall,
  Skill,
  Task,
  AgentMessage,
  ToolDefinition,
  WorkspaceSummary,
  ToolActivity,
  PermissionRequest,
} from "@/types"

let counter = 0
function nextId(): string {
  counter += 1
  return `test-${counter}`
}

export function makeTestMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: nextId(),
    role: "user",
    content: "Hello",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

export function makeTestWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: nextId(),
    name: "Test Workspace",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "idle",
    agentConfig: {
      providerId: "p1",
      modelId: "m1",
    },
    layout: {
      previewPanelWidth: 400,
    },
    ...overrides,
  }
}

export function makeTestProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: nextId(),
    name: "Test Provider",
    type: "openai-compatible",
    baseUrl: "http://localhost:11434",
    isConnected: true,
    priority: "p1",
    ...overrides,
  }
}

export function makeTestToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: nextId(),
    name: "read_file",
    arguments: { path: "/tmp/test.txt" },
    ...overrides,
  }
}

export function makeTestSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: nextId(),
    name: "Test Skill",
    description: "A test skill",
    instructions: "Do the thing",
    systemPrompt: "Do the thing",
    source: { type: "native" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

export function makeTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: nextId(),
    workspaceId: "ws-1",
    workspaceName: "Test WS",
    content: "Do something",
    status: "pending",
    sourceType: "majordomo",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attempts: 1,
    maxAttempts: 3,
    ...overrides,
  }
}

export function makeAgentMessage(
  role: "user" | "system",
  content: string
): AgentMessage {
  return { role, content }
}

export function makeAssistantMessage(
  content: string,
  toolCalls?: ToolCall[]
): AgentMessage {
  return { role: "assistant", content, toolCalls }
}

export function makeToolMessage(
  toolCallId: string,
  name: string,
  content: string
): AgentMessage {
  return { role: "tool", toolCallId, name, content }
}

export function makeTestToolDefinition(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "test_tool",
    description: "A test tool",
    parameters: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input value" },
      },
      required: ["input"],
    },
    ...overrides,
  }
}

export function makeTestWorkspaceSummary(
  overrides: Partial<WorkspaceSummary> = {}
): WorkspaceSummary {
  return {
    workspaceId: nextId(),
    workspaceName: "Test WS",
    status: "idle",
    snippet: "Some status",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

export function makeTestToolActivity(overrides: Partial<ToolActivity> = {}): ToolActivity {
  return {
    id: nextId(),
    name: "read_file",
    args: { path: "/test" },
    status: "running",
    startedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

export function makeTestPermissionRequest(
  overrides: Partial<PermissionRequest> = {}
): PermissionRequest {
  return {
    id: nextId(),
    type: "bash_exec",
    label: "Run command",
    details: "ls -la",
    requestedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}
