# Mindeck Documentation

> Local-first, multi-workspace AI agent OS. Tauri 2.x + React 19 + TypeScript.

---

## Quick Orientation

```
Majordomo (global orchestrator, violet)
  ├── EventBus + TaskStore (async messaging, crash recovery)
  ├── Workspace A ─── Sandbox Policy
  │     ├── Main Agent (WorkspaceAgent)
  │     │     └── Sub-Agents (spawn_sub_agent)
  │     ├── Agent Apps (MCP, native, script)
  │     └── Harness Engine (triggers → feedback loops)
  ├── Workspace B
  └── Workspace C
```

**Key concepts**:
- **Majordomo** — global orchestrator that dispatches tasks across workspaces
- **Workspace** — execution boundary with its own sandbox policy, agent, and apps
- **Agent Apps** — composable applications (MCP, native, script) managed by the workspace agent
- **Harness Engine** — four pillars (Constrain, Verify, Inform, Correct) that make agents reliable

**Core differentiators**: Harness-first orchestration, Agent App abstraction, multi-workspace isolation, BYOK + local-first data.

**Target users**: Restricted-region developers (CN/VN/IR) who need BYOK providers (Ollama, DeepSeek, Qwen).

---

## Recommended Reading Order

1. [overview](./architecture/overview.md) — system design, data flows, module map
2. [orchestration](./architecture/orchestration.md) — three-tier agent hierarchy
3. [agent-apps](./architecture/agent-apps.md) — composable application abstraction
4. [harness-engine](./architecture/harness-engine.md) — harness engineering pillars
5. [sandbox](./architecture/sandbox.md) — security model and isolation layers
6. [mcp-integration](./architecture/mcp-integration.md) — MCP dual-tier model
7. [ui-layout](./architecture/ui-layout.md) — three-column layout and design system

---

## Docs Index

### Architecture

System design — how Mindeck works today and where it's going.

| Document | Summary |
|----------|---------|
| [overview](./architecture/overview.md) | System overview, data flows, module map, file structure |
| [agent-apps](./architecture/agent-apps.md) | Agent App abstraction — manifest, three kinds (system/native/custom), lifecycle, source adapters |
| [mcp-integration](./architecture/mcp-integration.md) | MCP dual-tier model, MCP Apps compatibility |
| [orchestration](./architecture/orchestration.md) | Three-tier hierarchy, communication protocols |
| [harness-engine](./architecture/harness-engine.md) | Harness engineering pillars, triggers, feedback loops |
| [sandbox](./architecture/sandbox.md) | Three-layer sandbox design, permission inheritance |
| [ui-layout](./architecture/ui-layout.md) | Three-column layout, design tokens, pane system |

### Decisions

Why we made certain design choices.

| Document | Summary |
|----------|---------|
| [agent-app-rationale](./decisions/agent-app-rationale.md) | FAQ: why Agent App, why not just MCP, sandbox design, etc. |
| [design-divergences](./decisions/design-divergences.md) | Where implementation consciously diverged from spec |

### Project Tracking

| Document | Summary |
|----------|---------|
| [status](./status.md) | Milestone completion, gaps, harness pillar coverage |
| [roadmap](./roadmap.md) | Prioritized TODO list with checkboxes |
| [references](./references.md) | Industry context, competitive landscape, external links |
