# Agent Apps

> Mindeck's first-class abstraction for composable, visual, agent-managed applications.
>
> Related: [mcp-integration](./mcp-integration.md) · [orchestration](./orchestration.md) · [harness-engine](./harness-engine.md) · [sandbox](./sandbox.md)

---

## Core Thesis

**Agent App is a Mindeck-native concept, not a wrapper around any single protocol.**

An Agent App is a self-contained unit of capability that lives inside a Workspace, can render itself as a pane in FlexibleWorkspace, and participates in the workspace's harness. MCP, A2UI, custom scripts, and native components are all *sources* that can be imported into the Agent App abstraction — but Agent App is the higher-level primitive.

```
┌─────────────────────────────────────────────────────────────┐
│                  Agent App (Mindeck's abstraction)           │
│                                                              │
│  ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Orchestrator │ │ MCP App  │ │ A2UI App │ │ Native   │   │
│  │ (Main Agent) │ │ (import) │ │ (future) │ │ (built-in│   │
│  │ singleton    │ │          │ │          │ │          │   │
│  └──────────────┘ └──────────┘ └──────────┘ └──────────┘   │
│        ▲                                                     │
│        └── All go through the same SandboxEnforcer           │
└─────────────────────────────────────────────────────────────┘
```

Why this matters:

1. **Mindeck owns its abstraction** — we define what an app is; MCP is one way to supply one
2. **Unified execution model** — sandbox enforcement, audit trails, permissions apply uniformly
3. **Future-proof** — if A2UI overtakes MCP Apps, we add an adapter; the contract stays the same
4. **Richer than any single protocol** — persistent state, harness feedback, sibling coordination
5. **Ecosystem potential** — third-party developers can build Agent Apps natively

---

## Manifest

Every Agent App is defined by a manifest — the contract between Mindeck and the app.

```typescript
interface AgentAppManifest {
  // Identity
  id: string                    // UUID or namespaced ("mcp:github", "native:linter")
  name: string
  version: string
  description: string
  icon?: string                 // Lucide icon name or data URI
  author?: string

  // Kind — determines lifecycle, resource consumption, interaction model
  kind: "orchestrator" | "tool-provider" | "autonomous" | "viewer"

  // Source — where this app comes from
  source:
    | { type: "mcp"; config: MCPSourceConfig }
    | { type: "native"; component: string }
    | { type: "script"; entryPoint: string; runtime: "deno" | "node" }
    | { type: "remote"; url: string }

  // What this app can do
  capabilities: {
    tools?: AgentAppToolDef[]       // Tools exposed to workspace
    ui?: { renderer: UIRenderer; minWidth?: number; minHeight?: number }
    acceptsTasks?: boolean          // Can receive tasks from orchestrator
    emitsEvents?: boolean           // Can emit to workspace event bus
  }

  // How tools appear in the main agent's tool list
  toolExposure: "direct" | "namespaced" | "isolated"

  // What the app is allowed to do
  permissions: {
    filesystem: "none" | "read" | "workspace-only" | "full"
    network: "none" | "same-origin" | "full"
    shell: boolean
    invokeOtherApps: boolean
  }

  // When/how the app runs
  lifecycle: {
    startup: "eager" | "lazy" | "on-trigger"
    persistence: "session" | "workspace" | "global"
    healthCheckInterval?: number
  }

  // Harness participation — see harness-engine.md
  harness?: {
    triggers?: HarnessTrigger[]
    feedbackToAgent: boolean
  }
}
```

---

## Four Kinds

