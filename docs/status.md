# Mindeck — Implementation Status

> Last updated: 2026-03-11
> Design alignment: ~70% implemented. The remaining 30% includes the hardest architectural pieces.

---

## 1. Milestone Completion

### Milestone 0 — Core Reliability: COMPLETE

Tool call history persistence, shared agent runner, event bus, provider capability probing, crash recovery.

### Milestone 1 — Skill System: COMPLETE

SKILL.md parser, multi-path discovery, AGENTS.md injection, Cursor Rules, slash commands, auto-matching, catalog UI.

### Milestone 2 — Agent App Foundation: SIGNIFICANT GAPS

| Task | Status | Notes |
|------|--------|-------|
| MCP client (stdio + HTTP) | Done | `mcp/client.ts` |
| Agent App type system | Diverged | See [design-divergences](./decisions/design-divergences.md) |
| MCP → Agent App adapter | Done | `mcp/adapter.ts` |
| PaneType: "agent-app" | Done | `AgentAppPane.tsx` |
| MCP Apps iframe renderer | Partial | `MCPAppFrame.tsx` exists, postMessage bridge unverified |
| Context compaction | Done | Token estimation + sliding window + compact API |
| **Sandbox Layer 1** | **Partial** | `read-only` blocking works. `workspace-write` has **zero enforcement** |

### Milestone 3 — Harness Engine: MOSTLY COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| Harness engine | Done | 3 of 8 trigger types (file_written, tool_completed, task_completed) |
| Skill ↔ Agent App binding | Done | |
| Native Agent Apps | Done | ESLint, TSC, TestRunner |
| Doom loop + self-verification | Done | 6-call sliding window |
| Parallel tool timeout | Done | `toolTimeoutMs` |
| Cross-session memory | Done | `workspace-memory.ts` |
| Model routing | Done | Per-phase routing |
| Dynamic action space | Done | `filterByIntent()` |

### Milestone 4 — Ecosystem + Hardening: COMPLETE

Agent App Catalog, workspace templates, streaming tool output, observability, Docker sandbox, prompt injection detection, script adapter.

### Milestone 5 — Advanced Sandbox: NOT STARTED

MicroVM, checkpoint/restore, network policy engine.

---

## 2. Harness Pillar Coverage

| Pillar | Current State | Key Gap |
|--------|---------------|---------|
| **[C] Constrain** | `read-only` blocking works. Docker sandbox works. **`workspace-write` is unenforced.** | SandboxEnforcer for Layer 1 |
| **[V] Verify** | Harness triggers, native apps, self-verification, observability — functional | None significant |
| **[I] Inform** | AGENTS.md, Skills, MCP, memory, compaction — functional | None |
| **[X] Correct** | Fake-action audit, doom loop, harness feedback, model routing — functional | None |

**Three of four pillars are at target. `[C]` Constrain needs the SandboxEnforcer.**

---

## 3. Critical Gaps

### Gap 1 (High): SandboxEnforcer Does Not Exist

The design's most security-critical component is absent. `workspace-write` mode behaves identically to `full` — no path validation, no shell allowlist, no network restrictions.

**Impact**: A hallucinated `write_file("/etc/hosts", ...)` would succeed in workspace-write mode.

### Gap 2 (Medium): Orchestrator Is Not an Agent App

WorkspaceAgent is separate from the Agent App system. Has `generateOrchestratorManifest()` but not modeled as a true Agent App. This means no unified type system and no uniform sandbox enforcement path.

### Gap 3 (Medium): AgentAppManifest Diverged from Design

`kind` field redefined (`"system" | "native" | "custom"` instead of behavioral four-kind system). `source` union replaced with flat `mcpDependencies` + `nativeComponent` fields. Simpler but loses explicit behavioral categorization.

### Gap 4 (Low): System Prompt Sandbox Integration Incomplete

`workspace-write` mode has no system prompt content describing constraints. The agent doesn't know its boundaries.

### Gap 5 (Low): MCP Apps postMessage Bridge

`MCPAppFrame.tsx` exists but `mcp-apps-bridge.ts` (bidirectional JSON-RPC over postMessage) is unverified.

---

## 4. Design Divergences & Type Comparisons

See [decisions/design-divergences.md](./decisions/design-divergences.md) for full details on conscious simplifications and type system comparisons.
