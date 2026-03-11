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
  │     │     ├── Pane: Agent App "GitHub PR"    (custom, MCP)
  │     │     ├── Pane: Agent App "Linter"       (native)
  │     │     └── Pane: Agent App "Test Runner"  (native)
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

> **Implementation note**: The protocol messages below describe the *target architecture*.
> The current implementation uses the event bus with different event names:
> `task:dispatch`, `task:status`, `task:result`, `file:written`, `tool:completed`, `harness:feedback`, `workspace:deleted`.
> These will be aligned as the Agent App system matures.

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

| Message | Description | Applicable To |
|---------|-------------|---------------|
| `app:invoke_tool` | Call one of the app's tools | Apps with tools |
| `app:dispatch_task` | Send a task for autonomous execution | Apps with `acceptsTasks` |
| `app:context_update` | Push workspace context (file changes, results) | Apps with tasks or UI |
| `app:configure` | Update runtime configuration | All |
| `app:shutdown` | Graceful shutdown | All |

**Upward (Agent App → Orchestrator)**:

| Message | Description | Applicable To |
|---------|-------------|---------------|
| `agent:report_result` | Return tool result or task completion | Apps with tools or tasks |
| `agent:request_context` | Ask for workspace context | Apps with `acceptsTasks` |
| `agent:request_tool` | Ask orchestrator to call a workspace tool (subject to sandbox) | Apps with `acceptsTasks` |
| `agent:emit_event` | Emit to workspace event bus | Apps with tools |
| `agent:request_ui_update` | Ask pane to re-render | Apps with UI |

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
| `WorkspaceAgent` | Separate class with `generateOrchestratorManifest()`. Not yet unified as an Agent App (see [design-divergences](../decisions/design-divergences.md#divergence-3)) |
| `PaneType: "agent" \| "file"` | Extended to `"agent" \| "file" \| "agent-app"` |
| `spawn_sub_agent` | Ephemeral via workspace tools. Persistent Agent Apps are the visible counterpart |
| Built-in tools | Belong to the orchestrator's tool set. All pass through `SandboxEnforcer` |
| MCP server | Imported as Agent App via MCP adapter |
| Skills | A Skill is a "headless Agent App" — system prompt + tool subset with no UI |
