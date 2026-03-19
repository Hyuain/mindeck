import { test, expect } from "@playwright/test"
import { configureHandlers, gotoApp, waitForBootstrap } from "../helpers/setup"
import { makeProvider } from "../helpers/fixtures"

test.describe("Providers", () => {
  test("opens settings via gear icon", async ({ page }) => {
    await gotoApp(page)
    await waitForBootstrap(page)

    // Settings gear is the last button in the titlebar
    await page.locator(".titlebar button").last().click()
    await expect(page.locator(".overlay.open")).toBeVisible()
  })

  test("opens settings via Cmd+,", async ({ page }) => {
    await gotoApp(page)
    await waitForBootstrap(page)

    await page.keyboard.press("Meta+,")
    await expect(page.locator(".overlay.open")).toBeVisible()
  })

  test("shows existing providers", async ({ page }) => {
    const provider = makeProvider({
      name: "My Ollama",
      type: "ollama",
      isConnected: true,
    })

    await configureHandlers(page, {
      list_providers: [provider],
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await page.keyboard.press("Meta+,")
    // Multiple pcards may exist (default Ollama + test provider)
    await expect(page.locator(".pcard").first()).toBeVisible()
    await expect(
      page.locator(".pcard-name").filter({ hasText: "My Ollama" })
    ).toBeVisible()
  })

  test("probe failure shows error state", async ({ page }) => {
    await configureHandlers(page, {
      list_providers: [makeProvider({ name: "Broken", isConnected: false })],
      probe_provider: `() => { throw new Error("Connection refused") }`,
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await page.keyboard.press("Meta+,")
    await expect(page.locator(".pcard").first()).toBeVisible()
  })

  test("delete provider removes card", async ({ page }) => {
    const provider = makeProvider({ name: "ToDelete" })

    await configureHandlers(page, {
      list_providers: [provider],
      delete_provider: null,
      delete_api_key: null,
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    await page.keyboard.press("Meta+,")
    await expect(
      page.locator(".pcard-name").filter({ hasText: "ToDelete" })
    ).toBeVisible()
  })

  test("settings modal closes via X button", async ({ page }) => {
    await gotoApp(page)
    await waitForBootstrap(page)

    await page.keyboard.press("Meta+,")
    await expect(page.locator(".overlay.open")).toBeVisible()

    // Close via the X button
    await page.locator(".x-btn").click()
    await expect(page.locator(".overlay.open")).not.toBeVisible({ timeout: 2000 })
  })
})
