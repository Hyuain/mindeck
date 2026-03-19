/**
 * Knowledge Linker Agent App
 *
 * Auto-indexes workspace files into a searchable knowledge base with
 * LLM-powered extraction of summaries, concepts, tags, entities, and relations.
 */
import type {
  AgentAppManifest,
  AgentApp,
  AppContext,
  TriggerPayload,
  AgentMessage,
  HarnessTrigger,
  LLMClient,
} from "@/types"

// ─── Local Types ──────────────────────────────────────────

interface KnowledgeEntry {
  filePath: string
  summary: string
  concepts: string[]
  tags: string[]
  entities: string[]
  relations?: { target: string; type: string }[]
  lastIndexed: string
  contentHash: string
}

interface SearchResult {
  filePath: string
  relevance: number
  snippet: string
}

interface DispatchResult {
  question: string
  snippets: SearchResult[]
  totalIndexed: number
}

// ─── Manifest ─────────────────────────────────────────────

export const KNOWLEDGE_LINKER_MANIFEST: AgentAppManifest = {
  id: "native.knowledge-linker",
  name: "Knowledge Linker",
  kind: "native",
  version: "1.0.0",
  description:
    "Auto-indexes workspace files into a searchable knowledge base with LLM-powered extraction.",
  capabilities: { acceptsTasks: true },
  runtimeCapabilities: {
    llm: true,
    tools: ["read_file", "list_dir"],
    channel: true,
    storage: { scope: "workspace" },
  },
  toolExposure: "isolated",
  permissions: { filesystem: "read", network: "none", shell: false },
  lifecycle: { startup: "eager", persistence: "workspace" },
  harness: {
    triggers: [{ event: "file_written", pattern: "**/*.{md,txt,json,ts,tsx,py,rs}" }],
    feedbackToAgent: false,
  },
}

// ─── Utilities ────────────────────────────────────────────

const MAX_CONTENT_LENGTH = 4000
const DEBOUNCE_MS = 500

export function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return hash.toString(36)
}

function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_LENGTH) return content
  return content.slice(0, MAX_CONTENT_LENGTH)
}

function buildExtractionPrompt(filePath: string, content: string): AgentMessage[] {
  return [
    {
      role: "system",
      content:
        "You are a knowledge extraction assistant. Given a file's content, extract metadata as JSON.",
    },
    {
      role: "user",
      content: `Extract metadata from this file.

File: ${filePath}
Content:
${truncateContent(content)}

Respond with ONLY a JSON object (no markdown fences) with these fields:
- summary: string (1-2 sentence summary)
- concepts: string[] (key concepts/topics)
- tags: string[] (categorization tags)
- entities: string[] (named entities: people, projects, APIs, etc.)
- relations: { target: string, type: string }[] (relationships to other files or concepts)`,
    },
  ]
}

function buildQueryPrompt(question: string, indexSummary: string): AgentMessage[] {
  return [
    {
      role: "system",
      content:
        "You are a knowledge search assistant. Given an index of files and a question, return the most relevant files.",
    },
    {
      role: "user",
      content: `Question: ${question}

Index:
${indexSummary}

Return ONLY a JSON array (no markdown fences) of the top 5 most relevant entries:
[{ "filePath": "...", "relevance": 0.0-1.0, "snippet": "brief reason" }]
If fewer than 5 are relevant, return fewer. If none are relevant, return [].`,
    },
  ]
}

function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
    return JSON.parse(cleaned) as T
  } catch {
    return fallback
  }
}

// ─── Factory ──────────────────────────────────────────────

async function collectLLMText(llm: LLMClient, messages: AgentMessage[]): Promise<string> {
  let text = ""
  for await (const chunk of llm.chat(messages)) {
    if (chunk.type === "text" && chunk.content) text += chunk.content
  }
  return text
}

