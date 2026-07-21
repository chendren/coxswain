import type { ChatModel, CoxConfig, ModelPricing, ModelRef, ProviderAdapter, ProviderRegistry } from "@cox/core";
import { modelKey, pricingFor } from "@cox/core";
import { createAnthropicAdapter } from "./anthropic.js";
import { createOpenAICompatAdapter } from "./openai-compat.js";

function buildDefaultAdapters(config: CoxConfig): ProviderAdapter[] {
  const adapters: ProviderAdapter[] = [
    createAnthropicAdapter({ apiKeyEnv: config.providers.anthropic.apiKeyEnv }),
  ];
  for (const entry of config.providers.openaiCompat) {
    adapters.push(createOpenAICompatAdapter(entry));
  }
  return adapters;
}

/**
 * R5 — the composition root's single ProviderRegistry: anthropic plus one
 * adapter per `config.providers.openaiCompat` entry ("ollama" is just an
 * openaiCompat entry, nothing special). `getModel` caches one ChatModel per
 * modelKey (R5.1). Unknown *provider* throws, naming the ref and listing
 * configured provider ids (R5.2); an unknown *model id* on a known provider
 * is pass-through creatable (design.md's determinism correction to R5.2's
 * literal text — see NOTES.md) so users can pin models newer than the
 * adapter's known list. `listModels()` pairs each adapter's known models
 * with `pricingFor` (R5.3).
 */
export function createProviderRegistry(
  config: CoxConfig,
  deps: { adapters?: ProviderAdapter[] } = {},
): ProviderRegistry {
  const adapters = deps.adapters ?? buildDefaultAdapters(config);
  const adapterById = new Map<string, ProviderAdapter>();
  for (const adapter of adapters) adapterById.set(adapter.id, adapter);

  const cache = new Map<string, ChatModel>();

  return {
    getModel(ref: ModelRef): ChatModel {
      const key = modelKey(ref);
      const cached = cache.get(key);
      if (cached) return cached;

      const adapter = adapterById.get(ref.provider);
      if (!adapter) {
        const configured = [...adapterById.keys()].join(", ");
        throw new Error(`unknown provider "${ref.provider}" — configured: ${configured}`);
      }

      const model = adapter.create(ref.model);
      cache.set(key, model);
      return model;
    },

    listModels(): { ref: ModelRef; pricing: ModelPricing | null }[] {
      const out: { ref: ModelRef; pricing: ModelPricing | null }[] = [];
      for (const adapter of adapters) {
        for (const modelId of adapter.models()) {
          const ref: ModelRef = { provider: adapter.id, model: modelId };
          out.push({ ref, pricing: pricingFor(adapter.id, modelId) });
        }
      }
      return out;
    },
  };
}
