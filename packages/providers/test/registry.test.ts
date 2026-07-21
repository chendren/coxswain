import { configSchema, pricingFor, type ChatModel, type ProviderAdapter } from "@cox/core";
import { describe, expect, it } from "vitest";
import { createProviderRegistry } from "../src/registry.js";

describe("createProviderRegistry", () => {
  it("resolves anthropic models from the default config with zero env vars and no network", () => {
    const registry = createProviderRegistry(configSchema.parse({}));
    const model = registry.getModel({ provider: "anthropic", model: "claude-sonnet-5" });
    expect(model.ref).toEqual({ provider: "anthropic", model: "claude-sonnet-5" });
  });

  it("R5.1: getModel returns the same cached instance for the same ref", () => {
    const registry = createProviderRegistry(configSchema.parse({}));
    const ref = { provider: "anthropic", model: "claude-sonnet-5" };
    const first = registry.getModel(ref);
    const second = registry.getModel(ref);
    expect(first).toBe(second);
  });

  it("R5.1: different model keys get different (independently cached) instances", () => {
    const registry = createProviderRegistry(configSchema.parse({}));
    const sonnet = registry.getModel({ provider: "anthropic", model: "claude-sonnet-5" });
    const haiku = registry.getModel({ provider: "anthropic", model: "claude-haiku-4-5" });
    expect(sonnet).not.toBe(haiku);
    // and re-fetching each still returns its own cached instance
    expect(registry.getModel({ provider: "anthropic", model: "claude-sonnet-5" })).toBe(sonnet);
    expect(registry.getModel({ provider: "anthropic", model: "claude-haiku-4-5" })).toBe(haiku);
  });

  it("R5.2: an unknown provider throws, naming the ref and listing configured provider ids", () => {
    const registry = createProviderRegistry(configSchema.parse({}));
    expect(() => registry.getModel({ provider: "bogus", model: "x" })).toThrow(/bogus/);
    expect(() => registry.getModel({ provider: "bogus", model: "x" })).toThrow(/anthropic/);
  });

  it("R5.2: an unknown model id on a known provider is pass-through creatable (design.md correction)", () => {
    const registry = createProviderRegistry(configSchema.parse({}));
    expect(() =>
      registry.getModel({ provider: "anthropic", model: "claude-totally-new-model" }),
    ).not.toThrow();
    const model = registry.getModel({ provider: "anthropic", model: "claude-totally-new-model" });
    expect(model.ref.model).toBe("claude-totally-new-model");
  });

  it("R5.3: listModels pairs the four known anthropic models with pricingFor results", () => {
    const registry = createProviderRegistry(configSchema.parse({}));
    const listed = registry.listModels();
    const anthropicEntries = listed.filter((e) => e.ref.provider === "anthropic");
    expect(anthropicEntries.map((e) => e.ref.model)).toEqual([
      "claude-haiku-4-5",
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-fable-5",
    ]);
    for (const entry of anthropicEntries) {
      expect(entry.pricing).toEqual(pricingFor("anthropic", entry.ref.model));
      expect(entry.pricing).not.toBeNull();
    }
  });

  it("R5.3: an ollama openaiCompat entry lists $0 pricing", () => {
    const config = configSchema.parse({
      providers: {
        openaiCompat: [{ id: "ollama", baseUrl: "http://localhost:11434/v1", models: ["llama3"] }],
      },
    });
    const registry = createProviderRegistry(config);
    const listed = registry.listModels();
    const ollamaEntry = listed.find((e) => e.ref.provider === "ollama" && e.ref.model === "llama3");
    expect(ollamaEntry).toBeDefined();
    expect(ollamaEntry?.pricing).toEqual(pricingFor("ollama", "llama3"));
    expect(ollamaEntry?.pricing).toEqual({
      inputPerMTok: 0,
      outputPerMTok: 0,
      cacheReadPerMTok: 0,
      cacheWritePerMTok: 0,
      source: "local inference",
    });
  });

  it("resolves an ollama-configured model without network (create() only builds the object)", () => {
    const config = configSchema.parse({
      providers: {
        openaiCompat: [{ id: "ollama", baseUrl: "http://localhost:11434/v1", models: ["llama3"] }],
      },
    });
    const registry = createProviderRegistry(config);
    const model = registry.getModel({ provider: "ollama", model: "llama3" });
    expect(model.ref).toEqual({ provider: "ollama", model: "llama3" });
  });

  it("accepts injected adapters for isolated testing, bypassing config entirely", () => {
    const fakeModel: ChatModel = {
      ref: { provider: "fake", model: "m1" },
      estimateTokens: (t) => t.length,
      async *stream() {},
    };
    const fakeAdapter: ProviderAdapter = {
      id: "fake",
      models: () => ["m1"],
      create: (modelId) => ({ ...fakeModel, ref: { provider: "fake", model: modelId } }),
    };
    const registry = createProviderRegistry(configSchema.parse({}), { adapters: [fakeAdapter] });

    expect(registry.getModel({ provider: "fake", model: "m1" }).ref).toEqual({
      provider: "fake",
      model: "m1",
    });
    expect(registry.listModels()).toEqual([
      { ref: { provider: "fake", model: "m1" }, pricing: null },
    ]);
    expect(() => registry.getModel({ provider: "anthropic", model: "claude-sonnet-5" })).toThrow(
      /unknown provider "anthropic"/,
    );
  });
});
