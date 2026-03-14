# Unit Tests for Mindeck

## Goal
Add unit tests for core services, Zustand stores, and Rust commands. Target 80%+ coverage on tested modules.

## Framework

### TypeScript
- **Vitest** — native Vite integration, TypeScript-first
- **@vitest/coverage-v8** — coverage reporting
- **happy-dom** — lightweight DOM environment (needed for `window` references in logger.ts etc.)
- Co-located test files: `foo.test.ts` next to `foo.ts`

### Rust
- Built-in `#[cfg(test)]` modules per file
- `tempfile` crate for filesystem tests (`[dev-dependencies] tempfile = "3"`)
- Keychain tests: `#[ignore]` integration tests against real OS keychain (3 simple functions, not worth trait abstraction)

## Test Setup

### `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80, branches: 80 },
    },
  },
});
```

### `src/test/setup.ts`
- Global mocks for `@tauri-apps/api/core` (`invoke`)
- Global mocks for `@tauri-apps/plugin-fs` (readTextFile, writeTextFile, mkdir, exists, readDir, remove)
- Global mocks for `@tauri-apps/plugin-shell` (Command)
- Each test can override via `vi.mocked()`

### `src/test/factories.ts`
- Factory functions for test data: `makeMessage()`, `makeWorkspace()`, `makeProvider()`, `makeToolCall()`, `makeSkill()`

### Zustand Store Reset Strategy
Each store test resets state before each test:
```typescript
beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
});
```
Stores must export or expose initial state for test resetting.

## TypeScript Test Files (~20)

### Pure Services (Priority 1)

| File | Functions Under Test |
|------|---------------------|
| `services/context-compaction.test.ts` | `estimateTokens()`, `compactHistory()`, `claudeCompact()` |
| `services/prompt-injection.test.ts` | `detectInjection()`, `extractSnippet()`, edge cases |
| `services/event-bus.test.ts` | `emit()`, `on()`, `off()`, `once()`, typed events |
| `services/permissions.test.ts` | Permission request/grant/deny logic |
| `services/task-manager.test.ts` | Task creation, status transitions, lifecycle |
| `services/conversation.test.ts` | JSONL serialize/deserialize, tool call fields, round-trip (mocked FS) |
| `services/logger.test.ts` | Log levels, formatting, factory |
| `services/skills.test.ts` | `makeSkill()` factory, validation |
| `services/skills/skill-loader.test.ts` | `parseSkillMd()`, `parseFlatYaml()`, `slugify()`, `legacyJsonToSkill()` |
| `services/skills/auto-matcher.test.ts` | `scoreSkillForTask()`, `suggestSkills()`, `tokenize()` |

### Tool System (Priority 2)

| File | Functions Under Test |
|------|---------------------|
| `services/tools/registry.test.ts` | `registerTool()`, `getTool()`, `getToolDefinitions()`, intent filtering |
| `services/tools/builtins.test.ts` | Builtin tool parameter validation, execution with mocked deps |

### Zustand Stores (Priority 3)

| File | State Transitions Under Test |
|------|------------------------------|
| `stores/workspace.test.ts` | CRUD operations, status updates, active workspace switching |
| `stores/chat.test.ts` | Message append, clear, per-workspace isolation |
| `stores/provider.test.ts` | Provider add/remove/update |
| `stores/tasks.test.ts` | Task creation, status transitions, filtering |
| `stores/layout.test.ts` | Panel width/collapse, per-workspace pane layouts |
| `stores/skills.test.ts` | Skill loading, matching, state updates |
| `stores/majordomo.test.ts` | Message handling, draft vs persisted, result cards |
| `stores/ui.test.ts` | Modal state, UI toggles |

## Rust Test Modules (~7)

All use `#[cfg(test)] mod tests` inside the source file.

| File | Functions Under Test |
|------|---------------------|
| `commands/workspace.rs` | Workspace JSON read/write/list/delete (uses `tempfile::tempdir()` with base path parameter) |
| `commands/provider.rs` | Provider config serialization, directory listing |
| `commands/chat.rs` | JSONL parsing, message format |
| `commands/keychain.rs` | Key set/get/delete (`#[ignore]` — real OS keychain integration tests) |
| `commands/files.rs` | File listing, directory operations |
| `commands/skills.rs` | Skill file read/write |
| `error.rs` | AppError serialization, Display impl, error conversions |

### Rust Filesystem Mock Strategy
- Refactor `workspaces_dir()` and similar functions to accept an optional base path
- `#[cfg(test)]` overrides use `tempfile::tempdir()`
- Add `tempfile = "3"` to `[dev-dependencies]` in `src-tauri/Cargo.toml`

## Tauri Mock Strategy (TypeScript)

```typescript
// src/test/setup.ts
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
  readDir: vi.fn(),
  remove: vi.fn(),
}));
```

## Scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:rust": "cargo test --manifest-path src-tauri/Cargo.toml",
  "test:all": "vitest run && cargo test --manifest-path src-tauri/Cargo.toml"
}
```

## Implementation Order

1. Install dependencies, create `vitest.config.ts` and `src/test/setup.ts`
2. Create `src/test/factories.ts` with test data factories
3. Pure service tests (Priority 1) — 10 files
4. Tool system tests (Priority 2) — 2 files
5. Zustand store tests (Priority 3) — 8 files
6. Rust: add `tempfile` dev-dep, refactor base paths, add test modules — 7 files
7. Verify coverage, fix gaps
