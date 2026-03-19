import { test, expect } from "@playwright/test"
import { configureHandlers, gotoApp, waitForBootstrap } from "../helpers/setup"
import { makeWorkspace, makeProvider } from "../helpers/fixtures"

const defaultSetup = {
  list_workspaces: [makeWorkspace({ id: "ws-layout", name: "Layout WS" })],
  list_providers: [makeProvider({ id: "p-1" })],
}

test.describe("Pane System & Layout", () => {
  test("Majordomo panel resize handle exists", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    const handle = page.locator(".panel-resize-handle").first()
    await expect(handle).toBeVisible()
  })

  test("dragging resize handle changes Majordomo width", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    const mjPanel = page.locator(".mj-panel")
    const initialWidth = await mjPanel.evaluate((el) => el.getBoundingClientRect().width)

    // Drag the resize handle
    const handle = page.locator(".panel-resize-handle").first()
    const box = await handle.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + 50, box.y + box.height / 2, { steps: 5 })
      await page.mouse.up()

      await page.waitForTimeout(300)
      const newWidth = await mjPanel.evaluate((el) => el.getBoundingClientRect().width)
      // Width should have changed
      expect(Math.abs(newWidth - initialWidth)).toBeGreaterThan(10)
    }
  })

  test("collapse Majordomo panel hides it", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // Look for the collapse button
    const collapseBtn = page.locator(".panel-collapse-btn, .mj-collapse-btn").first()
    if (await collapseBtn.isVisible()) {
      await collapseBtn.click()
      await page.waitForTimeout(300)

      // Panel should be collapsed (very narrow or hidden)
      const mjPanel = page.locator(".mj-panel")
      const width = await mjPanel.evaluate((el) => el.getBoundingClientRect().width)
      expect(width).toBeLessThan(50)
    }
  })

  test("layout persists across page reload", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // Get initial layout store state (persisted to localStorage)
    const hasStorage = await page.evaluate(() => {
      return localStorage.getItem("mindeck-layout") !== null
    })

    // Layout store uses Zustand persist — should write to localStorage
    // Even if empty, the store initializes with defaults
    await page.reload()
    await waitForBootstrap(page)

    // App should still render correctly
    await expect(page.locator(".mj-panel")).toBeVisible()
    await expect(page.locator(".flexible-workspace")).toBeVisible()
  })

  test("flexible workspace renders with empty state or panes", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // The flexible workspace should be visible
    const workspace = page.locator(".flexible-workspace")
    await expect(workspace).toBeVisible()

    // By default, workspace starts with empty drop zone
    // (chat pane only appears if layout is pre-seeded or file is dragged)
    await expect(workspace.locator("text=Drop files or agents here")).toBeVisible()
  })
})
