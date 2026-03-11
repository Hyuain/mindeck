# Harness Engine

> The four-pillar harness engineering model and how Agent Apps participate.
>
> Related: [agent-apps](./agent-apps.md) · [sandbox](./sandbox.md) · [orchestration](./orchestration.md)

---

## The Harness Engineering Paradigm

The industry shifted from **Context Engineering** (what info to give the model) to **Harness Engineering** (the entire environment around the model). Key evidence:

- **OpenAI**: 3 engineers, 5 months, 1M lines of code, zero hand-written — humans built the harness
- **Vercel**: Reduced tools from 15 → 2, accuracy 80% → 100%, tokens -37%
- **LangChain**: Same model, harness-only changes, Terminal-Bench rank #30 → #5

**Consensus**: Model choice is secondary to harness quality above a capability threshold.

---

## Four Pillars

| Pillar | Purpose | How Mindeck Delivers |
|--------|---------|---------------------|
| **[C] Constrain** | Limit what the agent can do | Sandbox modes, Agent App permissions, dynamic action space, namespaced tool exposure |
| **[V] Verify** | Mechanically check agent output | Harness triggers (Linter, TypeChecker, TestRunner), self-verification loop, observability |
| **[I] Inform** | Give the agent the right context | AGENTS.md, Skills, MCP tools, cross-session memory, context compaction |
| **[X] Correct** | Fix mistakes automatically | Fake-action audit + auto-retry, doom loop detection, harness feedback loops, model routing |

---

## Harness Triggers

Agent Apps declare which workspace events should activate them:

```typescript
// Design target — full trigger taxonomy
type HarnessTrigger =
  | { event: "file_written"; pattern?: string }       // ✅ implemented
  | { event: "file_deleted"; pattern?: string }       // ❌ not yet
  | { event: "tool_completed"; toolName: string }     // ✅ implemented
  | { event: "task_completed" }                       // ✅ implemented
  | { event: "commit_created" }                       // ❌ not yet
  | { event: "error_detected"; source?: string }      // ❌ not yet
  | { event: "schedule"; cron: string }               // ❌ not yet
  | { event: "manual" }                               // ❌ not yet

// Actual implementation (src/types/index.ts) — only 3 events:
type HarnessTrigger = { event: "file_written" | "tool_completed" | "task_completed"; pattern?: string; toolName?: string }
```

**Currently implemented**: `file_written`, `tool_completed`, `task_completed` (3 of 8).

---

## Feedback Loop

When `harness.feedbackToAgent: true`, results are auto-injected into the main agent's context:

```
Main Agent writes file
    → triggers "Linter" Agent App
    → Linter finds 3 errors
    → errors fed back to Main Agent
    → Main Agent fixes errors
    → triggers Linter again
    → Linter passes
    → Main Agent continues
```

This creates **mechanical enforcement** — without relying on the agent to remember to run the linter.

---

## Example: Harness-Integrated Workspace

```yaml
Workspace: "my-react-app"
  Main Agent: Claude Opus 4.6

  Sandbox:                                              # [C] Constrain
    mode: workspace-write
    shellAllowlist: [git, npm, npx, node, eslint, tsc]
    networkAllowlist: [github.com, registry.npmjs.org]

  Agent Apps:
    - name: "ESLint"                                    # [V] Verify
      kind: native
      nativeComponent: eslint-app
      harness:
        triggers: [{ event: "file_written", pattern: "*.{ts,tsx}" }]
        feedbackToAgent: true

    - name: "TypeScript Checker"                        # [V] Verify
      kind: native
      nativeComponent: tsc-app
      harness:
        triggers: [{ event: "file_written", pattern: "*.{ts,tsx}" }]
        feedbackToAgent: true

    - name: "GitHub"                                    # [I] Inform
      kind: custom
      mcpDependencies: [server-github]
      toolExposure: namespaced

    - name: "Test Runner"                               # [V] Verify + [X] Correct
      kind: native
      nativeComponent: test-runner-app
      harness:
        triggers: [{ event: "task_completed" }]
        feedbackToAgent: true

    - name: "PR Dashboard"                              # [I] Inform
      kind: custom
      mcpDependencies: [server-github]
      capabilities.ui: { renderer: { type: "mcp-app" } }
```

In this setup:
- **Sandbox** prevents arbitrary commands or writes outside workspace `[C]`
- **Harness triggers** auto-run linters and tests without the agent needing to remember `[V]`
- **Feedback loops** auto-correct errors by feeding results back `[X]`
- **AGENTS.md + Skills + MCP tools** give the agent full project understanding `[I]`

---

## Verification Mechanisms

### Self-Verification Loop

After the agentic loop's final turn (no more tool calls), a verification prompt is injected: "Review your tool call results. Did you complete all steps?" Re-enters loop if issues found.

### Doom Loop Detection

Sliding window of recent 6 tool call signatures (`name + hash(args)`). If low unique-call ratio detected, a correction prompt is injected or the loop breaks.

### Fake-Action Audit

Regex-based detection of described-but-not-executed mutations. If the agent says "I'll write the file" without calling `write_file`, the audit catches it and auto-retries.

### Dynamic Action Space

`filterByIntent()` limits the tool set based on task type:
- Read-only tasks → hide mutation tools
- Analysis tasks → hide dispatch tools
- Implementation tasks → full tool set

This follows Vercel's finding: fewer tools = higher accuracy.
