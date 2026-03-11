# Design Divergences

> Where implementation consciously diverged from the Agent App design spec.
> These are deliberate simplifications, not bugs.

---

## Summary

The Agent App design spec was written as a target architecture. During implementation, several simplifications were made for pragmatic reasons. Each divergence should either be backported to the design or the design updated to match.

---

## Divergence 1: `kind` Removed from AgentAppManifest

**Design**: `kind: "orchestrator" | "tool-provider" | "autonomous" | "viewer"` — explicit categorization for lifecycle, resource consumption, and interaction model decisions.

**Implementation**: `kind` field removed. Comment in code: "behavior is inferred from capabilities at runtime."

**Impact**: Simpler manifest, but loses the explicit categorization the design uses to determine lifecycle management. A tool-provider and an autonomous app with the same capabilities would be indistinguishable.

**Decision needed**: Re-add `kind` for explicit lifecycle management, or formally document the capability-inference approach.

---

## Divergence 2: `source` Union Replaced with Flat Fields

**Design**: Discriminated union — `source: { type: "mcp"; config: MCPSourceConfig } | { type: "native"; component: string } | ...`

**Implementation**: Two optional fields — `mcpDependencies?: MCPSourceConfig[]` + `nativeComponent?: string`

**Impact**: Easier to serialize/store, but loses the discriminated union's type safety. An app could theoretically have both `mcpDependencies` and `nativeComponent` set, which is invalid.

---

## Divergence 3: Orchestrator Not Modeled as Agent App

**Design**: WorkspaceAgent becomes `kind: "orchestrator"` Agent App with auto-generated manifest. Unified sandbox enforcement, audit trails.

**Implementation**: WorkspaceAgent is a completely separate class from the Agent App system. No implicit manifest, no shared sandbox enforcement path.

**Impact**:
- No unified type system — "everything that runs tools is an Agent App" is not true in code
- WorkspaceAgent has its own ad-hoc sandbox logic (separate from Agent App enforcement)
- Cannot swap orchestrators in the future

This is the largest architectural divergence. Conscious simplification for initial implementation speed.

---

## Divergence 4: Minor Type Simplifications

| Design | Implementation | Notes |
|--------|---------------|-------|
| `SandboxMode: "full-access"` | `"full"` | Cosmetic naming |
| `ContainerSandboxConfig.resourceLimits.cpus` | `cpus` (flat) | Simpler structure |
| `permissions.network: "none" \| "same-origin" \| "full"` | `"none" \| "full"` | No same-origin option |
| `capabilities.emitsEvents?` | Not present | Minor omission |
| `permissions.invokeOtherApps` | Not present | Not yet needed |
| `lifecycle.healthCheckInterval` | Not present | Not yet needed |

---

## Divergence 5: Missing Type Definitions

These types from the design spec are not yet in `src/types/index.ts`:

- `SandboxEnforcementLayer` — auto-detected rather than configurable
- `SandboxDecision` — enforcer returns boolean, not typed decision
- `SandboxPolicy.shellAllowlist` — no workspace-level shell restriction
- `SandboxPolicy.networkAllowlist` — no workspace-level network restriction
- `ContainerSandboxConfig.networkMode: "allowlist"` — only `"none" | "host"`
- `ContainerSandboxConfig.setupCommands` — not yet supported
- `MicroVMSandboxConfig` — Layer 3 not started
