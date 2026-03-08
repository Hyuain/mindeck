/**
 * MajordomoAgent — encapsulates all agent logic for the Majordomo panel.
 *
 * Responsibilities:
 *  - History building from useChatStore (MAJORDOMO_WS_ID)
 *  - Running the agentic loop (runAgentLoop)
 *  - Fake-dispatch detection + retry logic
 *  - Tool-audit injection between assistant turns
 *  - Digest flow (auto-summarise workspace task results)
 *  - Pending digest queue (drain after each stream)
 */
import { runAgentLoop, type AgentLoopResult } from "./agentic-loop"
import { getToolDefinitions } from "./tools/registry"
import { makeMessage, appendMajordomoMessage, MAJORDOMO_WS_ID } from "./conversation"
import { createLogger } from "./logger"
import { useChatStore } from "@/stores/chat"
import { useMajordomoStore } from "@/stores/majordomo"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import type {
  ModelCapabilities,
  ToolActivity,
  TaskResultEvent,
  Workspace,
  WorkspaceSummary,
  Skill,
} from "@/types"

const log = createLogger("MajordomoAgent")

/** Additional tool-use notice prepended to system prompt for weak function-callers. */
const WEAK_FC_PREAMBLE = `⚠️ TOOL-CALLING NOTICE: This model has limited native function-calling support.
- To dispatch a task you MUST produce a real tool function call for dispatch_to_workspace.
- Do NOT write text like "I've dispatched" or "task sent" — only a real call counts.
- If you cannot produce a tool call, say so explicitly.`

export interface RunTurnOpts {
  systemPrompt: string
  tools: ReturnType<typeof getToolDefinitions>
  /** When true, skip fake-dispatch detection and retry logic */
  isDigest?: boolean
  /** Injected into history as an ephemeral user message — not stored/displayed */
  extraUserContent?: string
  /** Internal: current retry count (prevents infinite loops) */
  retryCount?: number
  /** Model capabilities resolved by the caller; used to gate tool injection */
  modelCapabilities?: ModelCapabilities
}

// ─── MajordomoAgent ───────────────────────────────────────────────────────────

export class MajordomoAgent {
  private abortController: AbortController = new AbortController()
  private pendingDigests: TaskResultEvent[] = []

  // Callbacks wired by MajordomoPanel
  onChunk?: (delta: string) => void
  onToolStart?: (activity: ToolActivity) => void
  onToolEnd?: (activity: ToolActivity) => void

  // ── Core turn ─────────────────────────────────────────────────────────────

  /**
   * Run one Majordomo turn: build history, stream, handle tool calls, persist.
   */
  async runTurn(opts: RunTurnOpts): Promise<void> {
    const {
      systemPrompt,
      tools,
      isDigest = false,
      extraUserContent,
      retryCount = 0,
      modelCapabilities: capsOverride,
    } = opts

    const mjStore = useMajordomoStore.getState()
    const providerStore = useProviderStore.getState()

    const provider =
      providerStore.providers.find((p) => p.id === mjStore.selectedProviderId) ??
      providerStore.providers[0]
    if (!provider) return

    const modelId =
      (mjStore.selectedModelId || provider.defaultModel) ??
      provider.models?.[0]?.id ??
      "llama3.2"

    // Resolve model capabilities — caller may supply them; otherwise look up from provider.
    const caps: ModelCapabilities =
      capsOverride ?? provider.models?.find((m) => m.id === modelId)?.capabilities ?? {}

    // For models with no function-calling support, strip tools from the request.
    const effectiveTools = caps.functionCalling === "none" ? [] : tools

    // For weak function-callers, reinforce the instruction at the top of the system prompt.
    const effectiveSystemPrompt =
      caps.functionCalling === "weak"
        ? `${WEAK_FC_PREAMBLE}\n\n${systemPrompt}`
        : systemPrompt

    const history = this._buildHistory(effectiveSystemPrompt, extraUserContent)

    const aiMsg = makeMessage("assistant", "", modelId, provider.id)
    useChatStore.getState().pushMessageDraft(MAJORDOMO_WS_ID, aiMsg)
    mjStore.setStreaming(true)

    this.abortController.abort()
    this.abortController = new AbortController()

    const providerType = provider.type ?? ""

    let full = ""
    let loopResult: AgentLoopResult | undefined
    try {
      loopResult = await runAgentLoop({
        providerId: provider.id,
        providerType,
        modelId,
        history,
        tools: effectiveTools,
        signal: this.abortController.signal,
        onChunk: (delta) => {
          full += delta
          useChatStore.getState().updateLastMessage(MAJORDOMO_WS_ID, { content: full })
          this.onChunk?.(delta)
        },
        onToolStart: (activity) => {
          useMajordomoStore.getState().setToolActivity(activity)
          this.onToolStart?.(activity)
        },
        onToolEnd: (activity) => {
          useMajordomoStore.getState().setToolActivity(activity)
          this.onToolEnd?.(activity)
        },
      })
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        const msg = `Error: ${(err as Error).message}`
        useChatStore.getState().updateLastMessage(MAJORDOMO_WS_ID, { content: msg })
        full = msg
      }
    } finally {
      useMajordomoStore.getState().setStreaming(false)

      // Strip any fake tool-audit annotations the model reproduced
      full = full.replace(/\n?\[Tools actually called:[^\]]*\]/g, "")
      full = full.replace(/\n?\[audit\][^\n]*/g, "")

