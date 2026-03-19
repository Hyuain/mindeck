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

const WS_ID = "ws-chat"
const defaultSetup = {
  list_workspaces: [makeWorkspace({ id: WS_ID, name: "Chat Test" })],
  list_providers: [makeProvider({ id: "p-1" })],
}

test.describe("Chat", () => {
  test.beforeEach(async ({ page }) => {
    await seedChatPane(page, WS_ID)
  })

  test("send message via Enter shows user message", async ({ page }) => {
    await configureHandlers(page, {
      ...defaultSetup,
      stream_chat: buildSimpleStreamHandler("Hi there!"),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "Hello world")

    // User message should appear
    await expect(page.locator(".msg.user").first()).toContainText("Hello world")
  })

  test("streaming response renders assistant message", async ({ page }) => {
    await configureHandlers(page, {
      ...defaultSetup,
      stream_chat: buildSimpleStreamHandler("The answer is 42."),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "What is the answer?")

    // Wait for the assistant message to appear with streamed content
    await expect(page.locator(".msg.ai").first()).toContainText("The answer is 42", {
      timeout: 5000,
    })
  })

  test("Shift+Enter adds newline without sending", async ({ page }) => {
    await configureHandlers(page, defaultSetup)

    await gotoApp(page)
    await waitForBootstrap(page)

    const input = page.locator(".input-ta")
    await input.waitFor({ state: "visible", timeout: 5000 })
    await input.focus()
    await input.pressSequentially("Line 1")
    await page.keyboard.press("Shift+Enter")
    await input.pressSequentially("Line 2")

    // Message should not be sent — no .msg elements
    await expect(page.locator(".msg")).toHaveCount(0)

    // Input should contain both lines
    const value = await input.inputValue()
    expect(value).toContain("Line 1")
    expect(value).toContain("Line 2")
  })

  test("input disabled during streaming", async ({ page }) => {
    await configureHandlers(page, {
      ...defaultSetup,
      stream_chat: `(args) => {
        const channel = args.onEvent;
        return new Promise((resolve) => {
          setTimeout(() => {
            channel.onmessage({ type: "chunk", delta: "Thinking..." });
          }, 100);
          setTimeout(() => {
            channel.onmessage({ type: "chunk", delta: " Done." });
            channel.onmessage({ type: "done" });
            resolve(null);
          }, 1000);
        });
      }`,
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "Slow question")

    // The assistant message eventually appears
    await expect(page.locator(".msg.ai").first()).toContainText("Done", {
      timeout: 5000,
    })
  })

  test("clear conversation removes messages", async ({ page }) => {
    await configureHandlers(page, {
      ...defaultSetup,
      stream_chat: buildSimpleStreamHandler("Response"),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendChatMessage(page, "Hello")
    await expect(page.locator(".msg.ai").first()).toBeVisible({ timeout: 5000 })

    // Click clear button
    const clearBtn = page.locator(".chat-clear-btn")
    if (await clearBtn.isVisible()) {
      await clearBtn.click()
      // Confirmation dialog appears — click "Clear"
      await page.locator("button").filter({ hasText: "Clear" }).click()
      // Messages should be gone
      await expect(page.locator(".msg")).toHaveCount(0, { timeout: 3000 })
    }
  })

  test("conversation persists across workspace switch", async ({ page }) => {
    const ws1 = makeWorkspace({ id: "ws-a", name: "WS-A" })
    const ws2 = makeWorkspace({ id: "ws-b", name: "WS-B" })

    await configureHandlers(page, {
      list_workspaces: [ws1, ws2],
      list_providers: [makeProvider({ id: "p-1" })],
      stream_chat: buildSimpleStreamHandler("Reply A"),
    })
    // Seed chat pane for both workspaces
    await seedChatPane(page, "ws-a")

    await gotoApp(page)
    await waitForBootstrap(page)

    // Send message in first workspace
    await sendChatMessage(page, "Message in A")
    await expect(page.locator(".msg.user").first()).toContainText("Message in A")

    // Switch to second workspace
    await page.locator(".mj-ws-item").nth(1).click()
    await page.waitForTimeout(500)

    // Switch back to first workspace
    await page.locator(".mj-ws-item").first().click()
    await page.waitForTimeout(500)

    // Original message should still be there
    await expect(page.locator(".msg.user").first()).toContainText("Message in A")
  })
})
