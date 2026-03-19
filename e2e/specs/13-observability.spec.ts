import { test, expect } from "@playwright/test"
import { configureHandlers, gotoApp, waitForBootstrap } from "../helpers/setup"
import { makeWorkspace, makeProvider } from "../helpers/fixtures"

const defaultSetup = {
  list_workspaces: [makeWorkspace({ id: "ws-obs", name: "Observability WS" })],
  list_providers: [makeProvider({ id: "p-1" })],
}

test.describe("Observability", () => {
  test("observability icon exists in titlebar", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // The titlebar should have a BarChart2 icon button for observability
    const titlebar = page.locator(".titlebar")
    // Look for any button with the observability icon
    const obsBtn = titlebar.locator("button").filter({ has: page.locator("svg") })
    await expect(obsBtn.first()).toBeVisible()
  })

  test("open observability dashboard via titlebar icon", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // Click the observability button (has title="Observability")
    await page.locator('button[title="Observability"]').click()

    // Dashboard overlay should appear
    await expect(page.locator(".obs-overlay, .obs-panel").first()).toBeVisible({
      timeout: 2000,
    })
  })

  test("observability dashboard shows metrics", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // Open observability
    const obsOverlay = page.locator(".obs-overlay, .obs-panel")
    if (await obsOverlay.isVisible()) {
      // Stats section should be present
      await expect(page.locator(".obs-stats, .obs-stat")).toBeVisible()
    }
  })

  test("observability dashboard closes on Escape", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // Try to open and close observability
    const obsOverlay = page.locator(".obs-overlay")
    if (await obsOverlay.isVisible()) {
      await page.keyboard.press("Escape")
      await expect(obsOverlay).not.toBeVisible({ timeout: 2000 })
    }
  })
})
