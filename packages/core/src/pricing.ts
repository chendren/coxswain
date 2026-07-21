import type { ModelPricing } from "./types.js";

/**
 * USD per million tokens. VERIFY BEFORE RELEASE — prices drift.
 * Ledger accuracy depends on this table; unknown models are recorded with
 * costUsd = null (tokens still tracked). Keys are `provider/model`.
 *
 * Anthropic rules: cache read ≈ 0.1× input; cache write (5m TTL) ≈ 1.25× input.
 * Sources checked 2026-07-20:
 *   - Anthropic: https://platform.claude.com/docs/en/pricing
 *   - xAI:       https://docs.x.ai (verify — third-party sources conflict)
 */
export const PRICING: Record<string, ModelPricing> = {
  "anthropic/claude-haiku-4-5": {
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 1.25,
    source: "platform.claude.com/docs/en/pricing 2026-07-20",
  },
  "anthropic/claude-sonnet-5": {
    // Intro pricing $2/$10 through 2026-08-31; standard $3/$15 after.
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheReadPerMTok: 0.3,
    cacheWritePerMTok: 3.75,
    source: "platform.claude.com/docs/en/pricing 2026-07-20",
  },
  "anthropic/claude-sonnet-4-6": {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheReadPerMTok: 0.3,
    cacheWritePerMTok: 3.75,
    source: "platform.claude.com/docs/en/pricing 2026-07-20",
  },
  "anthropic/claude-opus-4-8": {
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
    source: "platform.claude.com/docs/en/pricing 2026-07-20",
  },
  "anthropic/claude-fable-5": {
    inputPerMTok: 10.0,
    outputPerMTok: 50.0,
    cacheReadPerMTok: 1.0,
    cacheWritePerMTok: 12.5,
    source: "platform.claude.com/docs/en/pricing 2026-07-20",
  },
  "xai/grok-4-1-fast": {
    inputPerMTok: 0.2,
    outputPerMTok: 0.5,
    cacheReadPerMTok: 0.05,
    cacheWritePerMTok: null,
    source: "docs.x.ai 2026-07-20 (VERIFY)",
  },
  "xai/grok-4-3": {
    inputPerMTok: 1.25,
    outputPerMTok: 2.5,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: null,
    source: "docs.x.ai 2026-07-20 (VERIFY)",
  },
  "ollama/*": {
    inputPerMTok: 0,
    outputPerMTok: 0,
    cacheReadPerMTok: 0,
    cacheWritePerMTok: 0,
    source: "local inference",
  },
};

/** Lookup with ollama wildcard support. */
export function pricingFor(provider: string, model: string): ModelPricing | null {
  return (
    PRICING[`${provider}/${model}`] ??
    (provider === "ollama" ? PRICING["ollama/*"] ?? null : null)
  );
}
