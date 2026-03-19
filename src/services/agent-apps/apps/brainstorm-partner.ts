/**
 * Brainstorm Partner — interactive thinking partner using structured frameworks.
 *
 * Opens a dedicated pane for multi-turn dialogue, choosing a framework
 * (Six Thinking Hats, First Principles, SCAMPER, Devil's Advocate) based
 * on the problem type, then converges toward actionable insights.
 */
import type {
  AgentApp,
  AgentAppManifest,
  AgentMessage,
  AppContext,
  LLMClient,
  PaneClient,
} from "@/types"

// ─── Manifest ────────────────────────────────────────────────

export const BRAINSTORM_PARTNER_MANIFEST: AgentAppManifest = {
  id: "native.brainstorm-partner",
  name: "Brainstorm Partner",
  kind: "native",
  version: "1.0.0",
  description:
    "Interactive thinking partner using structured frameworks. Opens a dedicated pane for multi-turn dialogue.",
  capabilities: { acceptsTasks: true },
  runtimeCapabilities: {
    llm: true,
    channel: true,
    pane: true,
    storage: { scope: "workspace" },
  },
  toolExposure: "isolated",
  permissions: { filesystem: "none", network: "none", shell: false },
  lifecycle: { startup: "lazy", persistence: "session" },
}

// ─── Types ───────────────────────────────────────────────────

interface BrainstormResult {
  problem: string
  framework: string
  perspectives: { angle: string; ideas: string[] }[]
  topIdeas: { idea: string; pros: string[]; cons: string[] }[]
  nextSteps: string[]
  sessionDuration: number
}

interface DispatchPayload {
  problem: string
}

// ─── Constants ───────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a creative thinking partner. Your goal is to help the user brainstorm effectively using structured frameworks.

When presented with a problem:
1. Identify the best framework for the problem type:
   - **Six Thinking Hats** — for decisions requiring multiple perspectives (facts, emotions, caution, optimism, creativity, process)
   - **First Principles** — for problems that need to be broken down to fundamental truths and rebuilt
   - **SCAMPER** — for improving existing products, services, or processes (Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse)
   - **Devil's Advocate** — for stress-testing ideas by challenging assumptions and finding weaknesses

2. State which framework you chose and why (one sentence).
3. Ask probing questions ONE AT A TIME. Wait for the user's response before asking the next question.
4. Keep your responses concise — 2-4 sentences max per turn.
5. After several exchanges, converge toward actionable insights and concrete next steps.

Do NOT dump a wall of text. Be conversational, curious, and direct.`

const SUMMARY_PROMPT = `Based on our brainstorming conversation, produce a JSON summary with this exact structure (no markdown fences, just raw JSON):
{
  "framework": "<framework used>",
  "perspectives": [{ "angle": "<perspective name>", "ideas": ["<idea>", ...] }],
  "topIdeas": [{ "idea": "<idea>", "pros": ["<pro>", ...], "cons": ["<con>", ...] }],
  "nextSteps": ["<step>", ...]
}

Be concise but comprehensive. Include only the most valuable insights.`

const PANE_TITLE_MAX_LENGTH = 40

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Stream an LLM response to the pane and append the full text as an
 * assistant message to the conversation history.
 *
 * NOTE: We push onto `history` in-place. This is acceptable because
 * `history` is a local array owned by `handleDispatch` — it is not
 * shared state or a Zustand store.
 */
async function streamResponse(
  llm: LLMClient,
  history: AgentMessage[],
  pane: PaneClient,
): Promise<void> {
  let fullText = ""

  for await (const chunk of llm.chat(history)) {
    if (chunk.type === "text" && chunk.content) {
      pane.sendChunk(chunk.content)
      fullText += chunk.content
    }
  }

  history.push({ role: "assistant", content: fullText })
}

function truncateTitle(problem: string): string {
  if (problem.length <= PANE_TITLE_MAX_LENGTH) return problem
  return problem.slice(0, PANE_TITLE_MAX_LENGTH) + "..."
}

function buildDefaultResult(problem: string, duration: number): BrainstormResult {
  return {
    problem,
    framework: "unknown",
    perspectives: [],
    topIdeas: [],
    nextSteps: [],
    sessionDuration: duration,
  }
}

// ─── Factory ─────────────────────────────────────────────────

export function createBrainstormPartner(): AgentApp {
  let ctx: AppContext | undefined
  let activePane: PaneClient | undefined

  return {
    manifest: BRAINSTORM_PARTNER_MANIFEST,

    async activate(appContext: AppContext): Promise<void> {
      ctx = appContext
    },

    async deactivate(): Promise<void> {
      if (activePane?.isOpen()) {
        activePane.close()
      }
      activePane = undefined
      ctx = undefined
    },

    async handleDispatch(task: unknown): Promise<BrainstormResult> {
      const { problem } = task as DispatchPayload
      const startTime = Date.now()

      if (!ctx) throw new Error("Brainstorm Partner not activated")

      const llm = ctx.llm
      const pane = ctx.pane
      const storage = ctx.storage

      if (!llm) throw new Error("Brainstorm Partner requires LLM capability")
      if (!pane) throw new Error("Brainstorm Partner requires Pane capability")

      activePane = pane

      // 1. Open pane
      pane.open({ title: `Brainstorm: ${truncateTitle(problem)}` })

      // 2. Build initial history
      // NOTE: This is a local array — mutations via push are acceptable
      // since it is not shared state.
      const history: AgentMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: problem },
      ]

      // 3. Stream initial LLM response
      await streamResponse(llm, history, pane)

      // 4. Listen for user messages + wait for pane close
      const closePromise = new Promise<void>((resolve) => {
        pane.onClose(() => resolve())
      })

      pane.onUserMessage((text: string) => {
        history.push({ role: "user", content: text })
        void streamResponse(llm, history, pane)
      })

      await closePromise

      // 5. Generate summary
      const duration = Date.now() - startTime
      const summaryHistory: AgentMessage[] = [
        ...history,
        { role: "user", content: SUMMARY_PROMPT },
      ]

      let summaryText = ""
      for await (const chunk of llm.chat(summaryHistory)) {
        if (chunk.type === "text" && chunk.content) {
          summaryText += chunk.content
        }
      }

      let result: BrainstormResult
      try {
        const parsed = JSON.parse(summaryText) as Omit<
          BrainstormResult,
          "problem" | "sessionDuration"
        >
        result = {
          problem,
          framework: parsed.framework,
          perspectives: parsed.perspectives,
          topIdeas: parsed.topIdeas,
          nextSteps: parsed.nextSteps,
          sessionDuration: duration,
        }
      } catch {
        result = buildDefaultResult(problem, duration)
      }

      // 6. Persist result
      if (storage) {
        await storage.set(`brainstorm-${Date.now()}`, result)
      }

      activePane = undefined

      return result
    },
  }
}
