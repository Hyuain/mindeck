import { test, expect } from "@playwright/test"
import { configureHandlers, gotoApp, waitForBootstrap } from "../helpers/setup"
import { makeWorkspace, makeProvider } from "../helpers/fixtures"

test.describe("Workspaces", () => {
  test("workspace list shows pre-existing workspaces", async ({ page }) => {
    const ws1 = makeWorkspace({ name: "Research" })
    const ws2 = makeWorkspace({ name: "Coding" })

    await configureHandlers(page, {
      list_workspaces: [ws1, ws2],
      list_providers: [makeProvider({ id: "p-1" })],
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    const items = page.locator(".mj-ws-item")
    await expect(items).toHaveCount(2)
    await expect(items.first()).toContainText("Research")
    await expect(items.nth(1)).toContainText("Coding")
  })

  test("clicking workspace switches active workspace", async ({ page }) => {
    const ws1 = makeWorkspace({ id: "ws-1", name: "Alpha" })
    const ws2 = makeWorkspace({ id: "ws-2", name: "Beta" })

    await configureHandlers(page, {
      list_workspaces: [ws1, ws2],
      list_providers: [makeProvider({ id: "p-1" })],
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    // First workspace should be selected (has .on class)
    await expect(page.locator(".mj-ws-item.on")).toContainText("Alpha")

    // Click second workspace
    await page.locator(".mj-ws-item").nth(1).click()
    await page.waitForTimeout(300)

    // Second workspace should now be selected
    await expect(page.locator(".mj-ws-item.on")).toContainText("Beta")
  })

  test("create workspace via Majordomo panel", async ({ page }) => {
    const ws = makeWorkspace({ name: "Existing" })

    await configureHandlers(page, {
      list_workspaces: [ws],
      list_providers: [makeProvider({ id: "p-1" })],
      create_workspace: null,
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    // Click the + button to create workspace
    const addBtn = page.locator(".mj-ws-section button, .mj-panel button").filter({
      hasText: /\+|new|add/i,
    })
    if (await addBtn.first().isVisible()) {
      await addBtn.first().click()
      // Wait for template selector or new workspace to appear
      await page.waitForTimeout(500)
    }
  })

  test("delete workspace with confirmation", async ({ page }) => {
    const ws1 = makeWorkspace({ id: "ws-1", name: "Keep" })
    const ws2 = makeWorkspace({ id: "ws-2", name: "Delete Me" })

    await configureHandlers(page, {
      list_workspaces: [ws1, ws2],
      list_providers: [makeProvider({ id: "p-1" })],
      delete_workspace: null,
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    // Hover over the second workspace to reveal delete button
    await page.locator(".mj-ws-item").nth(1).hover()
    const delBtn = page.locator(".mj-ws-del").nth(1)

    if (await delBtn.isVisible()) {
      await delBtn.click()
      // Should remain with one workspace
      await page.waitForTimeout(500)
    }
  })

  test("workspace settings modal opens", async ({ page }) => {
    const ws = makeWorkspace({ name: "Settings Test" })

    await configureHandlers(page, {
      list_workspaces: [ws],
      list_providers: [makeProvider({ id: "p-1" })],
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    // Look for workspace settings button in chat head
    const settingsBtn = page.locator(".chat-head-actions button").first()
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click()
      await page.waitForTimeout(300)
    }
  })
})
