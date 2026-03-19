# Mindeck — Project Guidelines

## Stack
- Tauri 2.x (Rust backend) + React 19 + TypeScript + Vite
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin — NO `tailwind.config.ts`)
- Zustand (state management)
- Lucide React (icons)
- react-markdown + remark-gfm + rehype-highlight (markdown)

## File Structure
```
src/
  app/          App.tsx, globals.css
  components/   agents/, chat/, majordomo/, observability/, preview/renderers/,
                provider/, ui/, workspace/
  hooks/        useColumnResize.ts, useSlashCommand.ts
  services/     agents/{workspace-agent.ts, majordomo-agent.ts, agent-runner.ts,
                        agent-pool.ts, agentic-loop.ts}
                events/{event-bus.ts, event-queue.ts, task-manager.ts}
                conversation/{conversation.ts, context-compaction.ts}
                workspace/{workspace.ts, workspace-memory.ts, content-root.ts}
                security/{prompt-injection.ts, permissions.ts}
                harness/{harness-engine.ts}
                providers/{types.ts, bridge.ts, manager.ts, models.ts, storage.ts, keychain.ts}
                tools/{registry.ts, builtins.ts, workspace-tools.ts}
                skills/{crud.ts, skill-loader.ts, skill-discovery.ts, context-injector.ts,
                        import-export.ts, auto-matcher.ts}
                mcp/{client.ts, manager.ts}
                agent-apps/, native-apps/, sandbox/, templates/, observability/
                logger.ts, drag-state.ts, thinking.ts
  stores/       workspace.ts, chat.ts, provider.ts, majordomo.ts, ui.ts,
                tasks.ts, skills.ts, layout.ts, agents.ts, agent-apps.ts
  types/        index.ts (all shared types)
src-tauri/      Rust backend (commands in src/commands/)
```

## Conventions

### TypeScript
- Strict mode, `noUnusedLocals`, `noUnusedParameters`
- Use `type` imports where possible
- No `any` — use `unknown` + type guards instead
- Path alias: `@/` → `src/`

### Immutability
- Never mutate Zustand state in-place — always return new objects
- Never mutate function parameters

### Components
- One component per file, filename = component name
- Props interfaces defined in the same file (no separate `types.ts` per component)
- Max ~300 lines per file

### Styling
- Use CSS custom properties (`var(--color-bg-0)`, etc.) — defined in `globals.css`
- Do NOT use Tailwind for design token values (colors, fonts) — use CSS vars
- Tailwind utility classes are fine for layout/spacing helpers

### Services
- Provider adapters implement `ProviderAdapter` interface from `services/providers/types.ts`
- Use singleton `providerManager` from `services/providers/manager.ts`
- Never store raw API keys in JS — reference OS Keychain aliases only

### Error Handling
- All service methods throw typed errors with descriptive messages
- UI catches at boundary level — never swallow errors silently

## Design Tokens
Defined in `src/app/globals.css`:
- `--color-bg-{0-5}`: backgrounds (0 = darkest/lightest)
- `--color-t{0-2}`: text (0 = primary, 1 = secondary, 2 = muted)
- `--color-bd`, `--color-bdd`, `--color-bdh`: borders
- `--color-ac`: workspace accent (emerald)
- `--color-mj`: majordomo accent (violet)
- `--font-sans`: Plus Jakarta Sans
- `--font-mono`: JetBrains Mono

## Documentation
- `docs/specs/` — Design specs and architecture decisions (tracked in git)
- `docs/plans/` — Implementation plans and working docs (gitignored — code speaks)
- `docs/architecture/` — System design documents (tracked)
- `docs/decisions/` — Design decision records (tracked)

## Git
Commit types: `feat | fix | refactor | docs | test | chore | perf | ci`

## Rust/Tauri
- Commands go in `src-tauri/src/commands/`
- Each domain gets its own file: `workspace.rs`, `provider.rs`, `chat.rs`, `keychain.rs`, `stream.rs`, `files.rs`, `shell.rs`, `skills.rs`, `mcp.rs`, `sandbox.rs`, `apps.rs`, `memory.rs`, `audit.rs`, `observability.rs`, `events.rs`, `scripts.rs`
- Register commands in `lib.rs`