      // Detect fake dispatches: text mentions dispatching but no tool was called
      const dispatchMentioned =
        full &&
        /dispatch|派发|已派发|dispatched|re-dispatch/i.test(full) &&
        tools.length > 0
      const actuallyDispatched = loopResult?.toolsCalled.includes("dispatch_to_workspace")

      if (dispatchMentioned && !actuallyDispatched && !isDigest && retryCount < 1) {
        // Auto-retry: remove the draft, inject a correction, and retry once
        useChatStore.getState().removeDraftIfEmpty(MAJORDOMO_WS_ID)
        const correctionMsg = makeMessage(
          "user",
          "⚠️ Your previous response described dispatching but did NOT actually call the dispatch_to_workspace tool. Text alone does NOT dispatch. You MUST use the tool function call. Try again now — call the tool, do not just describe it."
        )
        useChatStore.getState().appendMessage(MAJORDOMO_WS_ID, correctionMsg)
        await appendMajordomoMessage(correctionMsg).catch(console.warn)
        await this.runTurn({ ...opts, retryCount: retryCount + 1 })
        return
      }

      if (dispatchMentioned && !actuallyDispatched && !isDigest) {
        full +=
          "\n\n⚠️ *The dispatch_to_workspace tool was not called. The task was NOT sent. This may be a model limitation — try a different model or resend your request.*"
        useChatStore.getState().updateLastMessage(MAJORDOMO_WS_ID, { content: full })
      }

      if (full.trim()) {
        const metadata: Record<string, unknown> = {}
        if (loopResult && loopResult.toolsCalled.length > 0) {
          metadata.toolsCalled = loopResult.toolsCalled
        }
        appendMajordomoMessage({ ...aiMsg, content: full, metadata }).catch(console.warn)
      } else if (isDigest) {
        useChatStore.getState().removeDraftIfEmpty(MAJORDOMO_WS_ID)
      }