export function createKnowledgeLinker(): AgentApp {
  // All mutable state is inside this closure — each workspace gets its own instance
  let ctx: AppContext | null = null
  let pendingPaths: Set<string> = new Set()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let processingQueue: Promise<void> = Promise.resolve()

  async function processFile(filePath: string): Promise<void> {
    if (!ctx) return

    // Read file content
    let content: string
    try {
      const toolResult = await ctx.tools!.call("read_file", { path: filePath })
      content = toolResult.result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.channel?.send({
        type: "error",
        from: "knowledge-linker",
        payload: `[Knowledge Linker] Failed to read ${filePath}: ${message}`,
      })
      return
    }

    // Compute hash and check for changes
    const contentHash = simpleHash(content)
    const existingRaw = await ctx.storage!.get<KnowledgeEntry>(`index:${filePath}`)
    if (existingRaw !== null && existingRaw !== undefined) {
      if (existingRaw.contentHash === contentHash) {
        return // File unchanged, skip
      }
    }

    // Extract metadata via LLM
    const messages = buildExtractionPrompt(filePath, content)
    let llmResponse: string
    try {
      llmResponse = await collectLLMText(ctx.llm!, messages)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.channel?.send({
        type: "error",
        from: "knowledge-linker",
        payload: `[Knowledge Linker] LLM extraction failed for ${filePath}: ${message}`,
      })
      return
    }

    const extracted = parseJsonSafe<{
      summary: string
      concepts: string[]
      tags: string[]
      entities: string[]
      relations?: { target: string; type: string }[]
    }>(llmResponse, {
      summary: "",
      concepts: [],
      tags: [],
      entities: [],
    })

    const entry: KnowledgeEntry = {
      filePath,
      summary: extracted.summary,
      concepts: extracted.concepts,
      tags: extracted.tags,
      entities: extracted.entities,
      relations: extracted.relations,
      lastIndexed: new Date().toISOString(),
      contentHash,
    }

    await ctx.storage!.set(`index:${filePath}`, entry)
    ctx.channel?.send({
      type: "update",
      from: "knowledge-linker",
      payload: `[Knowledge Linker] Indexed: ${filePath}`,
    })
  }

  async function processBatch(paths: ReadonlyArray<string>): Promise<void> {
    for (const filePath of paths) {
      await processFile(filePath)
    }
  }

  function scheduleBatch(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      const pathsToProcess = [...pendingPaths]
      pendingPaths = new Set()

      // Chain onto the processing queue to avoid concurrent batches
      processingQueue = processingQueue.then(() => processBatch(pathsToProcess))
    }, DEBOUNCE_MS)
  }

  return {
    manifest: KNOWLEDGE_LINKER_MANIFEST,

    async activate(appCtx: AppContext): Promise<void> {
      ctx = appCtx
    },

    async deactivate(): Promise<void> {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      pendingPaths = new Set()
      ctx = null
    },

    async handleTrigger(_event: HarnessTrigger, payload: TriggerPayload): Promise<void> {
      if (!ctx || !payload.filePath) return

      pendingPaths.add(payload.filePath)
      scheduleBatch()
    },

    async handleDispatch(task: Record<string, unknown>): Promise<DispatchResult | null> {
      if (!ctx) return null

      const question = typeof task.question === "string" ? task.question : ""
      if (!question) return null

      // Load all indexed entries
      const entriesRecord = await ctx.storage!.query({ keyPrefix: "index:" })
      const knowledgeEntries = Object.values(entriesRecord) as KnowledgeEntry[]

      if (knowledgeEntries.length === 0) {
        return { question, snippets: [], totalIndexed: 0 }
      }

      // Build index summary for the LLM
      const indexSummary = knowledgeEntries
        .map(
          (e) =>
            `- ${e.filePath}: ${e.summary} [concepts: ${e.concepts.join(", ")}] [tags: ${e.tags.join(", ")}]`
        )
        .join("\n")

      const messages = buildQueryPrompt(question, indexSummary)
      let llmResponse: string
      try {
        llmResponse = await collectLLMText(ctx.llm!, messages)
      } catch {
        return { question, snippets: [], totalIndexed: knowledgeEntries.length }
      }

      const snippets = parseJsonSafe<SearchResult[]>(llmResponse, [])

      return {
        question,
        snippets,
        totalIndexed: knowledgeEntries.length,
      }
    },
  }
}
