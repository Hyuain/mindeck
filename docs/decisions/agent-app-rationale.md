# Agent App Design Rationale

> FAQ-style explanation of key architectural decisions.
>
> Related: [agent-apps](../architecture/agent-apps.md) · [design-divergences](./design-divergences.md)

---

### Why not just be an MCP client?

Being "just an MCP client" makes Mindeck a commodity — Cursor, VS Code, Claude Desktop all do that. The Agent App abstraction gives Mindeck its own platform identity: multi-app orchestration, harness triggers, persistent workspace state, and main-agent coordination. MCP is one source of apps, not the definition.

### Why four kinds (orchestrator, tool-provider, autonomous, viewer)?

Without this distinction, users see a flat list of "apps" with wildly different behaviors. Some consume tokens, some don't. Some take minutes, some are instant. The kinds make expectations clear and enable appropriate lifecycle management.

### Why namespaced tool exposure by default?

Vercel proved fewer, clearer tools = higher accuracy. If five MCP servers each expose 10 tools, that's 50 tools in the action space — too many. Namespacing (`github.create_pr` instead of `create_pr`) makes the tool set self-documenting and prevents collision. Users can override to `direct` or `isolated` per app.

### Why no direct app-to-app communication?

1. The main agent needs oversight to enforce harness rules
2. Direct P2P creates combinatorial complexity (N apps = N² channels)
3. Consistent with hierarchical orchestration philosophy

If tight app-to-app coordination is needed, the main agent is the explicit mediator — keeping behavior auditable and deterministic.

### Why not use A2UI instead of MCP Apps for UI?

MCP Apps is production-ready (v1.1.2), supported by ChatGPT, Claude, VS Code. A2UI is still preview (v0.8). The manifest's `capabilities.ui.renderer` union type is designed for both — when A2UI matures, we add an A2UI renderer alongside MCP Apps.

### Why support MCP as both Dependency (Tier 1) and Agent App (Tier 2)?

Not every MCP server justifies a full manifest. A web search tool is just a function. The npm analogy: `lodash` is a dependency you import directly; `react` shapes your architecture. Both tiers share the same `MCPConnectionPool`, but Tier 1 is zero-ceremony while Tier 2 is full-featured. Users can promote Tier 1 → Tier 2 when they need more control.

### Won't multiple consumers sharing an MCP server cause state conflicts?

Yes — MCP is stateful and the spec leaves session isolation to server implementors. Real-world issues confirm concurrent clients cause response mixing (FastMCP #1083, MCP Servers #2297). **Strategy**: one connection per consumer by default. Shared connections opt-in, never cross workspace boundaries.

### How do Skills relate to Agent Apps?

A Skill (system prompt + tool subset) is effectively a headless, ephemeral Agent App with no UI. Long-term, Skills could migrate into the Agent App system. Short-term, they coexist — Skills modify the main agent's behavior, Agent Apps run alongside it.

### Why is the Main Agent an Agent App (kind: "orchestrator")?

The Main Agent uses `bash_exec`, `write_file`, `delete_path` — the same tools as Agent Apps. If sandbox only applies to "other" apps but not the orchestrator, there's a gaping hole. By modeling it as an Agent App:

- **Uniform sandbox enforcement** — one `SandboxEnforcer`, one audit trail
- **Clean sub-agent inheritance** — sub-agents naturally inherit the orchestrator's sandbox
- **Future flexibility** — users could swap the default orchestrator for a specialized one
- **Consistent type system** — everything that runs tools is an Agent App

The orchestrator is still special (singleton, non-removable, has orchestration privileges), but shares the execution infrastructure.

### Why is sandbox optional?

1. **Developer experience** — mandatory sandboxing adds friction. Most personal dev workspaces don't need container isolation
2. **Performance** — Layer 2/3 add latency to every tool call
3. **Progressive trust** — `read-only` for reviewing untrusted code, `workspace-write` for daily dev, `full-access` for DevOps. Default (`workspace-write` + Tauri enforcement) is safe enough while remaining zero-config

### Why three sandbox layers instead of just Docker?

Docker isn't always available (macOS without Orbstack, corporate laptops, Windows without WSL). Layer 1 (Tauri enforcement) provides meaningful protection with zero dependencies — prevents writing outside workspace, running `rm -rf /`. Layer 2 (Docker) adds OS-level isolation when available. Layer 3 (MicroVM) is for high-security environments. Progressive enhancement, not all-or-nothing.

### How does sandbox interact with MCP servers?

MCP servers run as separate processes **outside** the sandbox. The sandbox only constrains the workspace agent's built-in tools. MCP tool calls execute inside the MCP server's own process. However, if an MCP tool returns instructions the agent then executes via `bash_exec`, the sandbox applies to that execution. Agent App permissions provide an additional layer for MCP-sourced apps.
