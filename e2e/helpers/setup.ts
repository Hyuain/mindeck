// ─── E2E Test Setup Helpers ──────────────────────────────────
import type { Page } from "@playwright/test"

/**
 * Configure invoke handlers for a test page. Must be called BEFORE page.goto().
 * Handlers are merged on top of the default handlers in tauri-core.ts.
 *
 * @param page - Playwright page instance
 * @param handlers - Object mapping command names to handler function bodies (as strings)
 *                   OR inline JS objects for simple return values.
 *
 * Example:
 * ```ts
 * await configureHandlers(page, {
 *   list_workspaces: [makeWorkspace({ name: "WS1" })],
 *   stream_chat: buildSimpleStreamHandler("Hello!"),
 * })
 * ```
 */
export async function configureHandlers(
  page: Page,
  handlers: Record<string, unknown>
): Promise<void> {
  // Separate function-string handlers from data handlers
  const fnHandlers: Record<string, string> = {}
  const dataHandlers: Record<string, unknown> = {}

  for (const [cmd, value] of Object.entries(handlers)) {
    if (typeof value === "string" && value.trimStart().startsWith("(")) {
      // It's a function body string (from buildStreamHandler etc.)
      fnHandlers[cmd] = value
    } else {
      // It's a static data value — wrap in a function that returns it
      dataHandlers[cmd] = value
    }
  }

  await page.addInitScript(
    ({ data, fns }) => {
      window.__E2E_HANDLERS__ = window.__E2E_HANDLERS__ ?? {}
      // Data handlers: return the static value
      for (const [cmd, value] of Object.entries(data)) {
        window.__E2E_HANDLERS__[cmd] = () => value
      }
      // Function handlers: eval the function body
      for (const [cmd, body] of Object.entries(fns)) {
        // eslint-disable-next-line no-eval
        window.__E2E_HANDLERS__[cmd] = eval(body)
      }
    },
    { data: dataHandlers, fns: fnHandlers }
  )
}

/**
 * Pre-seed the layout store in localStorage so the FlexibleWorkspace
 * renders a chat pane for the given workspace. Must be called BEFORE page.goto().
 */
export async function seedChatPane(page: Page, workspaceId: string): Promise<void> {
  const paneId = `chat-${workspaceId}`
  const layoutData = {
    state: {
      majordomoWidth: 320,
      rightPanelWidth: 280,
      showLeft: true,
      showCenter: true,
      showRight: true,
      workspaceLayouts: {
        [workspaceId]: {
          panes: [
            {
              id: paneId,
              type: "agent",
              title: "Chat",
              workspaceId,
            },
          ],
          layout: { type: "pane", paneId },
        },
      },
    },
    version: 0,
  }

  await page.addInitScript((data) => {
    localStorage.setItem("mindeck-layout", JSON.stringify(data))
  }, layoutData)
}

/**
 * Force dark theme via prefers-color-scheme media emulation.
 * The UI store reads `window.matchMedia("(prefers-color-scheme: dark)")` on init.
 * Must be called BEFORE page.goto().
 */
export async function seedDarkTheme(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: "dark" })
}

/**
 * Navigate to the app root and wait for the layout to render.
 */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto("/")
  // Wait for the main layout to be visible
  await page.waitForSelector(".body", { timeout: 10000 })
}

/**
 * Wait for the app to finish bootstrapping (workspaces loaded or created).
 */
export async function waitForBootstrap(page: Page): Promise<void> {
  // The app creates a default workspace if none exist, which adds a .mj-ws-item
  // or loads existing ones. Wait for the majordomo panel to be interactive.
  await page.waitForSelector(".mj-panel", { timeout: 10000 })
}

/**
 * Type into the chat input and send a message.
 * Requires a chat pane to be visible (use seedChatPane first).
 */
export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const input = page.locator(".input-ta")
  await input.waitFor({ state: "visible", timeout: 5000 })
  await input.fill(text)
  await page.locator(".send-btn").click()
}

/**
 * Type into the Majordomo input and send.
 */
export async function sendMajordomoMessage(page: Page, text: string): Promise<void> {
  const input = page.locator(".mj-ta")
  await input.fill(text)
  await page.locator(".mj-send").click()
}
