/**
 * E4.2 — Workspace Templates
 *
 * Pre-configured stacks for onboarding. Applying a template sets MCP deps,
 * sandbox mode, and agent config on a freshly created workspace.
 */
import type { MCPDependency, SandboxMode, Workspace, WorkspaceTemplate } from "@/types"

// ─── Built-in templates ──────────────────────────────────────────────

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "A clean workspace with no pre-configuration.",
    icon: "📄",
  },
  {
    id: "react",
    name: "React / Node",
    description: "Frontend project with ESLint + TypeScript checker MCPs enabled.",
    icon: "⚛️",
    sandboxMode: "workspace-write",
    mcpDependencies: [
      {
        name: "eslint-mcp",
        transport: "stdio",
        command: "npx",
        args: ["@modelcontextprotocol/server-eslint"],
        toolExposure: "namespaced",
      } satisfies MCPDependency,
      {
        name: "typescript-mcp",
        transport: "stdio",
        command: "npx",
        args: ["@modelcontextprotocol/server-typescript"],
        toolExposure: "namespaced",
      } satisfies MCPDependency,
    ],
    systemPromptAddendum:
      "This is a React/Node.js project. Prefer TypeScript. Follow the project's ESLint configuration.",
  },
  {
    id: "python",
    name: "Python",
    description: "Python project with workspace-write sandbox enabled.",
    icon: "🐍",
    sandboxMode: "workspace-write",
    systemPromptAddendum:
      "This is a Python project. Use Python 3.10+ idioms, type hints, and prefer ruff/black for formatting.",
  },
  {
    id: "rust",
    name: "Rust",
    description: "Rust project with workspace-write sandbox enabled.",
    icon: "🦀",
    sandboxMode: "workspace-write",
    systemPromptAddendum:
      "This is a Rust project. Prefer idiomatic Rust (ownership, error handling with Result/Option, no panics in library code).",
  },
]

// ─── Helper ──────────────────────────────────────────────────────────

/**
 * Return a new workspace with template fields merged.
 * Pure function — does not mutate the input workspace.
 */
export function applyTemplate(ws: Workspace, tpl: WorkspaceTemplate): Workspace {
  if (tpl.id === "blank") return ws

  const existingPrompt = ws.agentConfig.systemPrompt ?? ""
  const addendum = tpl.systemPromptAddendum ?? ""
  const mergedPrompt = addendum
    ? existingPrompt
      ? `${existingPrompt}\n\n${addendum}`
      : addendum
    : existingPrompt

  const sandboxMode: SandboxMode = tpl.sandboxMode ?? ws.sandboxMode ?? "full"

  return {
    ...ws,
    sandboxMode,
    mcpDependencies: tpl.mcpDependencies
      ? [...(ws.mcpDependencies ?? []), ...tpl.mcpDependencies]
      : ws.mcpDependencies,
    agentConfig: {
      ...ws.agentConfig,
      ...(tpl.agentConfig ?? {}),
      systemPrompt: mergedPrompt || undefined,
    },
  }
}
