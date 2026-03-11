# Sandbox Mode

> Per-workspace execution isolation — the `[C] Constrain` pillar of harness engineering.
>
> Related: [agent-apps](./agent-apps.md) · [harness-engine](./harness-engine.md) · [orchestration](./orchestration.md)

---

## Why Sandbox

Mindeck agents call `bash_exec`, `write_file`, `delete_path` directly on the host. Current safeguard: permission prompt for `bash_exec` only. This is insufficient:

- Prompt injection via MCP tool could execute arbitrary shell commands
- Hallucinated `rm -rf /` has direct host impact
- Enterprise users need auditable execution boundaries
- OpenClaw CVE-2026-25253: RCE through unsandboxed agent execution

---

## Three Modes

Per-workspace, inspired by OpenAI Codex:

```
┌───────────────┬─────────────────────┬────────────────────────────────┐
│  read-only    │  workspace-write    │  full-access                   │
│  (safest)     │  (default)          │  (power user)                  │
├───────────────┼─────────────────────┼────────────────────────────────┤
│ list_dir  ✅  │ list_dir  ✅        │ list_dir  ✅                   │
│ read_file ✅  │ read_file ✅        │ read_file ✅                   │
│ write_file ❌ │ write_file ✅*      │ write_file ✅                  │
│ delete_path❌ │ delete_path ✅*     │ delete_path ✅                 │
│ bash_exec ❌  │ bash_exec ✅**      │ bash_exec ✅                   │
│ web_fetch ❌  │ web_fetch ✅***     │ web_fetch ✅                   │
├───────────────┼─────────────────────┼────────────────────────────────┤
│               │ * workspace dir only│ No restrictions.               │
│               │ ** allowlisted cmds │ Permission prompt still fires  │
│               │ *** domain allowlist│ for bash_exec.                 │
└───────────────┴─────────────────────┴────────────────────────────────┘
```

| Mode | Filesystem | Shell | Network | Use Case |
|------|-----------|-------|---------|----------|
| `read-only` | Read within workspace | Blocked | Blocked | Code review, analysis |
| `workspace-write` | Read anywhere; write inside workspace only | Allowlisted commands | Allowed (optional domain allowlist) | Default for development |
| `full-access` | Unrestricted | Unrestricted (prompt still fires) | Unrestricted | DevOps, power users |

---

## Three Layers

Progressive enforcement — layers are additive.

### Layer 1: Tauri Capability Enforcement

**Goal**: Enforce sandbox modes using application-level checks. No external dependencies.

```
Orchestrator ──┐
Agent App A ───┼──▶ SandboxEnforcer ──▶ OS
Sub-Agent B ───┘    (one per workspace)
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
     read-only?      workspace-write?  full?
     → DENY exec     → check path      → OK
                     → check command
                     → ALLOW / DENY
```

```typescript
interface SandboxPolicy {
  mode: SandboxMode
  workspaceRoot: string
  shellAllowlist?: string[]         // e.g. ["git", "npm", "cargo"]
  networkAllowlist?: string[]       // e.g. ["github.com", "registry.npmjs.org"]
  additionalWritePaths?: string[]   // paths outside workspace that are writable
  toolOverrides?: Record<string, "allow" | "deny" | "prompt">
}

class SandboxEnforcer {
  checkFileWrite(targetPath: string): SandboxDecision
  checkFileDelete(targetPath: string): SandboxDecision
  checkShellCommand(command: string, args: string[]): SandboxDecision
  checkNetworkRequest(url: string): SandboxDecision
}

type SandboxDecision =
  | { allowed: true }
  | { allowed: false; reason: string }
```

**Status**: `read-only` blocking works. `workspace-write` enforcement **not yet implemented**.

### Layer 2: Container Isolation (Docker)

**Goal**: Run `bash_exec` inside Docker. Workspace mounted as volume. Host FS invisible.

```
bash_exec → SandboxEnforcer → DockerSandbox
                                    │
                            ┌───────┴───────┐
                            │  Container     │
                            │  ┌───────────┐ │
                            │  │ workspace/ │ │  ← bind mount (rw)
                            │  │ /tmp/      │ │  ← tmpfs
                            │  │ (no host)  │ │
                            │  └───────────┘ │
                            │  Network: none │  ← or allowlisted
                            └────────────────┘
```

Key decisions:
- **One container per workspace** — not per tool call (too slow)
- **Workspace mounted read-write** — agent needs to write code
- **Network off by default** — opt-in allowlist for package registries
- **Pre-built images** — Node, Python, Rust, Go
- **Requires Docker** — falls back to Layer 1 if unavailable

**Status**: Implemented (`docker-sandbox.ts`).

### Layer 3: MicroVM Isolation (Future)

Apple Virtualization.framework (macOS) / Firecracker (Linux). Hypervisor-level isolation.

- Checkpoint/restore before risky operations
- Ephemeral by default (destroyed after session)
- Offline-by-default networking
- Full Docker inside VM — build images, compose stacks, all isolated
- PTY streaming via WebSocket or virtio-console

**Status**: Not started.

---

## Permission Inheritance

All agents go through the same `SandboxEnforcer`. Permissions flow downward and can only be **tightened, never loosened**.

```
Workspace Sandbox Policy (ceiling)
  │
  ├── Orchestrator (Main Agent)
  │     permissions = workspace sandbox policy
  │     │
  │     ├── Sub-Agent A (code review)
  │     │     permissions ≤ orchestrator's (can be read-only)
  │     │
  │     └── Sub-Agent Team [B, C, D]
  │           permissions ≤ orchestrator's
  │
  ├── Agent App "GitHub" (tool-provider)
  │     permissions = min(app manifest, workspace sandbox)
  │
  └── MCP Dependency "web-search"
        permissions = min(default MCP dep, workspace sandbox)
```

**Rule**: `Effective permission = min(agent's own permissions, workspace sandbox)`

The stricter constraint always wins. No agent can escalate beyond the workspace sandbox. No sub-agent can escalate beyond its parent.

---

## System Prompt Integration

When sandbox is enabled, the agent's system prompt includes constraints:

```
## Execution Environment

This workspace runs in **workspace-write** sandbox mode:
- You can read files anywhere within the workspace
- You can write/delete files only inside: /path/to/workspace
- Shell commands restricted to: git, npm, pnpm, node, npx, cargo
- Network access allowed for: github.com, registry.npmjs.org
- Attempting operations outside these boundaries will be denied

Do NOT attempt to:
- Write files outside the workspace directory
- Run commands not in the shell allowlist
- Access network resources not in the allowlist
```

This prevents wasted iterations on denied operations.

---

## Configuration

```typescript
interface SandboxConfig {
  mode: "read-only" | "workspace-write" | "full-access"
  enforcement?: "tauri" | "container" | "microvm"   // auto-detected if omitted
  shellAllowlist?: string[]
  networkAllowlist?: string[]
  additionalWritePaths?: string[]
  toolOverrides?: Record<string, "allow" | "deny" | "prompt">
  container?: ContainerSandboxConfig
  microvm?: MicroVMSandboxConfig
}
```

**Defaults**: New workspace → `workspace-write` mode, `tauri` enforcement.
UI shows lock icon + mode label in workspace header.
