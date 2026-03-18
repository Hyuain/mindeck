# Contributing to Mindeck

Thank you for your interest in contributing to Mindeck! This guide will help you get started.

## Code of Conduct

Be respectful, inclusive, and constructive. We want Mindeck to be a welcoming project for everyone.

## How to Contribute

### Reporting Bugs

1. Search [existing issues](https://github.com/Hyuain/mindeck/issues) first
2. Open a new issue with:
   - Clear title describing the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - OS, Mindeck version, and provider details
   - Screenshots or logs if applicable (`~/.mindeck/logs/mindeck.log`)

### Suggesting Features

Open a [feature request issue](https://github.com/Hyuain/mindeck/issues/new) with:
- Use case: What problem does this solve?
- Proposed solution: How should it work?
- Alternatives considered: Other approaches you thought about

### Submitting Code

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feat/your-feature`
3. **Make your changes** following the conventions below
4. **Test**: `pnpm test && pnpm typecheck && pnpm lint`
5. **Commit** using [conventional commits](https://www.conventionalcommits.org/):
   ```
   feat: add new provider adapter for X
   fix: prevent crash when workspace has no model
   refactor: extract tool execution into separate module
   ```
6. **Push** and open a Pull Request against `main`

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 8+
- Rust 1.70+ (via [rustup](https://rustup.rs/))
- Xcode CLI Tools (macOS): `xcode-select --install`

### Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/mindeck.git
cd mindeck
pnpm install
pnpm tauri dev
```

### Running Checks

```bash
pnpm typecheck    # TypeScript strict checking
pnpm lint         # ESLint (zero warnings)
pnpm test         # Vitest
pnpm format       # Prettier formatting
```

## Code Conventions

### TypeScript

- **Strict mode** with `noUnusedLocals` and `noUnusedParameters`
- Use `type` imports where possible
- No `any` — use `unknown` + type guards
- Path alias: `@/` maps to `src/`

### Components

- One component per file, filename = component name
- Props interfaces defined in the same file
- Max ~300 lines per file

### State Management

- **Never mutate** Zustand state in-place — always return new objects
- **Never mutate** function parameters

### Styling

- CSS custom properties (`var(--color-bg-0)`) for design tokens
- Tailwind utilities for layout/spacing only
- No Tailwind for colors or fonts — use CSS variables

### Rust

- Commands go in `src-tauri/src/commands/` (one file per domain)
- Register new commands in `lib.rs`
- Use `thiserror` for error types

### Commits

Format: `<type>: <description>`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

## Project Structure

```
src/
  app/          # App.tsx, globals.css
  components/   # React components (by domain)
  hooks/        # Custom hooks
  services/     # Business logic
  stores/       # Zustand stores
  types/        # Shared TypeScript types
src-tauri/
  src/commands/ # Rust backend commands
```

See [CLAUDE.md](CLAUDE.md) for the full conventions reference.

## Areas Where Help Is Needed

- **Platform testing**: Linux and Windows coverage
- **Provider adapters**: New LLM API formats
- **Skills**: Expand the skill library
- **i18n**: Translations (Chinese, Vietnamese, Farsi priority)
- **Documentation**: Tutorials, guides, examples
- **Accessibility**: Screen reader support, keyboard navigation improvements

## Review Process

1. A maintainer will review your PR within a few days
2. Address any feedback
3. Once approved, a maintainer will merge your PR

## Questions?

Open a [Discussion](https://github.com/Hyuain/mindeck/discussions) or ask in an issue. We're happy to help!
