# Agent Orchestration

> Three-tier agent hierarchy and communication protocols.
>
> Related: [agent-apps](./agent-apps.md) · [harness-engine](./harness-engine.md) · [sandbox](./sandbox.md)

---

## Three-Tier Hierarchy

```
Majordomo (global orchestrator)
  │
  ├── EventBus + TaskStore
  │     dispatch → status → result (crash-recoverable)
  │
  ├── Workspace A ─── Sandbox Policy ────────────────
  │     ├── Orchestrator Agent App (Main Agent, singleton)
  │     │     ├── Chat Pane (UI)
  │     │     ├── builtins: bash_exec, write_file, list_dir, ...
  │     │     ├── Sub-Agent (inherits sandbox, or stricter)
  │     │     └── Sub-Agent Team (parallel via Promise.all)
  │     │
  │     ├── FlexibleWorkspace
  │     │     ├── Pane: Agent App "GitHub PR"    (tool-provider, MCP)
  │     │     ├── Pane: Agent App "Linter"       (autonomous, native)
  │     │     └── Pane: Agent App "Test Runner"  (autonomous, script)
  │     │
  │     ├── MCP Dependencies (Tier 1 — tool-only, no manifest)
  │     └── App Registry (per-workspace)
  │
  ├── Workspace B ─── Sandbox Policy: read-only ────
  └── Global App Catalog
```

All tool execution — orchestrator, Agent Apps, sub-agents — goes through the workspace's `SandboxEnforcer`. The sandbox boundary is the workspace, not the individual agent.

---

## Communication Protocols

### Orchestrator ↔ Agent App

```
┌──────────────────┐                    ┌──────────────────┐
│  Orchestrator    │ ── invoke_tool ──▶ │   Agent App      │
│  (Main Agent)    │ ── dispatch_task ─▶│                  │
│                  │ ── context_push ──▶│                  │
│                  │ ◀── report_result ─│                  │
│                  │ ◀── request_ctx ───│                  │
│                  │ ◀── emit_event ────│                  │
└──────┬───────────┘                    └──────────────────┘
       │ spawn_sub_agent (inherits sandbox)
       ▼
┌──────────────────┐
│   Sub-Agent      │
│   (ephemeral)    │
└──────────────────┘
```

**Downward (Orchestrator → Agent App)**:

| Message | Description | Kinds |
|---------|-------------|-------|
| `app:invoke_tool` | Call one of the app's tools | tool-provider, autonomous |
| `app:dispatch_task` | Send a task for autonomous execution | autonomous |
| `app:context_update` | Push workspace context (file changes, results) | autonomous, viewer |
| `app:configure` | Update runtime configuration | all |
| `app:shutdown` | Graceful shutdown | all |

**Upward (Agent App → Orchestrator)**:

| Message | Description | Kinds |
|---------|-------------|-------|
| `agent:report_result` | Return tool result or task completion | tool-provider, autonomous |
| `agent:request_context` | Ask for workspace context | autonomous |
| `agent:request_tool` | Ask orchestrator to call a workspace tool (subject to sandbox) | autonomous |
| `agent:emit_event` | Emit to workspace event bus | autonomous, tool-provider |
| `agent:request_ui_update` | Ask pane to re-render | all with UI |

**Downward (Majordomo → Orchestrator)**:

| Message | Description |
|---------|-------------|
| `workspace:dispatch_task` | Majordomo sends a task for this workspace |
| `workspace:context_update` | Cross-workspace context (results from another workspace) |

### Agent App ↔ UI Pane

```
┌──────────────────┐                    ┌──────────────────┐
│   Agent App      │ ── render_data ──▶ │  FlexibleWorkspace│
│   (backend)      │ ◀── user_action ── │  Pane (UI)       │
│                  │ ── state_update ──▶│                  │
└──────────────────┘                    └──────────────────┘
```

Rendering varies by source:

| Source | Rendering |
|--------|-----------|
| MCP App (`ui://`) | Sandboxed iframe, JSON-RPC over `postMessage` |
| Native | React component, full access to design tokens + stores |
| A2UI (future) | JSON blueprint → native React components |
| Script | iframe (sandboxed) or native (if trusted) |

### Agent App ↔ Sibling Apps

Agent Apps do **not** communicate directly. All inter-app communication goes through the workspace event bus, mediated by the main agent.

```
App A ──emit_event──▶ EventBus ──▶ Main Agent ──▶ decides what to do
                                        ├── invoke App B's tool
                                        ├── dispatch task to App C
                                        └── ignore / log
```

Why no direct P2P:
- Main agent maintains oversight + harness enforcement
- Prevents token-consuming app-to-app chatter
- Simpler security model — each app only talks to main agent
- Consistent with hierarchical orchestration philosophy

---

## Relationship to Existing Concepts

| Existing Concept | Evolution |
|-----------------|-----------|
| `WorkspaceAgent` | Becomes the orchestrator Agent App. Same class, modeled with implicit manifest |
| `PaneType: "agent" \| "file"` | Extended to `"agent" \| "file" \| "agent-app"` |
| `spawn_sub_agent` | An Agent App with `kind: "autonomous"` is a persistent, visible version of a sub-agent |
| Built-in tools | Belong to the orchestrator's tool set. All pass through `SandboxEnforcer` |
| MCP server | Imported as Agent App via MCP adapter |
| Skills | A Skill is a "headless Agent App" — system prompt + tool subset with no UI |
