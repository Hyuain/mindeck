# Mindeck — Roadmap & TODOs

> Prioritized future work. Items ranked by impact and urgency.
> Last updated: 2026-03-11

---

## Priority 1 — Security Hardening

> Closes the biggest gap: `[C] Constrain` pillar.

### TODO: SandboxEnforcer (Layer 1)

Create `src/services/sandbox/sandbox-enforcer.ts`:

```typescript
class SandboxEnforcer {
  checkFileWrite(targetPath: string): SandboxDecision   // path ∈ workspaceRoot?
  checkFileDelete(targetPath: string): SandboxDecision
  checkShellCommand(command: string): SandboxDecision    // command ∈ allowlist?
  checkNetworkRequest(url: string): SandboxDecision      // domain ∈ allowlist?
}
```

- [ ] Implement SandboxEnforcer class (~300 LOC)
- [ ] Hook into `builtins.ts` tool executors
- [ ] Add `shellAllowlist` and `networkAllowlist` to workspace config
- [ ] Add sandbox constraint text to system prompt for `workspace-write` mode

**Impact**: Closes the single biggest security gap. `workspace-write` currently behaves as `full`.

### TODO: PreToolUse Interceptor

Add interception point in `agentic-loop.ts` between model requesting tool call and executor running:

- [ ] Define `PreToolUseHook` interface in `agentic-loop.ts`
- [ ] Add `preToolUse?: PreToolUseHook` to `AgentLoopOptions`
- [ ] Wire default hook in `workspace-agent.ts` that checks sandbox mode
- [ ] Integrate with SandboxEnforcer

### TODO: Sandbox Immutability Audit

- [ ] Audit `src-tauri/src/commands/shell.rs` and `sandbox.rs` — confirm no Tauri command accepts a parameter that would disable the sandbox
- [ ] Enforce SandboxMode check at Rust layer (capability check, not convention)

### TODO: MCP `env` Field Validation

- [ ] In `MCPServerForm.tsx`, reject env keys overriding `PATH`, `LD_PRELOAD`, etc.
- [ ] Mirror validation in Rust `spawn_mcp_server` command

---

## Priority 2 — Apps Tab UX

> Improves usability of the MCP/Agent App ecosystem.

### TODO: Context Pressure Indicator

Show token cost of connected MCP tools in Apps tab header:

- [ ] Estimate tokens: `Σ (name.length + desc.length + JSON.stringify(params).length) / 4`
- [ ] Yellow warning at 15% of model context, red at 25%
- [ ] Display in `AgentsPanel.tsx` Apps tab header

### TODO: Click-to-Expand Tool List

- [ ] Add expand chevron on each MCP server row in Apps tab
- [ ] Show `dep.discoveredTools` with name + description on expand
- [ ] Collapsed by default

### TODO: Global MCP Scope Enforcement

`MCPDependency.scope?: "workspace" | "global"` is typed but unenforced:

- [ ] Add `globalDeps: MCPDependency[]` to `stores/agent-apps.ts`
- [ ] Store global deps in `~/.mindeck/global-mcp.json`
- [ ] Auto-connect global deps on workspace open
- [ ] Show "Global" section in Apps tab, not deletable from workspace view

---

## Priority 3 — Skill Enhancements

### TODO: Skill Budget Warning

- [ ] In `context-injector.ts`, track total chars of active skill descriptions
- [ ] Warn when exceeding ~16k chars
- [ ] Show excluded skills in `SkillChips`

### TODO: Skill-Scoped Tool Allowlist

- [ ] Honor `skill.allowedTools?: string[]` when skill is active
- [ ] Wire through PreToolUse interceptor — tools outside allowlist require explicit permission

### TODO: Background-Only Skills

- [ ] Add `userInvocable?: boolean` to `Skill` type
- [ ] When `false`, never show in slash command menu or SkillSuggestionBar
- [ ] Still injected as background context

---

## Priority 4 — Architecture Decisions

> Decide and implement (or formally document the alternative).

### TODO: Decide on `kind` Field

Either:
- (a) Re-add `kind` to `AgentAppManifest` for explicit lifecycle management, OR
- (b) Update design doc to document "infer from capabilities" approach

### TODO: Decide on Orchestrator Model

Either:
- (a) Model WorkspaceAgent as `kind: "orchestrator"` Agent App (unified sandbox path), OR
- (b) Formally document that WorkspaceAgent remains separate

### TODO: Add Missing Harness Triggers

- [ ] `file_deleted` trigger
- [ ] `commit_created` trigger
- [ ] `manual` trigger
- [ ] `schedule` (cron) and `error_detected` — defer to backlog

---

## Priority 5 — Advanced Sandbox (Milestone 5)

> Enterprise/untrusted workload isolation.

- [ ] MicroVM via Apple Virtualization.framework (macOS)
- [ ] Checkpoint/restore for sandbox state snapshots
- [ ] Network policy engine (offline-by-default, allowlist)
- [ ] Sandbox workspace templates (one-click secure setup)

---

## Backlog

| # | Item | Complexity | Pillar |
|---|------|-----------|--------|
| B1 | Token estimation + summary compression for long conversations | High | [I] |
| B2 | `task:dispatch` event persistence (survive reconnects) | Medium | [X] |
| B3 | Tool activity feed in agent detail pane | Low | [V] |
| B4 | MCP server discovery panel (curated list) | Medium | [I] |
| B5 | Surface audit log in ObservabilityDashboard | Low | [V] |
| B6 | Live status dot on main agent node | Low | [V] |
| B7 | Per-tool persistent allow/deny rules | Medium | [C] |
| B8 | WorkspaceAgent dependency injection for testability | Medium | — |

---

## Security Threat Model

| Vector | Risk | Mitigation Status |
|--------|------|-------------------|
| Prompt injection via tool result | High | Partial — `detectInjection()` redacts; no PreToolUse block |
| MCP server provides malicious `env` | Medium | Not mitigated |
| MCP tool call disables sandbox | High | Not audited |
| `web_fetch` used to exfiltrate data | Medium | Partial — permission gate added |
| Crafted workspace URL | Low | Low risk in desktop app |

**Invariant**: Sandbox level can only be raised (less permissive), never lowered, from within a running agent loop or MCP tool call.
