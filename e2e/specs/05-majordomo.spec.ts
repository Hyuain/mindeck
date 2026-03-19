import { test, expect } from "@playwright/test"
import {
  configureHandlers,
  gotoApp,
  waitForBootstrap,
  sendMajordomoMessage,
} from "../helpers/setup"
import { buildSimpleStreamHandler } from "../helpers/streaming"
import { makeWorkspace, makeProvider } from "../helpers/fixtures"

const defaultSetup = {
  list_workspaces: [makeWorkspace({ id: "ws-1", name: "Target WS" })],
  list_providers: [makeProvider({ id: "p-1" })],
}

test.describe("Majordomo", () => {
  test("Majordomo panel renders with header and input", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    await expect(page.locator(".mj-panel")).toBeVisible()
    await expect(page.locator(".mj-ta")).toBeVisible()
    await expect(page.locator(".mj-send")).toBeVisible()
  })

  test("send message to Majordomo", async ({ page }) => {
    await configureHandlers(page, {
      ...defaultSetup,
      stream_chat: buildSimpleStreamHandler("I can help with that!"),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendMajordomoMessage(page, "Hello Majordomo")

    // User message should appear in Majordomo messages
    await expect(page.locator(".mj-msg.user").first()).toContainText("Hello Majordomo")
  })

  test("workspace list shows all workspaces with status", async ({ page }) => {
    const ws1 = makeWorkspace({ id: "ws-1", name: "Alpha", status: "active" })
    const ws2 = makeWorkspace({ id: "ws-2", name: "Beta", status: "idle" })
    const ws3 = makeWorkspace({ id: "ws-3", name: "Gamma", status: "pending" })

    await configureHandlers(page, {
      list_workspaces: [ws1, ws2, ws3],
      list_providers: [makeProvider({ id: "p-1" })],
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    const items = page.locator(".mj-ws-item")
    await expect(items).toHaveCount(3)

    // Status dots should be present
    await expect(page.locator(".mj-ws-dot")).toHaveCount(3)
  })

  test("assistant response appears in Majordomo", async ({ page }) => {
    await configureHandlers(page, {
      ...defaultSetup,
      stream_chat: buildSimpleStreamHandler("Task dispatched to workspace."),
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await sendMajordomoMessage(page, "Run analysis on workspace")

    // Assistant message should appear
    await expect(page.locator(".mj-msg.ai").first()).toContainText("Task dispatched", {
      timeout: 5000,
    })
  })

  test("workspace names visible in sidebar", async ({ page }) => {
    await configureHandlers(page, {
      list_workspaces: [
        makeWorkspace({ name: "My Research" }),
        makeWorkspace({ name: "Coding Project" }),
      ],
      list_providers: [makeProvider({ id: "p-1" })],
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await expect(page.locator(".mj-ws-name").filter({ hasText: "My Research" })).toBeVisible()
    await expect(page.locator(".mj-ws-name").filter({ hasText: "Coding Project" })).toBeVisible()
  })
})
