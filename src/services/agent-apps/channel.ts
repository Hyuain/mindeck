import type { AppChannel, ChannelMessage } from "@/types"

// ─── Internal Types ──────────────────────────────────────────

type MessageHandler = (msg: ChannelMessage) => void
type RequestHandler = (msg: ChannelMessage) => Promise<ChannelMessage>

interface PendingRequest {
  readonly resolve: (msg: ChannelMessage) => void
  readonly reject: (err: Error) => void
}

/**
 * Internal state for one side of a channel pair.
 * Kept as a plain object so close() can clear references without mutation.
 */
interface ChannelSideState {
  closed: boolean
  messageHandlers: ReadonlyArray<MessageHandler>
  requestHandler: RequestHandler | null
  pendingRequests: ReadonlyMap<string, PendingRequest>
}

// ─── Helpers ─────────────────────────────────────────────────

function stampId(msg: ChannelMessage): ChannelMessage {
  return { ...msg, id: crypto.randomUUID() }
}

function initialState(): ChannelSideState {
  return {
    closed: false,
    messageHandlers: [],
    requestHandler: null,
    pendingRequests: new Map(),
  }
}

// ─── Channel Side Factory ────────────────────────────────────

function createSide(
  ownState: () => ChannelSideState,
  setOwnState: (patch: Partial<ChannelSideState>) => void,
  peerState: () => ChannelSideState,
): AppChannel {
  return {
    send(msg: ChannelMessage): void {
      const own = ownState()
      if (own.closed) return

      const stamped = stampId(msg)
      const peer = peerState()
      if (peer.closed) return

      // Deliver to all peer message handlers
      for (const handler of peer.messageHandlers) {
        handler(stamped)
      }
    },

    onMessage(handler: MessageHandler): void {
      const own = ownState()
      if (own.closed) return
      setOwnState({ messageHandlers: [...own.messageHandlers, handler] })
    },

    request(
      msg: ChannelMessage,
      signal?: AbortSignal,
    ): Promise<ChannelMessage> {
      const own = ownState()
      if (own.closed) {
        return Promise.reject(new Error("Channel is closed"))
      }

      const stamped = stampId(msg)
      const peer = peerState()

      if (peer.closed || !peer.requestHandler) {
        return Promise.reject(
          new Error("No request handler registered on peer"),
        )
      }

      return new Promise<ChannelMessage>((resolve, reject) => {
        const pending: PendingRequest = { resolve, reject }

        // Track pending request (immutable map replacement)
        const nextPending = new Map(own.pendingRequests)
        nextPending.set(stamped.id, pending)
        setOwnState({ pendingRequests: nextPending })

        // Wire up abort signal
        if (signal) {
          if (signal.aborted) {
            removePending(stamped.id)
            reject(new Error("Request aborted"))
            return
          }
          signal.addEventListener(
            "abort",
            () => {
              removePending(stamped.id)
              reject(new Error("Request aborted"))
            },
            { once: true },
          )
        }

        // Invoke peer's request handler
        const handler = peer.requestHandler!
        handler(stamped)
          .then((response) => {
            const current = ownState()
            if (!current.pendingRequests.has(stamped.id)) {
              // Already aborted or closed — drop the response
              return
            }
            removePending(stamped.id)
            resolve({ ...response, replyTo: stamped.id })
          })
          .catch((err: unknown) => {
            const current = ownState()
            if (!current.pendingRequests.has(stamped.id)) return
            removePending(stamped.id)
            reject(
              err instanceof Error ? err : new Error(String(err)),
            )
          })
      })

      function removePending(id: string): void {
        const current = ownState()
        const nextPending = new Map(current.pendingRequests)
        nextPending.delete(id)
        setOwnState({ pendingRequests: nextPending })
      }
    },

    onRequest(handler: RequestHandler): void {
      const own = ownState()
      if (own.closed) return
      setOwnState({ requestHandler: handler })
    },

    close(): void {
      const own = ownState()
      if (own.closed) return

      // Reject all pending requests
      for (const [, pending] of own.pendingRequests) {
        pending.reject(new Error("Channel closed"))
      }

      setOwnState({
        closed: true,
        messageHandlers: [],
        requestHandler: null,
        pendingRequests: new Map(),
      })
    },
  }
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Creates a linked pair of AppChannels for bidirectional communication.
 *
 * Returns `[agentSide, appSide]`. Messages sent on one side are received
 * by the other side's handlers.
 *
 * @param _appId - The app identifier (reserved for future use in `from` stamping)
 */
export function createAppChannel(
  _appId: string,
): [AppChannel, AppChannel] {
  let stateA = initialState()
  let stateB = initialState()

  const getA = (): ChannelSideState => stateA
  const getB = (): ChannelSideState => stateB

  const setA = (patch: Partial<ChannelSideState>): void => {
    stateA = { ...stateA, ...patch }
  }
  const setB = (patch: Partial<ChannelSideState>): void => {
    stateB = { ...stateB, ...patch }
  }

  const agentSide = createSide(getA, setA, getB)
  const appSide = createSide(getB, setB, getA)

  return [agentSide, appSide]
}
