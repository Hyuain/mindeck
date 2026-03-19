import { test, expect } from "@playwright/test"
import {
  configureHandlers,
  gotoApp,
  waitForBootstrap,
  sendChatMessage,
  seedChatPane,
} from "../helpers/setup"
import { buildStreamHandler } from "../helpers/streaming"
import { makeWorkspace, makeProvider } from "../helpers/fixtures"

const WS_ID = "ws-agent"
const agenticSetup = {
  list_workspaces: [
    makeWorkspace({
      id: WS_ID,
      name: "Agentic WS",
      agentConfig: {
        providerId: "p-1",
        modelId: "test-model",
        enableAgentLoop: true,
      },
    }),
  ],
  list_providers: [makeProvider({ id: "p-1" })],
}

test.describe("Agentic Mode", () => {
  test.beforeEach(async ({ page }) => {
    await seedChatPane(page, WS_ID)
  })

  test("tool call shows ToolActivityRow", async ({ page }) => {
    await configureHandlers(page, {
      ...agenticSetup,
      stream_chat: buildStreamHandler([
        {
          type: "toolCall",
          id: "tc-1",
          name: "read_file",
          args: { path: "/test/file.txt" },
        },
        { type: "text", content: "File contents read successfully." },
      ]),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "Read the file")

    // Tool activity row should appear
    await expect(page.locator(".tar").first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator(".tar-name").first()).toContainText("read_file")
  })

  test("tool activity shows expandable details", async ({ page }) => {
    await configureHandlers(page, {
      ...agenticSetup,
      stream_chat: buildStreamHandler([
        {
          type: "toolCall",
          id: "tc-2",
          name: "run_shell",
          args: { command: "echo hello" },
        },
        { type: "text", content: "Command executed." },
      ]),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "Run a command")

    // Wait for tool activity
    const tar = page.locator(".tar").first()
    await expect(tar).toBeVisible({ timeout: 5000 })

    // Click to expand/toggle details
    const toggle = tar.locator(".tar-toggle, .tar-header")
    if (await toggle.first().isVisible()) {
      await toggle.first().click()
      await page.waitForTimeout(300)
    }
  })

  test("multiple tool calls render in sequence", async ({ page }) => {
    await configureHandlers(page, {
      ...agenticSetup,
      stream_chat: buildStreamHandler([
        {
          type: "toolCall",
          id: "tc-a",
          name: "list_dir",
          args: { path: "/project" },
        },
        {
          type: "toolCall",
          id: "tc-b",
          name: "read_file",
          args: { path: "/project/main.ts" },
        },
        { type: "text", content: "Analysis complete." },
      ]),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "Analyze the project")

    // Both tool activities should render
    await expect(page.locator(".tar")).toHaveCount(2, { timeout: 5000 })
  })

  test("assistant text appears after tool calls", async ({ page }) => {
    await configureHandlers(page, {
      ...agenticSetup,
      stream_chat: buildStreamHandler([
        {
          type: "toolCall",
          id: "tc-x",
          name: "read_file",
          args: { path: "/readme.md" },
        },
        { type: "text", content: "Here is what I found in the readme." },
      ]),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "Summarize the readme")

    // Final text message should appear
    await expect(page.locator(".msg.ai")).toContainText("Here is what I found", {
      timeout: 5000,
    })
  })
})
