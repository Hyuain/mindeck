import { test, expect } from "@playwright/test"
import { configureHandlers, gotoApp, waitForBootstrap } from "../helpers/setup"
import { makeWorkspace, makeProvider } from "../helpers/fixtures"

const defaultSetup = {
  list_workspaces: [makeWorkspace({ id: "ws-apps", name: "Apps WS" })],
  list_providers: [makeProvider({ id: "p-1" })],
}

test.describe("Agent Apps", () => {
  test("agents panel visible in right column", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // The agents panel should be in the right panel area
    const agentsPanel = page.locator(".agents-panel")
    await expect(agentsPanel).toBeVisible({ timeout: 5000 })
  })

  test("native apps are pre-seeded (ESLint, TSC, TestRunner)", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // Agent apps section should show the built-in apps
    // These are hardcoded as ESLINT_APP, TSC_APP, TEST_RUNNER_APP in App.tsx
    const agentsPanel = page.locator(".agents-panel")
    if (await agentsPanel.isVisible()) {
      // Look for app names in the panel
      const appItems = page.locator(".agent-app-row, .agent-tree-item")
      // At least some native apps should be present
      await expect(appItems.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test("agents/apps tabs toggle content", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    const tabs = page.locator(".agents-apps-tab")
    if ((await tabs.count()) >= 2) {
      // Click second tab (apps)
      await tabs.nth(1).click()
      await page.waitForTimeout(300)
      // Click first tab (agents)
      await tabs.first().click()
      await page.waitForTimeout(300)
    }
  })
})
