import type { AgentAppManifest } from "@/types"

/**
 * Pre-configured Agent App manifests for popular MCP servers.
 * Users can install these with one click from the Marketplace tab.
 *
 * Each entry provides sensible defaults. Users fill in required env vars
 * during the install flow.
 */

export interface MCPDirectoryEntry {
  /** The manifest to install (kind: "custom" since user-installed) */
  manifest: Omit<AgentAppManifest, "kind">
  /** Environment variables the user must provide */
  requiredEnv?: { key: string; label: string; placeholder?: string }[]
  /** Short summary for the marketplace card */
  summary: string
  /** Category for grouping */
  category: "files" | "developer" | "data" | "web" | "communication"
}

export const MCP_DIRECTORY: MCPDirectoryEntry[] = [
  {
    manifest: {
      id: "marketplace.filesystem",
      name: "Filesystem",
      version: "1.0.0",
      description: "Read, write, and list files on the local filesystem.",
      icon: "📁",
      mcpDependencies: [
        {
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
        },
      ],
      capabilities: {},
      toolExposure: "direct",
      permissions: { filesystem: "full", network: "none", shell: false },
      lifecycle: { startup: "lazy", persistence: "session" },
    },
    summary: "File read/write/list operations",
    category: "files",
  },
  {
    manifest: {
      id: "marketplace.github",
      name: "GitHub",
      version: "1.0.0",
      description: "Interact with GitHub repos, issues, PRs, and code search.",
      icon: "🐙",
      mcpDependencies: [
        {
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
        },
      ],
      capabilities: {},
      toolExposure: "namespaced",
      permissions: { filesystem: "none", network: "full", shell: false },
      lifecycle: { startup: "lazy", persistence: "session" },
    },
    requiredEnv: [
      {
        key: "GITHUB_PERSONAL_ACCESS_TOKEN",
        label: "GitHub Personal Access Token",
        placeholder: "ghp_...",
      },
    ],
    summary: "Repos, issues, PRs, code search",
    category: "developer",
  },
  {
    manifest: {
      id: "marketplace.postgres",
      name: "PostgreSQL",
      version: "1.0.0",
      description: "Query PostgreSQL databases and inspect schemas.",
      icon: "🐘",
      mcpDependencies: [
        {
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-postgres"],
          env: { DATABASE_URL: "" },
        },
      ],
      capabilities: {},
      toolExposure: "namespaced",
      permissions: { filesystem: "none", network: "full", shell: false },
      lifecycle: { startup: "lazy", persistence: "session" },
    },
    requiredEnv: [
      {
        key: "DATABASE_URL",
        label: "PostgreSQL Connection String",
        placeholder: "postgresql://user:pass@localhost:5432/db",
      },
    ],
    summary: "SQL queries, schema inspection",
    category: "data",
  },
  {
    manifest: {
      id: "marketplace.memory",
      name: "Memory",
      version: "1.0.0",
      description: "Persistent knowledge graph for storing and retrieving facts.",
      icon: "🧠",
      mcpDependencies: [
        {
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-memory"],
        },
      ],
      capabilities: {},
      toolExposure: "direct",
      permissions: { filesystem: "workspace-only", network: "none", shell: false },
      lifecycle: { startup: "lazy", persistence: "workspace" },
    },
    summary: "Knowledge graph, persistent facts",
    category: "data",
  },
  {
    manifest: {
      id: "marketplace.brave-search",
      name: "Brave Search",
      version: "1.0.0",
      description: "Web search via the Brave Search API.",
      icon: "🦁",
      mcpDependencies: [
        {
          transport: "stdio",
          command: "npx",
          args: ["-y", "@anthropic-ai/mcp-server-brave-search"],
          env: { BRAVE_API_KEY: "" },
        },
      ],
      capabilities: {},
      toolExposure: "direct",
      permissions: { filesystem: "none", network: "full", shell: false },
      lifecycle: { startup: "lazy", persistence: "session" },
    },
    requiredEnv: [
      {
        key: "BRAVE_API_KEY",
        label: "Brave API Key",
        placeholder: "BSA...",
      },
    ],
    summary: "Web search",
    category: "web",
  },
  {
    manifest: {
      id: "marketplace.puppeteer",
      name: "Puppeteer",
      version: "1.0.0",
      description: "Browser automation, screenshots, and web scraping.",
      icon: "🎭",
      mcpDependencies: [
        {
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-puppeteer"],
        },
      ],
      capabilities: {},
      toolExposure: "namespaced",
      permissions: { filesystem: "none", network: "full", shell: false },
      lifecycle: { startup: "lazy", persistence: "session" },
    },
    summary: "Browser automation, screenshots",
    category: "web",
  },
  {
    manifest: {
      id: "marketplace.fetch",
      name: "Fetch",
      version: "1.0.0",
      description: "HTTP requests with HTML-to-Markdown conversion.",
      icon: "🌐",
      mcpDependencies: [
        {
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-fetch"],
        },
      ],
      capabilities: {},
      toolExposure: "direct",
      permissions: { filesystem: "none", network: "full", shell: false },
      lifecycle: { startup: "lazy", persistence: "session" },
    },
    summary: "HTTP requests, HTML to Markdown",
    category: "web",
  },
  {
    manifest: {
      id: "marketplace.slack",
      name: "Slack",
      version: "1.0.0",
      description: "Send messages, search channels, and interact with Slack.",
      icon: "💬",
      mcpDependencies: [
        {
          transport: "stdio",
          command: "npx",
          args: ["-y", "@anthropic-ai/mcp-server-slack"],
          env: { SLACK_BOT_TOKEN: "" },
        },
      ],
      capabilities: {},
      toolExposure: "namespaced",
      permissions: { filesystem: "none", network: "full", shell: false },
      lifecycle: { startup: "lazy", persistence: "session" },
    },
    requiredEnv: [
      {
        key: "SLACK_BOT_TOKEN",
        label: "Slack Bot Token",
        placeholder: "xoxb-...",
      },
    ],
    summary: "Messages, channels, search",
    category: "communication",
  },
]
