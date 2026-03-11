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

**Core differentiators**: Harness-first orchestration, Agent App abstraction, multi-workspace isolation, BYOK + local-first data.

**Target users**: Restricted-region developers (CN/VN/IR) who need BYOK providers (Ollama, DeepSeek, Qwen).

---

## Docs Index

### Architecture

System design — how Mindeck works today and where it's going.

| Document | Summary |
|----------|---------|
| [overview](./architecture/overview.md) | System overview, data flows, module map, file structure |
| [agent-apps](./architecture/agent-apps.md) | Agent App abstraction — manifest, kinds, lifecycle, source adapters |
| [mcp-integration](./architecture/mcp-integration.md) | MCP dual-tier model, MCP Apps compatibility |
| [orchestration](./architecture/orchestration.md) | Three-tier hierarchy, communication protocols |
| [harness-engine](./architecture/harness-engine.md) | Harness engineering pillars, triggers, feedback loops |
| [sandbox](./architecture/sandbox.md) | Three-layer sandbox design, permission inheritance |
| [ui-layout](./architecture/ui-layout.md) | Three-column layout, design tokens, pane system |

### Decisions

Why we made certain design choices.

| Document | Summary |
|----------|---------|
| [agent-app-rationale](./decisions/agent-app-rationale.md) | FAQ: why Agent App, why not just MCP, why three kinds, etc. |
| [design-divergences](./decisions/design-divergences.md) | Where implementation consciously diverged from spec |

### Project Tracking

| Document | Summary |
|----------|---------|
| [status](./status.md) | Milestone completion, gaps, harness pillar coverage |
| [roadmap](./roadmap.md) | Prioritized TODO list with checkboxes |
| [references](./references.md) | Industry context, competitive landscape, external links |
