# Mindeck User Guide

> **Version 0.0.1** | Local-first Agent Workflow OS

This guide covers everything you need to know to use Mindeck effectively — from initial setup through advanced agent orchestration.

---

## Table of Contents

- [Getting Started](#getting-started)
  - [System Requirements](#system-requirements)
  - [Installation](#installation)
  - [First Launch](#first-launch)
- [Interface Overview](#interface-overview)
  - [Three-Column Layout](#three-column-layout)
  - [Titlebar](#titlebar)
  - [Keyboard Shortcuts](#keyboard-shortcuts)
- [Providers](#providers)
  - [Adding a Provider](#adding-a-provider)
  - [Supported Providers](#supported-providers)
  - [API Key Security](#api-key-security)
  - [Model Selection](#model-selection)
  - [Health Checks](#health-checks)
- [Workspaces](#workspaces)
  - [Creating a Workspace](#creating-a-workspace)
  - [Workspace Types](#workspace-types)
  - [Workspace Settings](#workspace-settings)
  - [Switching Workspaces](#switching-workspaces)
  - [Deleting a Workspace](#deleting-a-workspace)
- [Chat](#chat)
  - [Sending Messages](#sending-messages)
  - [Streaming Responses](#streaming-responses)
  - [Conversation History](#conversation-history)
  - [Clearing Conversations](#clearing-conversations)
- [Majordomo](#majordomo)
  - [What Is Majordomo?](#what-is-majordomo)
  - [Dispatching Tasks](#dispatching-tasks)
  - [Viewing Results](#viewing-results)
  - [Task Status Tracking](#task-status-tracking)
- [Agentic Mode](#agentic-mode)
  - [Enabling the Agentic Loop](#enabling-the-agentic-loop)
  - [Built-in Tools](#built-in-tools)
  - [Tool Activity Monitoring](#tool-activity-monitoring)
  - [Permission Requests](#permission-requests)
  - [Sub-Agent Spawning](#sub-agent-spawning)
  - [Doom-Loop Protection](#doom-loop-protection)
  - [Context Compaction](#context-compaction)
- [Skills](#skills)
  - [What Are Skills?](#what-are-skills)
  - [Using Skills (Slash Commands)](#using-skills-slash-commands)
  - [Skill Auto-Suggestions](#skill-auto-suggestions)
  - [Global vs Workspace Skills](#global-vs-workspace-skills)
  - [Creating Custom Skills](#creating-custom-skills)
  - [Skill Discovery Paths](#skill-discovery-paths)
- [File Explorer](#file-explorer)
  - [Browsing Files](#browsing-files)
  - [Creating Files and Folders](#creating-files-and-folders)
  - [Renaming and Deleting](#renaming-and-deleting)
  - [File Preview](#file-preview)
- [Preview Panel](#preview-panel)
  - [Markdown Rendering](#markdown-rendering)
  - [Code Highlighting](#code-highlighting)
  - [Image Display](#image-display)
- [Agent Apps](#agent-apps)
  - [What Are Agent Apps?](#what-are-agent-apps)
  - [Native Apps](#native-apps)
  - [Custom Scripts](#custom-scripts)
  - [Activating Apps](#activating-apps)
  - [Harness Triggers](#harness-triggers)
- [MCP Servers](#mcp-servers)
  - [What Is MCP?](#what-is-mcp)
  - [Connecting a Server](#connecting-a-server)
  - [Tool Discovery](#tool-discovery)
  - [Managing Connections](#managing-connections)
- [Pane System](#pane-system)
  - [Split Views](#split-views)
  - [Drag and Drop](#drag-and-drop)
  - [Layout Persistence](#layout-persistence)
- [Docker Sandbox](#docker-sandbox)
  - [Enabling Sandbox Mode](#enabling-sandbox-mode)
  - [Container Configuration](#container-configuration)
  - [Resource Limits](#resource-limits)
- [Observability](#observability)
  - [Metrics Dashboard](#metrics-dashboard)
  - [Logs](#logs)
  - [Audit Trail](#audit-trail)
- [Themes and Appearance](#themes-and-appearance)
- [Settings Reference](#settings-reference)
- [Data and Privacy](#data-and-privacy)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS** | macOS 12+, Ubuntu 22.04+, Windows 10+ | macOS 14+, latest LTS Linux |
| **RAM** | 4 GB | 8 GB+ |
| **Disk** | 500 MB (app) | 2 GB+ (with local models via Ollama) |
| **Display** | 960 x 600 | 1280 x 800+ |

For building from source, you also need:
- **Node.js** 18+
- **pnpm** 8+
- **Rust** 1.70+ (via [rustup](https://rustup.rs/))
- **Xcode CLI Tools** (macOS only): `xcode-select --install`

### Installation

#### From Source

```bash
git clone https://github.com/Hyuain/mindeck.git
cd mindeck
pnpm install
pnpm tauri dev     # Development mode with hot reload
```

#### Production Build

```bash
pnpm tauri build
```

The bundled application appears in `src-tauri/target/release/bundle/`.

### First Launch

When Mindeck starts for the first time, it automatically creates the data directory at `~/.mindeck/` with the following structure:

```
~/.mindeck/
├── providers/       # Your API provider configurations
├── workspaces/      # Workspace data (conversations, files, memory)
├── skills/          # Global skill definitions
├── scripts/         # Custom TypeScript agent scripts
├── logs/            # Application logs
└── cache/           # Temporary files
```

**Your first steps:**

1. Open **Settings** (gear icon in titlebar, or press `Cmd+,` / `Ctrl+,`)
2. Navigate to **Providers** and add at least one LLM provider
3. Return to the main view and create your first workspace
4. Start chatting!

---

## Interface Overview

### Three-Column Layout

Mindeck uses a permanent three-column layout:

```
┌──────────────┬────────────────────┬──────────────────┐
│  MAJORDOMO   │    WORKSPACE       │   RIGHT PANEL    │
│  (Column 1)  │    (Column 2)      │   (Column 3)     │
│              │                    │                  │
│  - Workspace │  - Chat panel      │  - Files tab     │
│    list      │  - Split panes     │  - Skills tab    │
│  - Tasks     │  - File previews   │  - Git tab       │
│  - Chat      │  - Agent apps      │  - Agents panel  │
│              │                    │                  │
└──────────────┴────────────────────┴──────────────────┘
```

- **Column 1 (Majordomo)**: Violet accent. Cross-workspace orchestrator — manages workspaces, dispatches tasks, shows aggregated results.
- **Column 2 (Workspace)**: Emerald accent. Your active workspace with chat, file previews, and split panes.
- **Column 3 (Right Panel)**: Tabbed panel for file explorer, skill management, git (planned), and agent app configuration.

All column borders are **draggable** — hover over a border to see the resize cursor, then drag to adjust widths.

### Titlebar

The titlebar contains:
- **Mindeck logo** (left)
- **Search** (center) — opens the Command Palette
- **Theme toggle** (sun/moon icon) — switch between dark and light themes
- **Observability** — open the metrics dashboard
- **Settings** (gear icon) — open the settings modal

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open Command Palette |
| `Cmd+,` / `Ctrl+,` | Open Settings |
| `Enter` | Send message |
| `Shift+Enter` | New line in chat input |
| `Escape` | Close modals, palettes, dropdowns |
| `/` | Activate slash command (skill selection) |
| `Arrow Up/Down` | Navigate skill dropdown |
| `Tab` | Select highlighted skill |
| `Backspace` (empty input) | Remove last skill chip |

---

## Providers

Providers are the LLM services that power your workspace agents and Majordomo.

### Adding a Provider

1. Open **Settings** > **Providers**
2. Click **Add Provider**
3. Choose a preset (DeepSeek, Qwen, MiniMax, OpenAI-compatible, Ollama) or configure manually
4. Enter:
   - **Name**: A display name for this provider
   - **Base URL**: The API endpoint (e.g., `https://api.deepseek.com/v1`)
   - **API Key**: Your secret key (stored in OS Keychain)
5. Click **Validate** to test the connection
6. If validation succeeds, the provider appears with a green status indicator

### Supported Providers

| Provider | Type | Notes |
|----------|------|-------|
| **Ollama** | Local | No API key needed. Runs models locally. |
| **DeepSeek** | OpenAI-compatible | Strong coding and reasoning models. |
| **Qwen** (Alibaba) | OpenAI-compatible | Multi-modal, strong multilingual support. |
| **MiniMax** | Anthropic-format | Uses Anthropic message format (`tool_use` blocks). |
| **OpenAI** | OpenAI-compatible | GPT-4, GPT-3.5, etc. |
| **Groq** | OpenAI-compatible | Fast inference. |
| **Together AI** | OpenAI-compatible | Open-source model hosting. |
| Any OpenAI-compatible API | OpenAI-compatible | Works with any `/v1/chat/completions` endpoint. |

### API Key Security

Your API keys are **never written to disk** in plain text. Mindeck stores them exclusively in your operating system's secure credential store:

- **macOS**: Keychain Access
- **Linux**: Secret Service (GNOME Keyring / KDE Wallet)
- **Windows**: Windows Credential Manager

Keys are referenced in the app by alias only (e.g., `provider-deepseek`). Even if someone accesses your `~/.mindeck/` directory, they cannot recover your API keys.

### Model Selection

After adding a provider and validating the connection, Mindeck discovers available models automatically. You can:

- Set a **default model** per provider
- Select a specific model per workspace (in workspace settings)
- Select a model per Majordomo session (in the Majordomo input area)

Models display their context length and capabilities (function calling, vision, thinking).

### Health Checks

Each provider shows a status indicator:
- **Green**: Connected and responding
- **Yellow**: Slow or intermittent
- **Red**: Unreachable or authentication failed

Click **Validate** on any provider card to re-check the connection.

---

## Workspaces

Workspaces are isolated environments where you interact with an AI agent. Each workspace has its own conversation history, file context, agent configuration, and tool access.

### Creating a Workspace

1. In the **Majordomo panel** (left column), click the **+** button
2. Choose a template:
   - **Blank**: Empty workspace
   - **Basic**: Standard chat workspace
   - **Advanced**: Full agentic loop enabled
   - **Testing**: Pre-configured for test workflows
   - **Integration**: External service integration setup
3. Give it a name
4. The workspace appears in the Majordomo workspace list

### Workspace Types

| Type | Description |
|------|-------------|
| **Internal** | Self-contained workspace. Files stored in `~/.mindeck/workspaces/<id>/files/`. |
| **Linked** | Linked to a local Git repository or folder. File operations work on the linked path. |

To link a workspace to a folder, set the **Content Root** in workspace settings.

### Workspace Settings

Access workspace settings via the gear icon in the workspace tab or agent panel. Configuration includes:

- **Name and icon**: Display identity
- **Provider & model**: Which LLM to use for this workspace
- **System prompt**: Custom instructions for the workspace agent
- **Enable agentic loop**: Toggle full tool-calling mode (vs simple chat)
- **Task intent**: Controls which tools are available
  - `read-only`: No file writes or shell execution
  - `analysis`: Read + analyze, no mutations
  - `mutation`: Full file write access
  - `full`: All tools including shell and network
- **Planning / Execution / Verification models**: Use different models for different phases
- **Content root**: Link to a local folder or Git repo
- **MCP dependencies**: Attached MCP servers
- **Sandbox mode**: Docker container isolation

### Switching Workspaces

Click any workspace in the Majordomo workspace list. The center column updates to show that workspace's chat and panes. Layout state is preserved per workspace.

### Deleting a Workspace

Right-click a workspace in the list (or use the delete button). A confirmation dialog appears. Deletion removes all workspace data including conversations and files.

---

## Chat

### Sending Messages

Type your message in the input area at the bottom of the workspace panel and press **Enter**. The message is sent to the workspace's configured LLM provider and model.

**Multi-line input**: Press `Shift+Enter` to add a new line without sending.

### Streaming Responses

Responses stream in real-time as the LLM generates them. During streaming:
- The send button shows a loading indicator
- Input is disabled until the response completes
- The message list auto-scrolls to show new content (if you're near the bottom)

### Conversation History

Conversations are persisted to JSONL files at `~/.mindeck/workspaces/<id>/conversations/main.jsonl`. When you switch workspaces and come back, your full conversation history is restored.

Each message records:
- Role (user, assistant, system, tool)
- Content (text, tool calls, tool results)
- Timestamp
- Provider and model used
- Source metadata (user, majordomo dispatch, sub-agent)

### Clearing Conversations

Use the clear button in the chat panel header. The current conversation file is backed up as `main.jsonl.bak` before clearing, so you can recover it if needed.

---

## Majordomo

### What Is Majordomo?

Majordomo is Mindeck's **cross-workspace orchestrator** — a system-level agent that sits above all your workspaces. Think of it as a project manager that can:

- See the status of all workspaces
- Dispatch tasks to specific workspace agents
- Aggregate results from multiple workspaces
- Coordinate multi-step workflows

Majordomo lives in the left column (violet accent) and has its own persistent conversation history.

### Dispatching Tasks

When you chat with Majordomo, it can use the `dispatch_to_workspace` tool to send tasks to workspace agents. For example:

> "Analyze the API endpoints in the Backend workspace and summarize the authentication flow"

Majordomo will:
1. Identify the target workspace ("Backend")
2. Dispatch the analysis task
3. Wait for the workspace agent to complete
4. Present the results in the Majordomo panel

You can also ask Majordomo to coordinate across multiple workspaces:

> "Run the tests in the Backend workspace and update the documentation in the Docs workspace based on any API changes"

### Viewing Results

When a workspace agent completes a dispatched task, the result appears in the Majordomo panel as a **result card** — a bordered card with full markdown rendering showing the workspace name, task summary, and detailed output.

### Task Status Tracking

Each dispatched task shows a status indicator:

| Status | Meaning |
|--------|---------|
| **Pending** | Task created, waiting to be picked up |
| **Received** | Workspace agent acknowledged the task |
| **Processing** | Agent is actively working on it |
| **Completed** | Task finished successfully |
| **Failed** | Task encountered an error (can be retried) |

Failed tasks can be retried from the task list. Old tasks are automatically pruned (max 30 per workspace).

---

## Agentic Mode

### Enabling the Agentic Loop

By default, workspaces operate in simple chat mode. To enable the full agentic loop:

1. Open workspace settings
2. Toggle **Enable Agentic Loop** on
3. Choose a **Task Intent** (controls available tools)

When enabled, the agent can use tools, make multi-turn decisions, and execute complex workflows autonomously.

### Built-in Tools

| Tool | Description | Intent Required |
|------|-------------|----------------|
| `list_dir` | List files and folders in a directory | `read-only`+ |
| `read_file` | Read the contents of a file | `read-only`+ |
| `write_file` | Create or overwrite a file | `mutation`+ |
| `delete_path` | Delete a file or directory recursively | `mutation`+ |
| `bash_exec` | Execute a shell command | `full` only |
| `web_fetch` | Fetch content from a URL | `full` only |
| `report_to_majordomo` | Send results back to Majordomo | All intents |

Additional workspace-scoped tools:
| Tool | Description |
|------|-------------|
| `spawn_sub_agent` | Delegate a subtask to a new sub-agent |
| `spawn_sub_agent_team` | Run multiple sub-agents in parallel |

### Tool Activity Monitoring

When the agent uses tools, each call appears as a **tool activity row** showing:
- Tool name and status (running/done/error)
- Expandable view of arguments passed
- Expandable view of results returned
- Sub-agent badges (emerald) for delegated work
- Syntax-highlighted JSON for complex arguments/results

### Permission Requests

Sensitive operations require your explicit approval:

- **Shell execution** (`bash_exec`): Shows the command to be run
- **Network access** (`web_fetch`): Shows the URL to be fetched
- **File writes** in certain contexts

A permission request appears as a shield icon with **Grant** / **Deny** buttons. The agent pauses until you respond.

### Sub-Agent Spawning

Workspace agents can delegate subtasks to sub-agents:

- **`spawn_sub_agent(name, task)`**: Creates a single sub-agent with a specific task. The sub-agent runs to completion and returns results.
- **`spawn_sub_agent_team(agents[])`**: Creates multiple sub-agents that run **in parallel** and return all results together.

Sub-agents inherit global tools but cannot spawn their own sub-agents (prevents infinite nesting).

### Doom-Loop Protection

The agentic loop includes built-in protection against infinite cycles:

- **Max iterations**: 25 turns per invocation
- **Pattern detection**: Tracks the last 6 tool call signatures. If only 2 or fewer unique patterns are detected, the loop breaks automatically.
- **Self-verification**: Optional follow-up loop after main execution to verify results.

### Context Compaction

For long-running conversations that exceed ~100k estimated tokens:

1. **Sliding window**: Keeps the last 10 turns plus the system prompt
2. **AI summarization**: Uses the LLM to compress older context into a summary
3. **Automatic**: Triggered transparently during the agentic loop

---

## Skills

### What Are Skills?

Skills are reusable instruction sets that modify agent behavior for specific tasks. They can inject system prompts, restrict tool access, and provide domain-specific guidance.

### Using Skills (Slash Commands)

Type `/` in the chat input to see available skills. Continue typing to filter:

```
/code-review     → Activates the code review skill
/translate       → Activates the translation skill
```

Selected skills appear as **chips** above the input field. They apply to the next message only (ephemeral) unless pinned globally.

### Skill Auto-Suggestions

When your message is longer than 10 characters, Mindeck may suggest relevant skills based on content matching. The suggestion bar appears above the input — click a suggestion to activate it, or dismiss to hide suggestions for the current input.

### Global vs Workspace Skills

| Scope | Location | Managed In |
|-------|----------|-----------|
| **Global** | `~/.mindeck/skills/` | Right Panel > Skills (top half) |
| **Workspace** | Workspace content root | Right Panel > Skills (bottom half) |

Global skills are available in all workspaces. Workspace skills are scoped to their workspace and discovered automatically from standard paths.

### Creating Custom Skills

Skills are defined as `SKILL.md` files with YAML frontmatter:

```markdown
---
name: code-review
description: Review code for quality, security, and best practices
version: 1.0.0
author: Your Name
tags:
  - development
  - review
tools:
  - read_file
  - list_dir
---

You are a senior code reviewer. When reviewing code:

1. Check for security vulnerabilities (injection, XSS, CSRF)
2. Verify error handling is comprehensive
3. Look for performance issues
4. Ensure code follows project conventions
5. Suggest improvements with specific examples

Be constructive and explain the "why" behind each suggestion.
```

Save this file to `~/.mindeck/skills/` for global access, or to your workspace's `.mindeck/skills/` directory for workspace-scoped access.

**Skill fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier (used as slash command) |
| `description` | Yes | One-line description shown in UI |
| `version` | No | Semantic version |
| `author` | No | Creator name |
| `tags` | No | Categorization tags |
| `tools` | No | Restrict which tools the agent can use with this skill |
| `allowedTools` | No | Explicit tool allowlist |
| `license` | No | License identifier |

The body after the frontmatter is the skill's **instructions** — injected into the system prompt when the skill is active.

### Skill Discovery Paths

Mindeck searches for skills in these locations (in order):

1. `~/.mindeck/skills/` — Global user skills
2. `~/.claude/skills/` — Shared with Claude Code
3. `<workspace>/.agents/skills/` — Workspace agent skills
4. `<workspace>/.claude/skills/` — Workspace Claude skills
5. `<workspace>/.mindeck/skills/` — Workspace Mindeck skills
6. `<workspace>/.opencode/skills/` — OpenCode compatibility
7. `~/.claude/plugins/cache/<source>/<package>/<version>/` — Plugin cache

Both `SKILL.md` (frontmatter format) and legacy JSON formats are supported.

---

## File Explorer

### Browsing Files

The **Files** tab in the right panel shows the file tree of your workspace's content root. Click folders to expand/collapse them. The tree auto-refreshes when the app window regains focus.

### Creating Files and Folders

Use the **+** buttons at the top of the file explorer:
- **New file**: Creates an empty file (enter the name in the prompt)
- **New folder**: Creates a directory

### Renaming and Deleting

- **Rename**: Double-click a file/folder name, or right-click > Rename
- **Delete**: Right-click > Delete (confirmation dialog appears)

### File Preview

Click any file to open it in a preview pane within your workspace. The renderer is chosen automatically based on file extension.

---

## Preview Panel

### Markdown Rendering

Files ending in `.md` render as GitHub Flavored Markdown with:
- Tables
- Strikethrough
- Task lists
- Syntax-highlighted code blocks
- Safe link handling

### Code Highlighting

Source code files (`.ts`, `.tsx`, `.js`, `.py`, `.rs`, `.go`, etc.) display with full syntax highlighting via highlight.js. The language is detected from the file extension.

### Image Display

Image files (`.png`, `.jpg`, `.gif`, `.svg`, etc.) render inline with responsive scaling.

---

## Agent Apps

### What Are Agent Apps?

Agent Apps extend workspace agents with additional capabilities. They come in three kinds:

| Kind | Description | Example |
|------|-------------|---------|
| **System** | Built into Mindeck | Core tools |
| **Native** | Pre-built integrations | TypeScript compiler, ESLint, test runner |
| **Custom** | User-defined scripts | `~/.mindeck/scripts/*.ts` |

### Native Apps

Native apps provide integration with development tools:

- **TypeScript Compiler** (`tsc`): Type-check your workspace files
- **ESLint**: Lint workspace code
- **Test Runner**: Execute workspace tests

### Custom Scripts

Write TypeScript scripts in `~/.mindeck/scripts/` to create custom Agent Apps:

```typescript
// ~/.mindeck/scripts/my-tool.ts
export default function(ctx) {
  // ctx.workspaceId — current workspace
  // ctx.executeTool(name, args) — invoke built-in tools
  // ctx.log(message) — log output
  // ctx.onFileWritten(path, callback) — react to file changes

  return {
    name: "my-custom-tool",
    description: "Does something useful",
    execute: async (args) => {
      // Your tool logic here
      return { result: "done" };
    }
  };
}
```

### Activating Apps

1. Open the **Agents** panel in the right column
2. Click the **+** button to open the App Catalog
3. Browse or search for an app
4. Click **Install** to activate it in the current workspace

Activated apps appear as nodes in the Agents panel with status indicators.

### Harness Triggers

The Harness Engine auto-runs apps in response to events:

- **File write triggers**: Run an app when a file matching a glob pattern is written (e.g., `*.ts` triggers TypeScript checking)
- **Tool completion triggers**: Run an app when a specific tool finishes

Configure triggers in the app's manifest or workspace settings.

---

## MCP Servers

### What Is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) is an open standard for connecting AI agents to external tools and data sources. Mindeck supports MCP as both a client (connecting to MCP servers) and for tool discovery.

### Connecting a Server

1. Open **Settings** > **MCP Servers** (or configure in workspace settings)
2. Add a server with:
   - **Name**: Display identifier
   - **Transport**: `stdio` (subprocess) or `sse` (HTTP)
   - **Command** (for stdio): The command to start the server (e.g., `npx @modelcontextprotocol/server-filesystem`)
   - **Args**: Command arguments
   - **Env**: Environment variables
   - **URL** (for SSE): The server endpoint

### Tool Discovery

When an MCP server connects, Mindeck automatically discovers all tools it provides. These tools become available to the workspace agent alongside built-in tools.

Discovered tools show in the Agents panel under the connected server node.

### Managing Connections

Each MCP server shows a status badge:
- **Connected**: Active and providing tools
- **Connecting**: Handshake in progress
- **Error**: Connection failed (right-click > Reconnect to retry)

You can disconnect, reconnect, or remove servers from the Agents panel context menu.

---

## Pane System

### Split Views

The workspace area supports unlimited splits:

- **Horizontal split**: Side-by-side panes
- **Vertical split**: Stacked panes

Each pane can contain a chat panel, file preview, or agent app view.

### Drag and Drop

Drag pane headers to:
- Reorder panes within a split
- Move panes to a different split
- Create new splits by dropping at edges

A visual preview shows where the pane will land during drag.

### Layout Persistence

Pane arrangements are saved per workspace and restored when you switch back. Layout saves are debounced (500ms delay) to avoid excessive writes during resize operations.

---

## Docker Sandbox

### Enabling Sandbox Mode

For enhanced security, you can run workspace agent tool calls inside a Docker container:

1. Ensure Docker is installed and running
2. Open workspace settings
3. Enable **Sandbox Mode** under Orchestrator Config
4. Configure the container settings

### Container Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| **Image** | `node:20-slim` | Docker image to use |
| **Network Mode** | `none` | Network access (`none`, `bridge`, `host`) |
| **CPUs** | 1 | CPU limit |
| **Memory** | 512 MB | Memory limit |
| **Timeout** | 30000 ms | Per-execution timeout |

### Resource Limits

The sandbox enforces resource limits to prevent runaway processes:
- CPU allocation is capped
- Memory is hard-limited (OOM kills if exceeded)
- Each command execution has a timeout
- Network can be fully disabled (`none`) for maximum isolation

When sandbox mode is enabled, `bash_exec` calls are routed through the container. File operations still work on the mounted workspace directory.

---

## Observability

### Metrics Dashboard

Click the **chart icon** in the titlebar to open the Observability Dashboard. It shows per-workspace metrics:

- **Tool call count**: Total tools invoked
- **Success rate**: Percentage of successful tool calls
- **Estimated tokens**: Approximate token consumption
- **Loop count**: Number of full agentic loop executions
- **Top tools chart**: Bar chart of the 8 most-used tools with error rates

Toggle between per-workspace and aggregate views.

### Logs

Application logs are written to `~/.mindeck/logs/mindeck.log` with structured JSON entries. Logs are batched (every 1 second or 50 lines) for performance.

A circular buffer of the last 500 log entries is also kept in memory for quick access.

### Audit Trail

Security-relevant events are logged to `~/.mindeck/audit.jsonl`:
- Prompt injection detections
- Permission grants/denials
- Sensitive tool calls
- Authentication events

Each entry is a JSON object with timestamp, event type, and details.

---

## Themes and Appearance

Mindeck supports two themes:

### Dark Theme (Default)
- **Background**: `#111110` (warm near-black with brown undertone)
- **Workspace accent**: Emerald (`#10b981`)
- **Majordomo accent**: Violet (`#a78bfa`)

### Light Theme
- **Background**: `#ede8e0` (warm parchment)
- **Workspace accent**: Emerald (`#059669`)
- **Majordomo accent**: Violet (`#7c3aed`)

Toggle with the **sun/moon icon** in the titlebar. The theme persists across sessions.

**Typography:**
- **UI text**: Plus Jakarta Sans
- **Code / monospace**: JetBrains Mono

---

## Settings Reference

Open Settings via the gear icon or `Cmd+,` / `Ctrl+,`. The settings modal has these sections:

| Section | Contents |
|---------|----------|
| **Providers** | Add/remove/configure LLM providers and API keys |
| **Majordomo** | Majordomo-specific configuration |
| **General** | Application-wide preferences |
| **Appearance** | Theme and display settings |
| **Storage** | Data directory and cleanup options |
| **Shortcuts** | Keyboard shortcut customization |
| **MCP Servers** | Global MCP server management |

---

## Data and Privacy

### Local-First Philosophy

Mindeck is designed to keep your data on your machine:

- **Conversations**: Stored as JSONL files in `~/.mindeck/workspaces/`
- **API keys**: OS Keychain only (never written to files)
- **Workspace data**: JSON metadata files
- **No telemetry**: Mindeck does not phone home or send usage data
- **No cloud dependency**: Works fully offline (with local models via Ollama)

### Data Portability

Conversations are stored in human-readable JSONL format — one JSON object per line. You can read, process, or migrate this data with any tool that handles JSON.

Skills use the `SKILL.md` format (Markdown with YAML frontmatter) — portable and version-control friendly.

### Backup

To back up all Mindeck data:

```bash
cp -r ~/.mindeck ~/mindeck-backup-$(date +%Y%m%d)
```

To restore, copy the backup back to `~/.mindeck/`.

---

## Troubleshooting

### App won't start on macOS 26

macOS 26 (Sequoia) requires code signing for native apps. After building:

```bash
codesign --force --sign - --entitlements src-tauri/entitlements.plist \
  src-tauri/target/debug/mindeck
```

Or use `pnpm tauri dev` which handles signing automatically.

### Provider shows "Offline" status

1. Check that the API endpoint is reachable from your network
2. Verify the API key is correct (re-enter in Settings > Providers)
3. Click **Validate** to test the connection
4. For Ollama, ensure the Ollama service is running (`ollama serve`)

### Agent seems stuck in a loop

The doom-loop protection should break infinite cycles automatically after detecting repetitive patterns. If it doesn't:

1. The agent will stop after 25 iterations maximum
2. You can start a new message to interrupt the current flow
3. Try adjusting the task intent to limit available tools

### Missing files in File Explorer

- Check that the workspace content root is set correctly (workspace settings)
- The file explorer hides dotfiles by default
- Click elsewhere and back, or refocus the window to trigger a refresh

### MCP server won't connect

1. Verify the command is installed and in your PATH
2. Check that the command arguments are correct
3. Look at `~/.mindeck/logs/mindeck.log` for connection error details
4. Try running the MCP command manually in a terminal to verify it works

### High memory usage

- Long conversations accumulate tokens. Use **Clear Conversation** periodically.
- Context compaction kicks in automatically at ~100k estimated tokens
- Close unused workspaces to free workspace agent resources
- Reduce the number of active MCP servers

### Build errors

```bash
# Clean and rebuild
rm -rf node_modules src-tauri/target
pnpm install
pnpm tauri dev
```

For Rust-specific issues:
```bash
cargo clean --manifest-path src-tauri/Cargo.toml
cargo build --manifest-path src-tauri/Cargo.toml
```

---

## Getting Help

- **GitHub Issues**: Report bugs and request features
- **Discussions**: Ask questions and share workflows
- **Contributing**: See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines
