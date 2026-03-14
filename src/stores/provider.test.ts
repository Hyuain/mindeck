import { describe, it, expect, beforeEach } from "vitest"
import { useProviderStore } from "./provider"
import { makeTestProvider } from "@/test/factories"

describe("useProviderStore", () => {
  beforeEach(() => {
    useProviderStore.setState({ providers: [] })
  })

  describe("setProviders", () => {
    it("sets the provider list", () => {
      const providers = [makeTestProvider({ id: "p1" })]
      useProviderStore.getState().setProviders(providers)
      expect(useProviderStore.getState().providers).toHaveLength(1)
    })
  })

  describe("addProvider", () => {
    it("adds a provider to the list", () => {
      useProviderStore.getState().addProvider(makeTestProvider({ id: "p1" }))
      expect(useProviderStore.getState().providers).toHaveLength(1)
    })

    it("does not mutate existing array", () => {
      useProviderStore.getState().addProvider(makeTestProvider({ id: "p1" }))
      const before = useProviderStore.getState().providers
      useProviderStore.getState().addProvider(makeTestProvider({ id: "p2" }))
      expect(before).toHaveLength(1)
    })
  })

  describe("updateProvider", () => {
    it("updates a provider by id", () => {
      useProviderStore.getState().addProvider(makeTestProvider({ id: "p1", name: "Old" }))
      useProviderStore.getState().updateProvider("p1", { name: "New" })
      expect(useProviderStore.getState().providers[0].name).toBe("New")
    })

    it("does not affect other providers", () => {
      useProviderStore.getState().setProviders([
        makeTestProvider({ id: "p1", name: "A" }),
        makeTestProvider({ id: "p2", name: "B" }),
      ])
      useProviderStore.getState().updateProvider("p1", { name: "Updated" })
      expect(useProviderStore.getState().providers[1].name).toBe("B")
    })
  })

  describe("removeProvider", () => {
    it("removes a provider by id", () => {
      useProviderStore.getState().setProviders([
        makeTestProvider({ id: "p1" }),
        makeTestProvider({ id: "p2" }),
      ])
      useProviderStore.getState().removeProvider("p1")
      expect(useProviderStore.getState().providers).toHaveLength(1)
      expect(useProviderStore.getState().providers[0].id).toBe("p2")
    })
  })

  describe("setConnected", () => {
    it("updates connection status for a provider", () => {
      useProviderStore.getState().addProvider(makeTestProvider({ id: "p1", isConnected: false }))
      useProviderStore.getState().setConnected("p1", true)
      expect(useProviderStore.getState().providers[0].isConnected).toBe(true)
    })
  })
})
