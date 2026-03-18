<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="Mindeck Logo" />
</p>

<h1 align="center">Mindeck</h1>

<p align="center">
  <strong>Open-source, local-first Agent Workflow OS for desktop</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="docs/USER_GUIDE.md">User Guide</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#contributing">Contributing</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.0.1-blue" alt="Version" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/tauri-2.x-orange" alt="Tauri" />
  <img src="https://img.shields.io/badge/react-19-blue" alt="React" />
</p>

---

## Why Mindeck?

Most AI chat tools are cloud-hosted, single-context, and lock you into one provider. Developers and knowledge workers deserve better — a tool that runs on your machine, connects to any LLM provider you choose, and lets you orchestrate complex agent workflows across multiple projects simultaneously.

**Mindeck is that tool.** It's a native desktop app that connects to any OpenAI-compatible API (DeepSeek, Qwen, Ollama, MiniMax, and more), keeps your data entirely local, and gives you a full multi-workspace agent environment — with no vendor lock-in and complete control over your keys and data.

### Key Differentiators

| Feature | Mindeck | Open WebUI | LobeChat | Dify |
|---------|---------|------------|----------|------|
| Local-first (desktop) | Yes | Partial | No | No |
| Multi-workspace | Yes | No | No | Limited |
| Agent orchestration | Yes | No | Basic | Yes |
| BYOK (any provider) | Yes | Yes | Yes | Yes |
| Cross-workspace dispatch | Yes | No | No | No |
| MCP protocol support | Yes | No | No | No |
| OS Keychain security | Yes | No | No | No |

---

## Features

### Multi-Workspace Environment
Create isolated workspaces for different projects, each with its own agent configuration, conversation history, tool access, and file context. Switch between workspaces instantly — no context bleed.

### Majordomo (Cross-Workspace Orchestrator)
A system-level agent that sees across all your workspaces. It can dispatch tasks to workspace agents, aggregate results, and coordinate multi-step workflows that span multiple contexts.

### Agentic Tool Calling
Each workspace agent runs a full multi-turn agentic loop with:
- **Built-in tools**: file read/write, directory listing, shell execution, web fetch
- **Sub-agent spawning**: delegate subtasks to parallel sub-agents
- **MCP server integration**: connect any Model Context Protocol server for custom tools
- **Doom-loop detection**: automatically breaks infinite tool-calling cycles
- **Context compaction**: handles long conversations without losing important context

### Bring Your Own Key (BYOK)
Connect to any LLM provider:
- **Ollama** (local models)
- **OpenAI-compatible** APIs (DeepSeek, Qwen, OpenAI, Groq, Together, etc.)
- **MiniMax** (Anthropic-format API)
- API keys stored exclusively in your OS Keychain — never written to disk

### Skill System
Extend agent behavior with reusable skills:
- Write skills as `SKILL.md` files with frontmatter metadata
- Auto-discover skills from workspace, user, and plugin directories
- Slash-command activation (`/skillname`) in chat
- Auto-matching suggestions based on message content
- Import/export skills between workspaces

### Agent Apps & Harness Engine
- **Native Apps**: TypeScript compiler, ESLint, test runner integration
- **Custom Scripts**: Write TypeScript agent scripts in `~/.mindeck/scripts/`
- **Harness Triggers**: Auto-run apps when files change or tools complete (glob-based matching)

### Security
- **OS Keychain**: API keys stored in macOS Keychain / Linux Secret Service / Windows Credential Manager
- **Prompt injection detection**: Scans tool results for injection attempts (HIGH/MEDIUM/LOW severity)
- **Permission gating**: Sensitive operations (shell, network) require explicit user approval
- **Path confinement**: File operations restricted to home directory and workspace paths
- **Audit trail**: All security events logged to `~/.mindeck/audit.jsonl`
- **Docker sandbox**: Optional container isolation for workspace agent execution

### Observability
- Per-workspace metrics: tool call counts, success rates, estimated token usage
- Top tools visualization with error rate breakdown
- Structured logging with circular buffer + file persistence

### Preview Panel
Rich content rendering with auto-detection:
- **Markdown**: GitHub Flavored Markdown with syntax highlighting
- **Code**: Language-aware syntax highlighting
- **Images**: Responsive image display
- **Raw**: Plain text fallback

### Flexible Layout
- **3-column layout**: Majordomo | Workspace | Right Panel (Files/Skills/Agents)
- **Resizable panels**: Drag borders to resize any column
- **Split panes**: Unlimited horizontal/vertical splits within workspace
- **Layout persistence**: Panel sizes and pane arrangements saved per workspace
- **Dark/Light themes**: Warm color palette with Plus Jakarta Sans + JetBrains Mono typography

---

## Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 8+ | `npm install -g pnpm` |
| **Rust** | 1.70+ | [rustup.rs](https://rustup.rs/) |
| **Xcode CLI** (macOS) | Latest | `xcode-select --install` |

### Install & Run

```bash
# Clone the repository
git clone https://github.com/Hyuain/mindeck.git
cd mindeck

# Install dependencies
pnpm install

# Run in development mode (Vite + Tauri together)
pnpm tauri dev
```

The app opens at a native window (1280x800 default). Vite dev server runs at `http://localhost:5173` with hot module replacement.

### First Steps

1. **Add a provider**: Click the settings gear icon, go to **Providers**, and add your API provider (DeepSeek, Ollama, etc.)
2. **Create a workspace**: In the Majordomo panel (left), click **+ New Workspace**
3. **Start chatting**: Type in the workspace chat panel and press Enter
4. **Try tools**: Enable the agentic loop in workspace settings to let the agent use built-in tools

---

## Installation

### From Source (All Platforms)

```bash
git clone https://github.com/Hyuain/mindeck.git
cd mindeck
pnpm install
pnpm tauri build
```

The built application will be in `src-tauri/target/release/bundle/`.

### macOS 26 (Sequoia+)

macOS 26 requires code signing even for local development builds:

```bash
pnpm build
cargo build --manifest-path src-tauri/Cargo.toml
codesign --force --sign - --entitlements src-tauri/entitlements.plist \
  src-tauri/target/debug/mindeck
```

Or use `pnpm tauri dev` which handles this automatically.

### Platform-Specific Dependencies

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
  libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

**Windows:**
- Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop Runtime** | Tauri 2.x (Rust) |
| **Frontend** | React 19 + TypeScript 5.9 |
| **Build** | Vite 7.3 |
| **Styling** | Tailwind CSS v4 + CSS custom properties |
| **State** | Zustand 5.0 (immutable patterns) |
| **Icons** | Lucide React |
| **Markdown** | react-markdown + remark-gfm + rehype-highlight |
| **HTTP** | reqwest (Rust, rustls-tls) |
| **Security** | OS Keychain (keyring crate), DOMPurify |

### System Overview

```
┌─────────────────────────────────────────────────┐
│                  Mindeck Desktop                 │
├──────────┬──────────────────┬───────────────────┤
│ Majordomo│   Workspace(s)   │   Right Panel     │
│  Panel   │                  │  Files / Skills   │
│ (violet) │    Chat + Panes  │  Agents / Apps    │
│          │    (emerald)     │                   │
├──────────┴──────────────────┴───────────────────┤
│              Zustand Stores (React)              │
├─────────────────────────────────────────────────┤
│          Services Layer (TypeScript)             │
│  Agents │ Tools │ Skills │ MCP │ Events │ Conv  │
├─────────────────────────────────────────────────┤
│           Tauri IPC Bridge (invoke/channel)      │
├─────────────────────────────────────────────────┤
│              Rust Backend (Tauri 2)              │
│  Keychain │ Stream │ Files │ Shell │ Sandbox     │
├─────────────────────────────────────────────────┤
│              OS (macOS / Linux / Windows)         │
└─────────────────────────────────────────────────┘
```

### Data Storage

All data lives locally in `~/.mindeck/`:

```
~/.mindeck/
├── providers/           # Provider configs (JSON, no API keys)
├── workspaces/          # One directory per workspace
│   └── <id>/
│       ├── workspace.json
│       ├── conversations/main.jsonl
│       ├── memory.json
│       └── knowledge/
├── skills/              # Global skill definitions
├── scripts/             # User TypeScript agent scripts
├── events/              # Event persistence (JSONL)
├── metrics/             # Observability data
├── logs/                # Application logs
├── audit.jsonl          # Security audit trail
└── cache/               # Temporary data
```

**API keys** are stored exclusively in the OS Keychain — never in files, environment variables, or application state.

---

## Development

### Available Scripts

```bash
pnpm dev          # Start Vite dev server (port 5173)
pnpm tauri dev    # Start Vite + Tauri together (preferred)
pnpm build        # TypeScript check + Vite production build
pnpm tauri build  # Full native app bundle
pnpm typecheck    # TypeScript strict checking
pnpm lint         # ESLint (zero warnings enforced)
pnpm format       # Prettier formatting
pnpm test         # Vitest (single run)
```

### Project Structure

```
src/
  app/          # App.tsx, globals.css (design tokens)
  components/   # React components by domain
  hooks/        # Custom React hooks
  services/     # Business logic (agents, tools, providers, etc.)
  stores/       # Zustand state management
  types/        # Shared TypeScript types
src-tauri/
  src/commands/ # Rust backend commands (one file per domain)
  Cargo.toml    # Rust dependencies
  tauri.conf.json
```

### Code Conventions

- **TypeScript strict mode** with `noUnusedLocals` and `noUnusedParameters`
- **Immutable state**: Never mutate Zustand state or function parameters
- **One component per file**, max ~300 lines
- **Path alias**: `@/` maps to `src/`
- **Styling**: CSS custom properties for design tokens, Tailwind for layout utilities
- **Commit format**: `feat|fix|refactor|docs|test|chore|perf|ci: description`

See [CLAUDE.md](CLAUDE.md) for the full conventions reference.

---

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feat/your-feature`
3. **Make changes** following the [code conventions](#code-conventions)
4. **Test**: `pnpm test && pnpm typecheck && pnpm lint`
5. **Commit**: Use [conventional commits](https://www.conventionalcommits.org/) format
6. **Open a PR** against `main`

### Areas Where Help Is Needed

- Linux and Windows testing
- Provider adapter contributions (new API formats)
- Skill library expansion
- Translations / i18n
- Documentation improvements
- Bug reports and feature requests

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## Roadmap

- [ ] Git integration panel (view diffs, commits, branches)
- [ ] Plugin marketplace for skills and agent apps
- [ ] Container sandbox UI visualization
- [ ] Advanced workspace templates
- [ ] i18n support (Chinese, Vietnamese, Farsi priority)
- [ ] Auto-update mechanism
- [ ] Mobile companion app

---

## License

[MIT](LICENSE) -- Free for personal and commercial use.

---

## Acknowledgments

Built with [Tauri](https://tauri.app/), [React](https://react.dev/), and the open-source community.

Designed for developers and knowledge workers who want full control over their AI workflow.
