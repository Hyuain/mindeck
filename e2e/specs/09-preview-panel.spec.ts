import { test, expect } from "@playwright/test"
import {
  configureHandlers,
  gotoApp,
  waitForBootstrap,
  sendChatMessage,
  seedChatPane,
} from "../helpers/setup"
import { buildSimpleStreamHandler } from "../helpers/streaming"
import { makeWorkspace, makeProvider } from "../helpers/fixtures"

const WS_ID = "ws-preview"
const defaultSetup = {
  list_workspaces: [makeWorkspace({ id: WS_ID, name: "Preview WS" })],
  list_providers: [makeProvider({ id: "p-1" })],
}

test.describe("Preview Panel", () => {
  test.beforeEach(async ({ page }) => {
    await seedChatPane(page, WS_ID)
  })

  test("markdown renders headers and paragraphs", async ({ page }) => {
    const mdContent = "# Main Title\n\nA paragraph of text.\n\n## Subtitle\n\nMore text here."

    await configureHandlers(page, {
      ...defaultSetup,
      stream_chat: buildSimpleStreamHandler(mdContent),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "Generate markdown")

    // The message body should render markdown
    const msgBody = page.locator(".msg.ai .msg-markdown, .msg.ai .msg-body").first()
    await expect(msgBody).toBeVisible({ timeout: 5000 })
  })

  test("code blocks render with syntax highlighting", async ({ page }) => {
    const codeContent =
      "Here is code:\n\n```typescript\nconst x: number = 42;\nconsole.log(x);\n```"

    await configureHandlers(page, {
      ...defaultSetup,
      stream_chat: buildSimpleStreamHandler(codeContent),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "Show me code")

    // Wait for assistant message with code
    const msg = page.locator(".msg.ai").first()
    await expect(msg).toBeVisible({ timeout: 5000 })

    // Code blocks should be rendered
    const codeBlock = msg.locator("pre code, .code-block")
    await expect(codeBlock.first()).toBeVisible({ timeout: 3000 })
  })

  test("GFM tables render", async ({ page }) => {
    const tableContent =
      "| Name | Value |\n| --- | --- |\n| Alpha | 1 |\n| Beta | 2 |"

    await configureHandlers(page, {
      ...defaultSetup,
      stream_chat: buildSimpleStreamHandler(tableContent),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "Show a table")

    const msg = page.locator(".msg.ai").first()
    await expect(msg).toBeVisible({ timeout: 5000 })

    // Table element should be rendered
    const table = msg.locator("table")
    await expect(table.first()).toBeVisible({ timeout: 3000 })
  })

  test("lists render correctly", async ({ page }) => {
    const listContent =
      "Items:\n\n- First item\n- Second item\n- Third item\n\n1. Numbered one\n2. Numbered two"

    await configureHandlers(page, {
      ...defaultSetup,
      stream_chat: buildSimpleStreamHandler(listContent),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "Show a list")

    const msg = page.locator(".msg.ai").first()
    await expect(msg).toBeVisible({ timeout: 5000 })

    // Both ul and ol should render
    await expect(msg.locator("ul").first()).toBeVisible({ timeout: 3000 })
    await expect(msg.locator("ol").first()).toBeVisible({ timeout: 3000 })
  })
})
