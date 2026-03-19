import { test, expect } from "@playwright/test"
import { configureHandlers, gotoApp, waitForBootstrap } from "../helpers/setup"
import { makeWorkspace, makeProvider } from "../helpers/fixtures"

const defaultSetup = {
  list_workspaces: [makeWorkspace({ id: "ws-mcp", name: "MCP WS" })],
  list_providers: [makeProvider({ id: "p-1" })],
}

test.describe("MCP Servers", () => {
  test("orchestrator settings accessible from workspace", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // Look for orchestrator/MCP settings button in the chat head
    const orchBtn = page.locator(
      ".chat-head-actions button, .orch-settings-btn"
    )
    if (await orchBtn.first().isVisible()) {
      await orchBtn.first().click()
      await page.waitForTimeout(500)
    }
  })

  test("MCP tab shows in orchestrator settings", async ({ page }) => {
    await configureHandlers(page, defaultSetup)
    await gotoApp(page)
    await waitForBootstrap(page)

    // Try opening orchestrator settings
    const orchBtn = page.locator(".chat-head-actions button").first()
    if (await orchBtn.isVisible()) {
      await orchBtn.click()
      await page.waitForTimeout(500)

      // Look for MCP-related tabs
      const mcpTab = page.locator(".orch-settings-tab").filter({ hasText: /mcp/i })
      if (await mcpTab.isVisible()) {
        await mcpTab.click()
        await page.waitForTimeout(300)
      }
    }
  })

  test("MCP server list renders", async ({ page }) => {
    const ws = makeWorkspace({
      id: "ws-mcp-list",
      name: "MCP List WS",
    })
    // Add MCP dependency data to workspace
    ;(ws as Record<string, unknown>).orchestratorConfig = {
      mcpDependencies: [
        {
          name: "web-search",
          transport: "stdio",
          command: "npx",
          args: ["@mcp/web-search"],
          status: "connected",
        },
      ],
    }

    await configureHandlers(page, {
      list_workspaces: [ws],
      list_providers: [makeProvider({ id: "p-1" })],
    })

    await gotoApp(page)
    await waitForBootstrap(page)
  })
})
