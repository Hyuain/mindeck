# System Overview

> High-level architecture, data flows, module map, and file structure.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2.x (Rust backend) |
| Frontend | React 19 + TypeScript (strict) + Vite |
| Styling | Tailwind CSS v4 + CSS custom properties |
| State | Zustand (immutable updates) |
| Persistence | JSONL (conversations), JSON (config), SQLite FTS5 (search) |
| Keys | OS Keychain (tauri-plugin-keychain) |
| Protocols | MCP (JSON-RPC 2.0, stdio + streamable-http) |

---

## Data Flow

### Chat → Agent Loop → Tool Execution

```
User input (ChatPanel / MajordomoPanel)
    ↓
WorkspaceAgent.send() / MajordomoAgent.send()
    ↓
messagesToAgentHistory(messages) → AgentMessage[]
    ↓
runAgent() → runAgentLoop()                  ← shared agent-runner.ts
    ↓
bridge.streamChat() → formatMessages()       ← per-provider: OpenAI / Anthropic / MiniMax
    ↓
invoke("stream_chat") → Rust HTTP POST
    ↓
StreamEvent(Chunk | ToolCallStart | ToolCallArgsDelta | ToolCallEnd | Done)
    ↓ via Tauri Channel
agentic-loop:
    onChunk → updateLastMessage
    tool calls → toolRegistry.execute() / extraExecutors
              → emit file:written / tool:completed
              → harness triggers (if configured)
              → loop until no tool calls or maxIterations
    ↓
intermediateMessages → conversation.appendMessage() → {workspaceId}/main.jsonl
    ↓
UI: MessageList ← useChatStore.messages[workspaceId]
```

### Permission Flow

```
tool call → requestPermission() → useMajordomoStore.pendingPermissions
                                → MajordomoPanel renders approval UI
                                → user approves/denies → Promise resolves
```

### Harness Flow

```
file:written / tool:completed events
    → harness-engine checks AgentAppManifest.harness.triggers
    → if match: run connected Agent App / script
    → if feedbackToAgent: emit harness:feedback → injected into next agent turn
```

---

## Key Modules

### Services

| Module | File | Responsibility |
|--------|------|---------------|
| Agent Runner | `services/agent-runner.ts` | Shared `runAgent()` + `messagesToAgentHistory()` |
| Agentic Loop | `services/agentic-loop.ts` | Core loop: stream, tool calls, execution, iteration |
| Workspace Agent | `services/workspace-agent.ts` | Per-workspace agent (sequential queue, sub-agents) |
| Majordomo Agent | `services/majordomo-agent.ts` | Global orchestrator service |
| Event Bus | `services/event-bus.ts` | Typed pub/sub: task:dispatch, task:status, task:result |
| MCP Manager | `services/mcp/manager.ts` | MCP connection pool (stdio + HTTP) |
| Harness Engine | `services/harness-engine.ts` | Trigger evaluation + Agent App activation |
| Context Compaction | `services/context-compaction.ts` | Token estimation + sliding window + compact API |
| Prompt Injection | `services/prompt-injection.ts` | Pattern-based detection + severity scoring |
| Docker Sandbox | `services/sandbox/docker-sandbox.ts` | Container isolation (Layer 2) |

### Tool System

| Category | Tools |
|----------|-------|
| Built-in (9) | `list_dir`, `read_file`, `write_file`, `delete_path`, `bash_exec`, `web_fetch`, `list_workspaces`, `dispatch_to_workspace`, `report_to_majordomo` |
| Workspace-scoped | `spawn_sub_agent`, `spawn_sub_agent_team` (injected via `extraExecutors`) |
| MCP tools | Dynamic — discovered from connected MCP servers |
| Agent App tools | Exposed via manifest `toolExposure` config |

### Stores (Zustand)

