# Design Divergences

> Where implementation consciously diverged from the Agent App design spec.
> These are deliberate simplifications, not bugs.
>
> Related: [agent-apps](../architecture/agent-apps.md) · [sandbox](../architecture/sandbox.md) · [status](../status.md)

---

## Divergence 1: `kind` Redefined

**Design**: `kind: "orchestrator" | "tool-provider" | "autonomous" | "viewer"` — behavioral categorization for lifecycle and interaction model.

**Implementation**: `kind: "system" | "native" | "custom"` — classifies by origin, not behavior. Behavioral differences inferred from capabilities at runtime.

**Impact**: A MCP tool-provider and an autonomous agent with the same `kind: "custom"` are indistinguishable at the type level.

**Decision needed**: Adopt behavioral kinds alongside origin kinds, or formally document capability-inference as the intended approach.

---

## Divergence 2: `source` Union → Flat Fields

**Design**: Discriminated union — `source: { type: "mcp"; config } | { type: "native"; component } | ...`

**Implementation**: Flat optional fields — `mcpDependencies?: MCPSourceConfig[]` + `nativeComponent?: string`

**Impact**: Easier to serialize, but an app could have both fields set (invalid state). Consider a runtime validator or discriminated union in a future refactor.

---

## Divergence 3: Orchestrator Separate from Agent App System

**Design**: WorkspaceAgent becomes `kind: "orchestrator"` Agent App — unified sandbox enforcement, audit trails, swappable orchestrators.

**Implementation**: WorkspaceAgent is a separate class. It has `generateOrchestratorManifest()` which creates a runtime manifest, partially bridging the gap — but it does not go through the Agent App lifecycle or sandbox enforcement path.

**What works**: Runtime manifest generation, tool coordination, sub-agent spawning.

**What's missing**: Unified sandbox enforcement (WorkspaceAgent has its own path), orchestrator swapping, consistent type system ("everything that runs tools is an Agent App" is not true in code).

---

## Divergence 4: Type Simplifications

| Design | Implementation | Notes |
|--------|---------------|-------|
| `SandboxMode: "full-access"` | `"full"` | Cosmetic rename |
| `permissions.network: "none" \| "same-origin" \| "full"` | `"none" \| "full"` | `same-origin` not yet needed |
| `ContainerSandboxConfig.resourceLimits.cpus` | `cpus` (flat) | Simplified nesting |
| `capabilities.emitsEvents?` | Not present | Not yet needed |
| `permissions.invokeOtherApps` | Not present | Not yet needed |
| `lifecycle.healthCheckInterval` | Not present | Not yet needed |
| `AgentAppManifest.author` | Not present | Not yet needed |
| `capabilities.ui.minHeight` | Not present | Only `minWidth` implemented |

---

## Divergence 5: Unimplemented Sandbox Types

These types from the design spec are not yet in `src/types/index.ts`. See [sandbox.md](../architecture/sandbox.md) for the design targets.

- `SandboxPolicy` — workspace-level policy with shell/network allowlists
- `SandboxEnforcer` — per-workspace enforcement class
- `SandboxDecision` — typed allow/deny result (currently returns boolean)
- `MicroVMSandboxConfig` — Layer 3 not started

Current implementation uses only `SandboxMode` and `ContainerSandboxConfig`. The `workspace-write` mode has no Layer 1 enforcement — see [status.md](../status.md#3-critical-gaps).
