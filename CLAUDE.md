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
  app/          App.tsx, globals.css, routes (future)
  components/   chat/, preview/renderers/, workspace/, super-agent/, provider/, ui/
  services/     providers/{types.ts, ollama.ts, openai-compatible.ts, manager.ts}
                workspace.ts, conversation.ts, super-agent.ts
  stores/       workspace.ts, chat.ts, provider.ts, super-agent.ts, ui.ts
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
- `--color-sa`: super agent accent (violet)
- `--font-sans`: Plus Jakarta Sans
- `--font-mono`: JetBrains Mono

## Git
Commit types: `feat | fix | refactor | docs | test | chore | perf | ci`

## Rust/Tauri
- Commands go in `src-tauri/src/commands/`
- Each domain gets its own file: `workspace.rs`, `provider.rs`, `chat.rs`, `keychain.rs`
- Register commands in `lib.rs`