      // Drain any digest events that queued while we were streaming
      this._drainPendingDigests()
    }
  }

  // ── Digest flow ───────────────────────────────────────────────────────────

  /**
   * Handle a workspace task result. If Majordomo is currently streaming,
   * the event is queued and processed after the current stream finishes.
   */
  async handleDigest(event: TaskResultEvent): Promise<void> {
    if (!event.result.trim()) return

    if (useMajordomoStore.getState().isStreaming) {
      this.pendingDigests = [...this.pendingDigests, event]
      return
    }

    const { workspaces } = useWorkspaceStore.getState()
    const workspaceName =
      workspaces.find((w) => w.id === event.workspaceId)?.name ?? event.workspaceId

    const freshSummaryText = workspaces
      .map(
        (w) =>
          `[${w.name}] status=${w.status} summary="${w.stateSummary ?? "no activity yet"}"`
      )
      .join("\n")

    const digestPrompt =
      `You are Majordomo, a global cross-workspace assistant for Mindeck. You have visibility into all workspaces.\n\nCurrent workspace states:\n${freshSummaryText}\n\nBe concise. Reference workspaces by name. Help the user orchestrate their work.` +
      `\n\nA workspace just completed a delegated task and reported back. Briefly summarize what was accomplished (1-3 sentences). Always acknowledge completion. Do NOT offer to dispatch more tasks or take actions — you have NO tools in this turn.`

    const triggerContent = `[System: "${workspaceName}" completed its task and reported results]\n\n${event.result}`

    useMajordomoStore.getState().clearToolActivities()
    await this.runTurn({
      systemPrompt: digestPrompt,
      tools: [],
      isDigest: true,
      extraUserContent: triggerContent,
    })
  }

  // ── Send user message ─────────────────────────────────────────────────────

  /**
   * Send a user message and run a Majordomo turn.
   */
  async send(
    content: string,
    workspaces: Workspace[],
    workspaceSummaries: WorkspaceSummary[],
    activeSkill?: Skill
  ): Promise<void> {
    const mjStore = useMajordomoStore.getState()
    const providerStore = useProviderStore.getState()

    if (mjStore.isStreaming) return

    mjStore.clearToolActivities()

    const systemPrompt = this.buildSystemPrompt(
      workspaces,
      workspaceSummaries,
      activeSkill?.systemPrompt
    )

    // Persist + add user message BEFORE building history
    const userMsg = makeMessage("user", content)
    useChatStore.getState().appendMessage(MAJORDOMO_WS_ID, userMsg)
    await appendMajordomoMessage(userMsg).catch(console.warn)

    const provider =
      providerStore.providers.find((p) => p.id === mjStore.selectedProviderId) ??
      providerStore.providers[0]

    if (!provider) {
      const noProviderMsg = makeMessage(
        "assistant",
        "No providers configured. Open Settings (⌘,) to add a model."
      )
      useChatStore.getState().appendMessage(MAJORDOMO_WS_ID, noProviderMsg)
      return
    }

    const toolNames = activeSkill?.tools
    const tools = getToolDefinitions(toolNames)

    // Resolve model capabilities once here so runTurn doesn't need to repeat the lookup.
    const modelId =
      (mjStore.selectedModelId || provider.defaultModel) ?? provider.models?.[0]?.id ?? ""
    const modelCapabilities =
      provider.models?.find((m) => m.id === modelId)?.capabilities ?? {}

    await this.runTurn({ systemPrompt, tools, modelCapabilities })
  }

  // ── System prompt ─────────────────────────────────────────────────────────

  buildSystemPrompt(
    workspaces: Workspace[],
    summaries: WorkspaceSummary[],
    customPrompt?: string
  ): string {
    const summaryText = workspaces
      .map((ws) => {
        const sum = summaries.find((s) => s.workspaceId === ws.id)
        return `[${ws.name}] status=${ws.status} summary="${sum?.snippet ?? ws.stateSummary ?? "no activity yet"}"`
      })
      .join("\n")

    const defaultSystem = `You are Majordomo, a global cross-workspace assistant for Mindeck. You have visibility into all workspaces.\n\nCurrent workspace states:\n${summaryText}\n\nBe concise. Reference workspaces by name. Help the user orchestrate their work.\n\nCRITICAL TOOL-USE RULES — VIOLATIONS WILL BE CAUGHT AND REJECTED:\n1. To send work to a workspace, you MUST produce a tool function call for \`dispatch_to_workspace\`. Writing text about dispatching does NOT dispatch — only a real tool call does. The system audits every turn; fake dispatches are automatically detected and rejected.\n2. NEVER write "已派发", "I've dispatched", "task sent", "re-dispatching", "taskId:" or similar UNLESS a tool call was actually produced in this turn. If you describe dispatching without calling the tool, the system will force a retry.\n3. When you want to dispatch, respond ONLY with the tool call — do NOT also write confirmation text. The tool result will confirm success.\n4. If you cannot produce a tool call for any reason, say "I was unable to call the tool" — never pretend you did.\n5. NEVER reproduce system audit lines like "[audit]" or "[Tools actually called:]" in your output.`

    return customPrompt ?? defaultSystem
  }

  // ── Abort ─────────────────────────────────────────────────────────────────

  abort(): void {
    this.abortController.abort()
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _buildHistory(
    systemPrompt: string,
    extraUserContent?: string
  ): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    const freshMessages = useChatStore.getState().messages[MAJORDOMO_WS_ID] ?? []

    const filtered = freshMessages.filter(
      (m) =>
        m.role === "user" ||
        m.role === "assistant" ||
        (m.role === "system" && m.metadata?.isResultCard)
    )

    const mapped = filtered.map((m) => {
      if (m.role === "system" && m.metadata?.isResultCard) {
        const wsId = m.metadata.workspaceId as string | undefined
        const wsLabel =
          useWorkspaceStore.getState().workspaces.find((w) => w.id === wsId)?.name ??
          wsId ??
          "Workspace"
        const summary =
          (m.metadata.fullResult as string | undefined)?.slice(0, 600) ??
          m.content.slice(0, 600)
        return {
          role: "user" as const,
          content: `[System: "${wsLabel}" completed task and reported result]\n${summary}`,
        }
      }
      const content = m.content.replace(/\n?\[Tools actually called:[^\]]*\]/g, "")
      return {
        role: m.role as "user" | "assistant",
        content,
      }
    })

    // Inject tool-use audit between turns so the model cannot mimic it
    const withAudit: Array<{ role: "system" | "user" | "assistant"; content: string }> =
      []
    let msgIdx = 0
    for (const entry of mapped) {
      withAudit.push(entry)
      if (entry.role === "assistant") {
        const orig = filtered[msgIdx]
        if (orig?.role === "assistant" && orig.metadata) {
          const called = orig.metadata.toolsCalled as string[] | undefined
          if (called && called.length > 0) {
            withAudit.push({
              role: "system" as const,
              content: `[audit] The preceding assistant turn executed tool calls: ${called.join(", ")}. This audit line is injected by the system — do NOT reproduce it.`,
            })
          }
        }
      }
      msgIdx++
    }

    return [
      { role: "system" as const, content: systemPrompt },
      ...withAudit,
      ...(extraUserContent ? [{ role: "user" as const, content: extraUserContent }] : []),
    ]
  }

  private _drainPendingDigests(): void {
    const queued = this.pendingDigests.splice(0)
    this.pendingDigests = []
    if (queued.length === 0) return
    queued.reduce<Promise<void>>(
      (chain, ev) =>
        chain.then(() =>
          this.handleDigest(ev).catch((err: unknown) => {
            log.error("queued digest failed", err)
          })
        ),
      Promise.resolve()
    )
  }
}

/** Singleton instance shared across the app */
export const majordomoAgent = new MajordomoAgent()
