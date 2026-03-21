/**
 * PaneClient bridge — connects the service layer to AppPaneChat React component
 * via window CustomEvents and the Zustand layout store.
 *
 * Events:
 *   app-pane-chunk:{appId}     → stream text chunk to pane
 *   app-pane-msg:{appId}       → send complete message to pane
 *   app-pane-done:{appId}      → signal end of streaming turn
 *   app-pane-user-msg:{appId}  ← user typed a message in the pane
 */
import { useLayoutStore } from "@/stores/layout"
import type { PaneClient } from "@/types"

export function createPaneClient(
  appId: string,
  workspaceId: string
): PaneClient {
  let isOpenState = false
  const closeHandlers: Array<() => void> = []
  const userMessageHandlers: Array<(text: string) => void> = []

  function handleUserMessage(e: Event) {
    const text = (e as CustomEvent).detail as string
    for (const handler of userMessageHandlers) handler(text)
  }

  return {
    open(options) {
      if (isOpenState) return
      isOpenState = true

      useLayoutStore.getState().addPane(workspaceId, {
        id: `app-pane-${appId}`,
        type: "agent-app",
        title: options?.title ?? appId,
        appId,
      })

      window.addEventListener(`app-pane-user-msg:${appId}`, handleUserMessage)
    },

    close() {
      if (!isOpenState) return
      isOpenState = false

      window.removeEventListener(`app-pane-user-msg:${appId}`, handleUserMessage)
      useLayoutStore.getState().removePane(workspaceId, `app-pane-${appId}`)

      for (const handler of closeHandlers) handler()
    },

    sendChunk(text: string) {
      window.dispatchEvent(
        new CustomEvent(`app-pane-chunk:${appId}`, { detail: text })
      )
    },

    sendMessage(message) {
      window.dispatchEvent(
        new CustomEvent(`app-pane-msg:${appId}`, { detail: message })
      )
    },

    onUserMessage(handler) {
      userMessageHandlers.push(handler)
    },

    onClose(handler) {
      closeHandlers.push(handler)
    },

    isOpen() {
      return isOpenState
    },
  }
}
