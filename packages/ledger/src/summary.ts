import { addUsage, modelKey, ZERO_USAGE } from "@cox/core";
import type { LedgerEntry, LedgerSummary, ModelPricing } from "@cox/core";

/**
 * Single-pass totals + byTier/byModel breakdown (R7.1). `architectPricing`
 * feeds the baseline-vs-architect re-pricing (R7.2, task 4).
 */
export function summarize(
  entries: LedgerEntry[],
  architectPricing: ModelPricing | null,
): LedgerSummary {
  let usage = ZERO_USAGE;
  let costUsd = 0;
  const byTier: LedgerSummary["byTier"] = {};
  const byModel: LedgerSummary["byModel"] = {};

  for (const entry of entries) {
    usage = addUsage(usage, entry.usage);
    const cost = entry.costUsd ?? 0;
    costUsd += cost;

    const tierBucket = byTier[entry.tier] ?? { usage: ZERO_USAGE, costUsd: 0 };
    byTier[entry.tier] = {
      usage: addUsage(tierBucket.usage, entry.usage),
      costUsd: tierBucket.costUsd + cost,
    };

    const key = modelKey(entry.model);
    const modelBucket = byModel[key] ?? { usage: ZERO_USAGE, costUsd: 0 };
    byModel[key] = {
      usage: addUsage(modelBucket.usage, entry.usage),
      costUsd: modelBucket.costUsd + cost,
    };
  }

  // TODO(task 4, R7.2): re-price each entry's usage at architectPricing.
  const baselineArchitectCostUsd = 0;

  return {
    entries: entries.length,
    usage,
    costUsd,
    byTier,
    byModel,
    baselineArchitectCostUsd,
  };
}
