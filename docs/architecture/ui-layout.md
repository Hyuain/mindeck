# UI & Layout

> Three-column layout, design system, and pane architecture.
>
> Related: [agent-apps](./agent-apps.md) · [overview](./overview.md)

---

## Three-Column Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Majordomo Panel  │  Workspace Chat  │  FlexibleWorkspace     │
│  (262px, violet)  │  (350px, emerald)│  (flex, split panes)   │
│                   │                  │                        │
│  Global orchestr. │  Per-workspace   │  Agent App panes       │
│  Cross-WS tasks   │  chat + tools    │  File viewers          │
│  Permission UI    │  Skill suggest.  │  Observability         │
│  Result cards     │  Tool activity   │  Settings              │
│                   │                  │                        │
│  ⌘K palette       │  / slash cmds    │  Drag-to-split         │
└──────────────────────────────────────────────────────────────┘
```

- **Column 1 (Majordomo)**: Always visible. Violet accent. Dispatches tasks, shows results, handles permissions.
- **Column 2 (Workspace Chat)**: Emerald accent. Active workspace's conversation. Slash commands, skill suggestions.
- **Column 3 (FlexibleWorkspace)**: Flexible width. Split-pane container for Agent App panes, files, settings.

### Panel Persistence

`stores/layout.ts` persists:
- Panel widths (Majordomo, Chat, Workspace)
- Collapsed state
- Per-workspace pane layouts

Resize: `pointerCapture` + DOM-direct style mutation during drag (performance), store update on `pointerUp`.

---

## FlexibleWorkspace Pane System

### Pane Types

```typescript
type PaneType = "agent" | "file" | "agent-app"
```

| Type | Content | Source |
|------|---------|--------|
| `agent` | Workspace chat panel | Built-in (orchestrator) |
| `file` | File viewer/editor | File Explorer |
| `agent-app` | Agent App UI | Agent App manifest `capabilities.ui` |

### Agent App Rendering

| App Source | Renderer | Access |
|-----------|----------|--------|
| MCP App (`ui://`) | Sandboxed iframe, `srcdoc` or `src` | JSON-RPC over `postMessage` |
| Native | React component in pane | Full access to design tokens + stores |
| A2UI (future) | JSON blueprint → React components | Mindeck's component library |
| Script | iframe (sandboxed) or native (if trusted) | Depends on trust level |

### Layout Operations

- Drag from AgentsPanel → drop into FlexibleWorkspace → creates new pane
- Split horizontally/vertically
- Pane restore on workspace switch (from serialized layout)

---

## Design System

### Design Tokens (in `globals.css`)

**Backgrounds** (0 = darkest/lightest):
- `--color-bg-0` through `--color-bg-5`

**Text**:
- `--color-t0` (primary), `--color-t1` (secondary), `--color-t2` (muted)

**Borders**:
- `--color-bd` (base), `--color-bdd` (divider), `--color-bdh` (hover)

**Accents**:
- `--color-ac`: Workspace accent (emerald `#10b981`)
- `--color-mj`: Majordomo accent (violet `#a78bfa`)

**Typography**:
- `--font-sans`: Plus Jakarta Sans (UI text)
- `--font-mono`: JetBrains Mono (code, monospace)

### Color Philosophy

- Dark base: `#111110` warm near-black (brown undertone)
- Light base: `#ede8e0` warm parchment
- Messages: editorial left-border style (no avatar bubbles)

### Styling Rules

- Use CSS custom properties for design token values (colors, fonts)
- Do **not** use Tailwind for token values — use `var(--color-*)` instead
- Tailwind utility classes OK for layout/spacing helpers
- Component CSS lives in `globals.css` (colocated with tokens)

---

## Key UI Components

| Component | File | Purpose |
|-----------|------|---------|
| `AgentsPanel` | `agents/AgentsPanel.tsx` | Agents + Apps tab with bot/plug toggle |
| `ChatPanel` | `chat/ChatPanel.tsx` | Workspace conversation |
| `ChatInput` | `chat/ChatInput.tsx` | Input with slash commands |
| `SkillSuggestionBar` | `chat/SkillSuggestionBar.tsx` | Auto-suggested skills above input |
| `SlashCommandDropdown` | `ui/SlashCommandDropdown.tsx` | `/skill` autocomplete with `argumentHint` |
| `MajordomoPanel` | `majordomo/MajordomoPanel.tsx` | Global orchestrator with streaming |
| `CommandPalette` | `majordomo/CommandPalette.tsx` | ⌘K palette |
| `FlexibleWorkspace` | `workspace/FlexibleWorkspace.tsx` | Split-pane container |
| `AgentAppPane` | `workspace/AgentAppPane.tsx` | Agent App renderer |
| `MCPServerForm` | `workspace/MCPServerForm.tsx` | MCP server add/edit form |
| `ToolResultBubble` | `chat/ToolResultBubble.tsx` | Tool result with injection warning |
| `ObservabilityDashboard` | `observability/ObservabilityDashboard.tsx` | Metrics overlay |
