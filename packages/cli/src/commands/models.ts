/**
 * cox models (R11.1): configured tiers, their primary/fallback models, and
 * pricing (pricingFor), marking unknown pricing n/a.
 */
import { pricingFor, TIERS, type CoxConfig, type ModelRef } from "@cox/core";

export interface ModelsReportOpts {
  cfg: CoxConfig;
  write: (line: string) => void;
}

function describeModel(ref: ModelRef): string {
  const pricing = pricingFor(ref.provider, ref.model);
  const priceStr = pricing
    ? `$${pricing.inputPerMTok.toFixed(2)}/$${pricing.outputPerMTok.toFixed(2)} per MTok in/out`
    : "pricing n/a";
  return `${ref.provider}/${ref.model} (${priceStr})`;
}

export function runModelsReport(opts: ModelsReportOpts): void {
  for (const tier of TIERS) {
    const entry = opts.cfg.tiers[tier];
    opts.write(`${tier}:`);
    opts.write(`  primary:  ${describeModel(entry.primary)}`);
    for (const fallback of entry.fallbacks) {
      opts.write(`  fallback: ${describeModel(fallback)}`);
    }
  }
}
