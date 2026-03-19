import { test, expect } from "@playwright/test"
import {
  configureHandlers,
  gotoApp,
  waitForBootstrap,
  seedDarkTheme,
} from "../helpers/setup"
import { makeWorkspace, makeProvider } from "../helpers/fixtures"

const defaultSetup = {
  list_workspaces: [makeWorkspace({ id: "ws-theme", name: "Theme WS" })],
  list_providers: [makeProvider({ id: "p-1" })],
}

test.describe("Themes & Settings", () => {
  test("theme follows system preference (light in headless Chrome)", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    const theme = await page.locator("html").getAttribute("data-theme")
    expect(theme).toBe("light")
  })

  test("toggle theme switches between light and dark", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // Default is light in headless Chrome
    expect(await page.locator("html").getAttribute("data-theme")).toBe("light")

    // Click the theme toggle button (has title="Toggle theme")
    await page.locator('button[title="Toggle theme"]').click()
    expect(await page.locator("html").getAttribute("data-theme")).toBe("dark")

    // Toggle back
    await page.locator('button[title="Toggle theme"]').click()
    expect(await page.locator("html").getAttribute("data-theme")).toBe("light")
  })

  test("seeded dark theme persists", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await seedDarkTheme(page)
    await gotoApp(page)
    await waitForBootstrap(page)

    expect(await page.locator("html").getAttribute("data-theme")).toBe("dark")
  })

  test("settings modal opens and closes", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // Open settings via shortcut
    await page.keyboard.press("Meta+,")
    await expect(page.locator(".overlay.open")).toBeVisible()

    // Close via X button (overlay doesn't handle Escape)
    await page.locator(".x-btn").click()
    await expect(page.locator(".overlay.open")).not.toBeVisible({ timeout: 2000 })
  })

  test("Cmd+K opens command palette", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    await page.keyboard.press("Meta+k")
    await expect(page.locator(".cmd-overlay.open")).toBeVisible({ timeout: 2000 })
  })

  test("command palette closes on Escape", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    await page.keyboard.press("Meta+k")
    await expect(page.locator(".cmd-overlay.open")).toBeVisible({ timeout: 2000 })

    await page.keyboard.press("Escape")
    await expect(page.locator(".cmd-overlay.open")).not.toBeVisible({ timeout: 2000 })
  })

  test("command palette has search input", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    await page.keyboard.press("Meta+k")
    await expect(page.locator(".cmd-overlay.open")).toBeVisible({ timeout: 2000 })

    const searchInput = page.locator(".cmd-input")
    await expect(searchInput).toBeVisible()
    await searchInput.fill("test")
  })

  test("settings navigation tabs work", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    await page.keyboard.press("Meta+,")
    await expect(page.locator(".overlay.open")).toBeVisible()

    // Settings nav items
    const navItems = page.locator(".s-item")
    if ((await navItems.count()) > 1) {
      // Click second nav item
      await navItems.nth(1).click()
      await expect(navItems.nth(1)).toHaveClass(/on/)
    }
  })
})
