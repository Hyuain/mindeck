import { test, expect } from "@playwright/test"
import { gotoApp, waitForBootstrap, seedDarkTheme } from "../helpers/setup"

test.describe("First Launch", () => {
  test("renders three-column layout", async ({ page }) => {
    await gotoApp(page)
    await waitForBootstrap(page)

    // Majordomo panel (left)
    await expect(page.locator(".mj-panel")).toBeVisible()
    // Center workspace area
    await expect(page.locator(".flexible-workspace")).toBeVisible()
    // Right panel
    await expect(page.locator(".right-panel")).toBeVisible()
  })

  test("titlebar elements are present", async ({ page }) => {
    await gotoApp(page)
    await waitForBootstrap(page)

    const titlebar = page.locator(".titlebar")
    await expect(titlebar).toBeVisible()
    // Search button, layout toggle, theme toggle, observability, settings
    await expect(titlebar.locator("button").first()).toBeVisible()
  })

  test("creates default workspace when none exist", async ({ page }) => {
    // Default handlers return [] for list_workspaces, so app creates one
    await gotoApp(page)
    await waitForBootstrap(page)

    // The workspace list in Majordomo should have at least one item
    await expect(page.locator(".mj-ws-item").first()).toBeVisible({ timeout: 5000 })
  })

  test("no console errors on clean boot", async ({ page }) => {
    const errors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text())
      }
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    // Filter out expected E2E warnings and browser noise
    const realErrors = errors.filter(
      (e) =>
        !e.includes("[E2E]") &&
        !e.includes("favicon") &&
        !e.includes("Failed to load resource")
    )
    expect(realErrors).toEqual([])
  })

  test("theme follows prefers-color-scheme (light in headless Chrome)", async ({ page }) => {
    await gotoApp(page)
    await waitForBootstrap(page)

    // Headless Chrome defaults to light color scheme
    const theme = await page.locator("html").getAttribute("data-theme")
    expect(theme).toBe("light")
  })

  test("seedDarkTheme forces dark mode", async ({ page }) => {
    await seedDarkTheme(page)
    await gotoApp(page)
    await waitForBootstrap(page)

    const theme = await page.locator("html").getAttribute("data-theme")
    expect(theme).toBe("dark")
  })

  test("Majordomo panel has input and send button", async ({ page }) => {
    await gotoApp(page)
    await waitForBootstrap(page)

    await expect(page.locator(".mj-ta")).toBeVisible()
    await expect(page.locator(".mj-send")).toBeVisible()
  })

  test("right panel has Files/Skills/Git tabs", async ({ page }) => {
    await gotoApp(page)
    await waitForBootstrap(page)

    const tabs = page.locator(".right-panel-tab")
    await expect(tabs).toHaveCount(3)
    await expect(tabs.nth(0)).toContainText("Files")
    await expect(tabs.nth(1)).toContainText("Skills")
    await expect(tabs.nth(2)).toContainText("Git")
  })
})
