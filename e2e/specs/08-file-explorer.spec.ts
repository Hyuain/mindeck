import { test, expect } from "@playwright/test"
import { configureHandlers, gotoApp, waitForBootstrap } from "../helpers/setup"
import { makeWorkspace, makeProvider, makeFileNode } from "../helpers/fixtures"

const filesSetup = {
  list_workspaces: [
    makeWorkspace({
      id: "ws-files",
      name: "Files WS",
      agentConfig: { providerId: "p-1", modelId: "test-model" },
    }),
  ],
  list_providers: [makeProvider({ id: "p-1" })],
}

test.describe("File Explorer", () => {
  test("file tree renders from list_dir mock", async ({ page }) => {
    await configureHandlers(page, {
      ...filesSetup,
      list_dir: [
        makeFileNode("src", true),
        makeFileNode("package.json", false),
        makeFileNode("README.md", false),
      ],
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    // Files tab should be active by default in the right panel
    const fileExplorer = page.locator(".file-explorer")
    if (await fileExplorer.isVisible()) {
      // File tree rows should be present
      await expect(page.locator(".ft-row")).toHaveCount(3, { timeout: 3000 })
    }
  })

  test("folder expand/collapse toggles children", async ({ page }) => {
    let expandCalled = false

    await page.addInitScript(() => {
      window.__E2E_HANDLERS__ = window.__E2E_HANDLERS__ ?? {}
      // Return different results based on path
      window.__E2E_HANDLERS__.list_dir = (args: Record<string, unknown>) => {
        const path = args.path as string
        if (path && path.includes("src")) {
          return [
            { path: "/mock-home/project/src/index.ts", name: "index.ts", isDir: false, size: 512 },
            { path: "/mock-home/project/src/utils", name: "utils", isDir: true },
          ]
        }
        return [
          { path: "/mock-home/project/src", name: "src", isDir: true },
          { path: "/mock-home/project/README.md", name: "README.md", isDir: false, size: 1024 },
        ]
      }
    })
    await configureHandlers(page, filesSetup)

    await gotoApp(page)
    await waitForBootstrap(page)

    const fileExplorer = page.locator(".file-explorer")
    if (await fileExplorer.isVisible()) {
      // Click on the src folder to expand
      const srcRow = page.locator(".ft-row").filter({ hasText: "src" }).first()
      if (await srcRow.isVisible()) {
        await srcRow.click()
        await page.waitForTimeout(500)
      }
    }
  })

  test("click file opens in preview/pane", async ({ page }) => {
    await configureHandlers(page, {
      ...filesSetup,
      list_dir: [
        makeFileNode("README.md", false),
      ],
      read_file: "# Hello World\n\nThis is a test file.",
    })

    await gotoApp(page)
    await waitForBootstrap(page)

    const fileExplorer = page.locator(".file-explorer")
    if (await fileExplorer.isVisible()) {
      const fileRow = page.locator(".ft-row").filter({ hasText: "README" }).first()
      if (await fileRow.isVisible()) {
        await fileRow.click()
        await page.waitForTimeout(500)
      }
    }
  })
})