| Store | File | Key State |
|-------|------|-----------|
| workspace | `stores/workspace.ts` | Workspace CRUD, active workspace |
| chat | `stores/chat.ts` | Messages per workspaceId |
| provider | `stores/provider.ts` | Provider configs, active models |
| majordomo | `stores/majordomo.ts` | Majordomo messages, pending permissions |
| layout | `stores/layout.ts` | Panel widths, per-workspace pane layouts |
| skills | `stores/skills.ts` | Skills list, active skill IDs per workspace |
| agent-apps | `stores/agent-apps.ts` | MCP dependencies, Agent App manifests |
| ui | `stores/ui.ts` | UI state (modals, panels) |

---

## Design Principles

1. **Tools are real** — System prompts forbid describing actions without calling tools; audit detects violations
2. **Harness-first** — Every feature strengthens a harness pillar: [Constrain, Verify, Inform, Correct](./harness-engine.md)
3. **Always-connected agents** — AgentPool keeps workspace agents alive even when UI is unmounted
4. **Store-before-emit** — TaskStore written before EventBus dispatch; missed events recovered from store
5. **Immutability** — Zustand updates via spreads; parameters never mutated
6. **Agent App is the abstraction** — MCP is a source, not the primitive. See [agent-apps.md](./agent-apps.md)

---

## File Map

```
src/
  app/
    App.tsx                     — bootstrap, 3-column layout, event bus wiring
    globals.css                 — all component CSS + design tokens
  components/
    agents/
      AgentsPanel.tsx           — Agents + Apps tab (bot/plug toggle)
      AppCatalogPicker.tsx      — Agent App catalog browser
    chat/
      ChatPanel.tsx             — workspace chat UI
      ChatInput.tsx             — slash commands, skill suggestions
      SkillSuggestionBar.tsx    — auto-suggestion chips
      ToolResultBubble.tsx      — tool call result with injection warning
    majordomo/
      MajordomoPanel.tsx        — global orchestrator panel
      CommandPalette.tsx        — ⌘K command palette
    provider/
      ProviderSettings.tsx      — provider management UI
    ui/
      SlashCommandDropdown.tsx  — /skill autocomplete
    workspace/
      AgentAppPane.tsx          — MCP app pane
      FlexibleWorkspace.tsx     — split-pane workspace
      MCPServerForm.tsx         — add/edit MCP server form
      OrchestratorSettings.tsx  — workspace orchestrator config
  services/
    agent-runner.ts             — shared runAgent() + messagesToAgentHistory()
    agentic-loop.ts             — core loop, tool execution, streaming
    event-bus.ts                — typed in-process pub/sub
    workspace-agent.ts          — WorkspaceAgent service
    majordomo-agent.ts          — Majordomo service
    context-compaction.ts       — token estimation + compaction
    prompt-injection.ts         — detection + severity scoring
    mcp/
      manager.ts                — MCP connection pool
      client.ts                 — MCP client (stdio + HTTP)
      adapter.ts                — MCP → Agent App adapter
    tools/
      builtins.ts               — 9 built-in tools
      registry.ts               — global tool registry
      workspace-tools.ts        — workspace-scoped spawn tools
    skills/
      auto-matcher.ts           — TF-IDF scoring for skill suggestions
      context-injector.ts       — merge active skill prompts
      skill-discovery.ts        — SKILL.md discovery
    sandbox/
      docker-sandbox.ts         — Docker container isolation
    native-apps/
      eslint-app.ts             — ESLint Agent App
      tsc-app.ts                — TypeScript checker Agent App
      test-runner-app.ts        — Test runner Agent App
    observability/
      metrics-collector.ts      — JSONL-backed metrics
  stores/
    workspace.ts, chat.ts, provider.ts, majordomo.ts,
    layout.ts, skills.ts, agent-apps.ts, ui.ts
  types/
    index.ts                    — all shared TypeScript types
src-tauri/src/commands/
    keychain.rs                 — OS Keychain operations
    provider.rs                 — provider file I/O
    shell.rs                    — bash_exec + bash_exec_stream
    sandbox.rs                  — docker_start/exec/stop
    audit.rs                    — audit event JSONL
    observability.rs            — metrics JSONL
    mod.rs                      — command registry
```
