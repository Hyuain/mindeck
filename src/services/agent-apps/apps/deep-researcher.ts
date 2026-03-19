import type {
  AgentAppManifest,
  AgentApp,
  AppContext,
  LLMClient,
  ToolClient,
  StorageClient,
  AgentMessage,
} from "@/types"

// ─── Local Types ──────────────────────────────────────────────

interface ResearchSource {
  title: string
  url?: string
  path?: string
  snippet: string
}

interface ResearchResult {
  topic: string
  summary: string
  keyFindings: string[]
  sources: ResearchSource[]
  openQuestions: string[]
  timestamp: string
}

interface ResearchPlanItem {
  query?: string
  url?: string
}

// ─── Manifest ─────────────────────────────────────────────────

export const DEEP_RESEARCHER_MANIFEST: AgentAppManifest = {
  id: "native.deep-researcher",
  name: "Deep Researcher",
  kind: "native",
  version: "1.0.0",
  description:
    "Multi-step research on any topic. Fetches sources, reads content, synthesizes structured reports.",
  capabilities: { acceptsTasks: true },
  runtimeCapabilities: {
    llm: true,
    tools: ["web_fetch", "read_file"],
    channel: true,
    storage: { scope: "workspace" },
  },
  toolExposure: "isolated",
  permissions: { filesystem: "read", network: "full", shell: false },
  lifecycle: { startup: "lazy", persistence: "session" },
}

// ─── Constants ────────────────────────────────────────────────

const MAX_SOURCES = 5
const SNIPPET_MAX_LENGTH = 1000

const PLAN_SYSTEM_PROMPT = `You are a research planning assistant. Given a topic, generate a research plan as a JSON array of objects. Each object should have either a "query" field (a search query or URL to fetch) or a "url" field (a direct URL). Return 3-5 items. Return ONLY the JSON array, no other text.

Example output:
[
  {"url": "https://en.wikipedia.org/wiki/Topic"},
  {"url": "https://example.com/article-about-topic"},
  {"query": "topic latest developments 2026"}
]`

const SYNTHESIS_SYSTEM_PROMPT = `You are a research synthesis assistant. Given raw source material, produce a structured research report as JSON with these fields:
- "summary": A 2-4 sentence overview of the findings
- "keyFindings": An array of 3-7 key findings (strings)
- "openQuestions": An array of 1-3 open questions that remain unanswered (strings)

Return ONLY the JSON object, no other text.`

// ─── Helpers ──────────────────────────────────────────────────

function truncateSnippet(text: string): string {
  if (text.length <= SNIPPET_MAX_LENGTH) return text
  return text.slice(0, SNIPPET_MAX_LENGTH) + "..."
}

async function collectLLMText(llm: LLMClient, messages: AgentMessage[]): Promise<string> {
  let text = ""
  for await (const chunk of llm.chat(messages)) {
    if (chunk.type === "text" && chunk.content) text += chunk.content
  }
  return text
}

function parseJsonSafe<T>(text: string, fallback: T): T {
  // Try to extract JSON from the response (handle markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const cleanText = jsonMatch ? jsonMatch[1].trim() : text.trim()

  try {
    return JSON.parse(cleanText) as T
  } catch {
    return fallback
  }
}

async function fetchSource(
  tools: ToolClient,
  item: ResearchPlanItem
): Promise<ResearchSource | null> {
  const url = item.url ?? item.query
  if (!url) return null

  try {
    const toolResult = await tools.call("web_fetch", { url })
    return {
      title: url,
      url,
      snippet: truncateSnippet(toolResult.result),
    }
  } catch {
    // Skip failed fetches gracefully
    return null
  }
}

// ─── Factory ──────────────────────────────────────────────────

export function createDeepResearcher(): AgentApp {
  let llm: LLMClient | undefined
  let tools: ToolClient | undefined
  let storage: StorageClient | undefined

  return {
    manifest: DEEP_RESEARCHER_MANIFEST,

    async activate(ctx: AppContext): Promise<void> {
      llm = ctx.llm
      tools = ctx.tools
      storage = ctx.storage
    },

    async deactivate(): Promise<void> {
      llm = undefined
      tools = undefined
      storage = undefined
    },

    async handleDispatch(payload: Record<string, unknown>): Promise<ResearchResult> {
      if (!llm || !tools || !storage) {
        throw new Error(
          "Deep Researcher not activated. Call activate() before handleDispatch()."
        )
      }

      const topic = String(payload.topic ?? "")
      if (!topic) {
        throw new Error("Missing required field: topic")
      }

      // Step 1: Generate research plan via LLM
      const planMessages: AgentMessage[] = [
        { role: "system", content: PLAN_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Research topic: ${topic}`,
        },
      ]

      const planText = await collectLLMText(llm, planMessages)
      const plan = parseJsonSafe<ResearchPlanItem[]>(planText, [])
      const limitedPlan = plan.slice(0, MAX_SOURCES)

      // Step 2: Execute plan — fetch sources in parallel, skip failures
      const sourcePromises = limitedPlan.map((item) => fetchSource(tools!, item))
      const sourceResults = await Promise.all(sourcePromises)
      const sources = sourceResults.filter((s): s is ResearchSource => s !== null)

      // Step 3: Synthesize findings via LLM
      const sourceSummaries = sources
        .map((s, i) => `Source ${i + 1} (${s.title}):\n${s.snippet}`)
        .join("\n\n---\n\n")

      const synthesisMessages: AgentMessage[] = [
        { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Topic: ${topic}\n\nSource material:\n${sourceSummaries || "No sources were successfully fetched."}`,
        },
      ]

      const synthesisText = await collectLLMText(llm, synthesisMessages)
      const synthesis = parseJsonSafe<{
        summary: string
        keyFindings: string[]
        openQuestions: string[]
      }>(synthesisText, {
        summary: synthesisText || "Unable to synthesize research findings.",
        keyFindings: [],
        openQuestions: [],
      })

      // Step 4: Build result
      const timestamp = new Date().toISOString()
      const result: ResearchResult = {
        topic,
        summary: synthesis.summary,
        keyFindings: synthesis.keyFindings,
        sources,
        openQuestions: synthesis.openQuestions,
        timestamp,
      }

      // Step 5: Persist to storage
      await storage.set(`research:${timestamp}`, result)

      return result
    },
  }
}