```
┌──────────────┬─────────────────┬───────────────────┬────────────────┐
│ orchestrator │  tool-provider  │    autonomous     │    viewer      │
│ (internal)   │                 │                   │                │
├──────────────┼─────────────────┼───────────────────┼────────────────┤
│ THE conductor│ Passive         │ Active            │ Display-only   │
│ 1 per WS     │ Main agent      │ Has own agentic   │ No LLM/tools   │
│              │ calls its tools │ loop + tools      │ Renders data   │
│              │                 │                   │                │
│ Examples:    │ Examples:       │ Examples:         │ Examples:      │
│ WorkspaceAgent│ MCP GitHub     │ Code reviewer     │ Log viewer     │
│              │ DB connector    │ Test runner       │ Metrics dash   │
│              │ Search API      │ Security scanner  │ PR diff viewer │
│              │                 │                   │                │
│ LLM: yes     │ LLM cost: 0    │ LLM: per-run     │ LLM cost: 0   │
│ UI: chat     │ UI: optional    │ UI: chat/output   │ UI: always     │
│ Start: eager │ Start: eager    │ Start: trigger    │ Start: lazy    │
│ Sandbox: YES │ Sandbox: YES    │ Sandbox: YES      │ Sandbox: N/A   │
└──────────────┴─────────────────┴───────────────────┴────────────────┘
```

### The Orchestrator Kind

The orchestrator is the workspace's Main Agent modeled as a special Agent App. This unifies the type system — everything that runs tools is an Agent App.

| Property | Orchestrator | Other Agent Apps |
|----------|-------------|-----------------|
| Quantity | Exactly 1 per workspace (singleton) | 0 to N |
| Removable | No — always present | Yes |
| Manifest | Auto-generated from workspace config | User-defined or MCP-generated |
| Orchestration | Dispatches tasks, spawns sub-agents, manages apps | Can only request tools from main agent |
| Harness role | Receives all harness feedback | Produces harness feedback |
| Tools | builtins + MCP deps + all agent-app tools | Only its own tools |
| Sandbox | Workspace sandbox policy (floor) | min(app permissions, workspace sandbox) |

---

## Source Adapters

Each source type has an adapter that translates the external system into the Agent App protocol.

### MCP Adapter

The most important adapter. Translates an MCP server into an Agent App:

```
MCP Server
  ├── tools[]           → AgentApp.capabilities.tools[]
  ├── resources[]       → AgentApp state / data access
  ├── prompts[]         → Context injected into main agent
  ├── ui:// resources   → AgentApp.capabilities.ui.renderer
  └── transport config  → AgentApp.source.config
```

When a user adds an MCP server, Mindeck: connects → discovers tools/resources/UI → auto-generates manifest → user can override kind, toolExposure, permissions, harness.

### Native Adapter

Built-in Mindeck functionality as Agent Apps: Chat panel, File Explorer, Terminal, Linter, TypeChecker, TestRunner.

### Script Adapter

User-written Agent Apps in TypeScript/JavaScript. Script implements the Agent App interface and communicates via local IPC.

---

## Lifecycle

```
                    ┌──────────┐
         ┌─────────│ installed │
         │         └────┬─────┘
         │              │ workspace.addApp()
         │              ▼
         │         ┌──────────┐
         │    ┌────│  stopped  │◀── shutdown / error recovery
         │    │    └────┬─────┘
         │    │         │ startup: eager → auto
         │    │         │ startup: lazy  → on first use
         │    │         │ startup: on-trigger → on harness event
         │    │         ▼
         │    │    ┌──────────┐
         │    │    │ starting  │── connect transport, discover tools
         │    │    └────┬─────┘
         │    │         │ ready
         │    │         ▼
         │    │    ┌──────────┐
         │    │    │  running  │── accepting tool calls / tasks
         │    │    └────┬─────┘
         │    │         │ error
         │    │         ▼
         │    │    ┌──────────┐
         │    └───▶│  error    │── retry with backoff
         │         └──────────┘
         │
         │ workspace.removeApp()
         ▼
    ┌──────────┐
    │ removed   │
    └──────────┘
```

### AgentAppPool

Manages all Agent App instances in a workspace. Analogous to `AgentPool` for WorkspaceAgents.

- `initAll()` — start all eager apps when workspace opens
- `getOrStart()` — get or start an app (for lazy startup)
- `onHarnessEvent()` — handle a harness trigger event
- `shutdownAll()` — shut down all apps when workspace closes
