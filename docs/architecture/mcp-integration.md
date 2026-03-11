# MCP Integration

> How Mindeck connects to the MCP ecosystem via a dual-tier model.
>
> Related: [agent-apps](./agent-apps.md) · [orchestration](./orchestration.md)

---

## Dual-Tier Model

Not every MCP server needs to be an Agent App. A web search tool shouldn't require a full manifest. The dual-tier model follows the npm analogy: `lodash` is a dependency you import directly; `react` shapes your architecture.

```
┌─────────────────────────────────────────────────────┐
│                    Workspace                         │
│                                                      │
│  ┌─ Tier 1: MCP Dependencies ──────────────────────┐│
│  │  Lightweight tool providers, no UI / lifecycle    ││
│  │  · @mcp/web-search    → search()                  ││
│  │  · @mcp/timezone      → convert_timezone()        ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  ┌─ Tier 2: Agent Apps ────────────────────────────┐│
│  │  Full manifest, UI panes, lifecycle, harness      ││
│  │  · GitHub App    → pane + tools + harness         ││
│  │  · Linter App    → pane + triggers                ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  Workspace Main Agent sees unified tool set:         │
│  [builtins] + [mcp-dep tools] + [agent-app tools]    │
└─────────────────────────────────────────────────────┘
```

---

## Tier 1: MCP Dependency

Minimal config — just enough to connect and expose tools:

```typescript
interface MCPDependency {
  name: string                        // namespace key, e.g. "web-search"
  command: string                     // "npx @mcp/server-web-search"
  args?: string[]
  env?: Record<string, string>
  transport: "stdio" | "streamable-http"
  url?: string                        // for HTTP transport
  toolExposure?: "direct" | "namespaced"  // default: "namespaced"
  enabled?: boolean                   // toggle without delete
  scope?: "workspace" | "global"      // typed but not yet enforced
  sharedConnection?: boolean          // default: false (isolated)

  // Runtime (auto-managed)
  status?: "connected" | "disconnected" | "error"
  discoveredTools?: ToolDefinition[]
}
```

### Promotion Path

Tier 1 → Tier 2: When a user needs lifecycle management, harness triggers, or UI rendering, they promote a dependency to an Agent App. Mindeck auto-generates the manifest, user customizes.

---

## Session Isolation

MCP is a stateful protocol. Concurrent clients can cause response mixing and state contamination (FastMCP #1083, MCP Servers #2297).

**Strategy**: One connection per consumer by default:
- Separate process for stdio transport
- Separate session for HTTP transport
- `{workspaceId}:{depName}` keys for workspace deps
- `{instanceId}:{depName}` keys for app instances
- Shared connections opt-in via `sharedConnection: true`, never cross workspace boundaries

---

## MCP Apps Compatibility

### What We Support from MCP Apps Spec

| Feature | Support | Notes |
|---------|---------|-------|
| `ui://` resource scheme | Yes | Rendered in FlexibleWorkspace pane iframe |
| `text/html;profile=mcp-app` MIME | Yes | Via `srcdoc` attribute |
| `text/uri-list` for external URLs | Yes | Via iframe `src` attribute |
| Bidirectional JSON-RPC over `postMessage` | Yes | Standard MCP Apps bridge |
| `tools/call` from guest to host | Yes | Routed through Agent App → Main Agent |
| `ui/message` from guest to host | Yes | Translated to `agent:emit_event` |
| `ui/open-link` | Yes | Opens in system browser |
| `_meta.ui.visibility` | Yes | Honors `["app"]` for UI-only tools |
| Sandboxed iframe | Yes | `sandbox="allow-scripts"` with Tauri CSP |

### What Agent App Adds Beyond MCP Apps

| Capability | MCP Apps | Agent App |
|-----------|---------|-----------|
| Multi-app workspace | No (one per turn) | Yes — multiple in split panes |
| Agent orchestration | No | Main agent coordinates across apps |
| Cross-app communication | No | Via workspace event bus |
| Harness triggers | No | Auto-activate on file/tool/task events |
| Persistent state | Session-scoped | Workspace-scoped or global |
| Task dispatch | No (tools only) | Autonomous apps accept full tasks |
| Feedback loop | No | Results auto-injected into main agent |
| Per-app model routing | No | Each autonomous app can use different model |
| Permission model | Host-level sandbox | Per-app fine-grained permissions |
