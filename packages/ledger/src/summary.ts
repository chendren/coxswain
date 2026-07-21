import { addUsage, computeCostUsd, modelKey, ZERO_USAGE } from "@cox/core";
import type { LedgerEntry, LedgerSummary, ModelPricing } from "@cox/core";

/**
 * Single-pass totals + byTier/byModel breakdown (R7.1) plus the
 * baseline-vs-architect re-pricing (R7.2). `architectPricing` null (unknown
 * pricing for the configured architect primary) yields baseline 0.
 */
export function summarize(
  entries: LedgerEntry[],
  architectPricing: ModelPricing | null,
): LedgerSummary {
  let usage = ZERO_USAGE;
  let costUsd = 0;
  let baselineArchitectCostUsd = 0;
  const byTier: LedgerSummary["byTier"] = {};
  const byModel: LedgerSummary["byModel"] = {};

  for (const entry of entries) {
    usage = addUsage(usage, entry.usage);
    const cost = entry.costUsd ?? 0;
    costUsd += cost;

    const tierBucket = byTier[entry.tier] ?? { calls: 0, usage: ZERO_USAGE, costUsd: 0 };
    byTier[entry.tier] = {
      calls: tierBucket.calls + 1,
      usage: addUsage(tierBucket.usage, entry.usage),
      costUsd: tierBucket.costUsd + cost,
    };

    const key = modelKey(entry.model);
    const modelBucket = byModel[key] ?? { calls: 0, usage: ZERO_USAGE, costUsd: 0 };
    byModel[key] = {
      calls: modelBucket.calls + 1,
      usage: addUsage(modelBucket.usage, entry.usage),
      costUsd: modelBucket.costUsd + cost,
    };

    if (architectPricing) {
      // computeCostUsd already prices cache fields at cache rates when the
      // pricing table defines them (falls back to input rate otherwise).
      baselineArchitectCostUsd += computeCostUsd(entry.usage, architectPricing);
    }
  }

  return {
    entries: entries.length,
    usage,
    costUsd,
    byTier,
    byModel,
    baselineArchitectCostUsd,
  };
}
