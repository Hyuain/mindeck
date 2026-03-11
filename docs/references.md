# Mindeck — References & Industry Context

> External links, competitive landscape, and background research.
> Last updated: 2026-03-11

---

## 1. The Harness Engineering Paradigm

The industry has shifted from **Context Engineering** (what info to give the model) to **Harness Engineering** (the entire environment around the model: constraints, feedback loops, observability, enforcement).

Key evidence:
- **OpenAI**: 3 engineers, 5 months, 1M lines of production code, zero hand-written — humans built the harness, not the code
- **Vercel**: Reduced agent tools from 15 → 2, accuracy 80% → 100%, tokens -37%
- **LangChain**: Same model, harness-only changes, Terminal-Bench rank #30 → #5

Four pillars:
1. **Constrain** — architecture boundaries, dependency rules, mechanical enforcement
2. **Verify** — CI gates, linters, type checkers, self-verification loops
3. **Inform** — context engineering, AGENTS.md, semantic context maps
4. **Correct** — feedback loops, self-repair, doom loop detection

### Links

- [OpenAI Harness Engineering](https://openai.com/mk-MK/index/harness-engineering/)
- [LangChain: Improving Deep Agents](https://blog.langchain.com/improving-deep-agents-with-harness-engineering/)
- [Vercel: We Removed 80% of Our Agent's Tools](https://vercel.com/blog/we-removed-80-percent-of-our-agents-tools)
- [Harness Engineering Is Not Context Engineering](https://mtrajan.substack.com/p/harness-engineering-is-not-context)
- [Agent Harnesses: Controlling AI Agents in 2026](https://htek.dev/articles/agent-harnesses-controlling-ai-agents-2026/)

---

## 2. Model Landscape (March 2026)

| Model | Release | Key Capabilities |
|-------|---------|-----------------|
| GPT-5.4 | 2026-03-05 | Native computer use, 1M context, 5 reasoning levels, OSWorld 75% |
| Claude Opus 4.6 | 2026-02-05 | Terminal-Bench SOTA, agent teams, context compaction API, 1M context |

**Consensus**: Model choice is secondary to harness quality above a capability threshold.

---

## 3. Protocol Landscape

### MCP (Model Context Protocol)

- 97M SDK downloads, 13,000+ servers
- Built into Cursor, VS Code, Claude Desktop, Copilot, JetBrains, Windsurf, Zed
- Linux Foundation AAIF governance (OpenAI, Google, Microsoft, Anthropic)
- JSON-RPC 2.0, Streamable HTTP transport

### AGENTS.md

- 60,000+ GitHub repos adopted
- 28.6% faster runtime, 16.6% fewer output tokens (peer-reviewed)

### Links

- [MCP Developer Guide 2026](https://lushbinary.com/blog/mcp-model-context-protocol-developer-guide-2026/)
- [MCP Apps — UI Capabilities](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- [MCP Apps Specification](https://modelcontextprotocol.io/docs/extensions/apps)
- [A2UI vs MCP Apps](https://a2ui.sh/articles/a2ui-vs-mcp-apps)
- [Google A2UI Introduction](https://developers.googleblog.com/en/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)
- [AGENTS.md Research](https://www.contextstudios.ai/blog/agentsmd-le-guide-bas-sur-la-recherche-pour-rendre-les-agents-ia-29-plus-rapides)

---

## 4. Competitive Landscape

### Tauri-Based AI Desktop Apps

| App | Stack | Differentiator |
|-----|-------|---------------|
| OpenPawz | Tauri v2, 75+ tools | 5MB binary, MCP, hybrid memory, 11 channel bridges |
| Synthesis OS | Tauri + React | macOS AI-native OS layer, 60+ native tools, ONNX embeddings |
| Nemo Agent | Tauri + Rust | 200+ MCP connections, 500+ skills |
| Beadbox | Tauri + Next.js | Multi-workspace dashboard, real-time sync |
| **Mindeck** | Tauri v2 + React 19 | Majordomo hierarchy, multi-workspace isolation, harness-first |

### Broader AI Desktop/Agent Market

| App | Stars | BYOK | Multi-WS | Local Data | Agent Workflow |
|-----|-------|------|----------|------------|---------------|
| Open WebUI | 126k | Yes | No | Partial | Basic |
| LobeChat | 60k | Yes | No | No | No |
| Dify | 90k | No | Yes | No | Yes (web-only) |
| **Mindeck** | — | Yes | Yes | Yes | Yes (harness-first) |

**Gap none fill**: BYOK + multi-workspace + local-first + agent workflow + harness engineering.

---

## 5. Agent Sandboxing References

- [OpenAI Codex Sandboxing](https://developers.openai.com/codex/concepts/sandboxing/) — three modes, platform-native enforcement
- [Docker Sandboxes Architecture](https://docs.docker.com/ai/sandboxes/architecture/) — microVM per agent
- [Shuru — Local-first MicroVM](https://shuru.run/) — Apple Virtualization.framework, ephemeral VMs
- [NanoClaw Containerized AI Agents](https://thenewstack.io/nanoclaw-containerized-ai-agents/)

---

## 6. Context & Knowledge References

- [AI Agent Context Compression Strategies](https://zylos.ai/research/2026-02-28-ai-agent-context-compression-strategies)
- [Building AI Coding Agents for the Terminal (arxiv 2603.05344)](https://arxiv.org/abs/2603.05344)
- [MCP-UI Protocol Details](https://mcpui.dev/guide/protocol-details)
- [@modelcontextprotocol/ext-apps SDK](https://apps.extensions.modelcontextprotocol.io/api/)
