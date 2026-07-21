/**
 * renderLedgerTable — the docs/05-ROUTING-AND-LEDGER.md §2 `/ledger` table,
 * pure text (used both by the in-session `/ledger` panel and `cox ledger`).
 *
 * Deviates from the doc's literal example in two documented ways (see
 * packages/tui/NOTES.md and INTEGRATION-NOTES.md):
 * 1. No "calls" column per tier — `LedgerSummary.byTier`/`.byModel` carry
 *    `{usage, costUsd}` only, no per-bucket entry count, so a per-tier
 *    call count cannot be computed from the frozen core type at all.
 * 2. Column spacing is this file's own consistent algorithm (fixed
 *    per-column widths + a 2-space separator), not a literal
 *    reproduction of the doc's example — verified earlier
 *    (packages/tui/NOTES.md, task 6) that the doc's header row and data
 *    rows don't share one consistent width scheme to reproduce anyway.
 */
import { pricingFor, TIERS, type LedgerSummary } from "@cox/core";
import { formatTokens, formatUsd } from "./format";

function padCell(text: string, width: number, align: "left" | "right"): string {
  if (text.length >= width) return text;
  const pad = " ".repeat(width - text.length);
  return align === "left" ? text + pad : pad + text;
}

const COL = { tier: 9, inTok: 6, outTok: 7, cost: 6, share: 5 };
const SEP = "  ";

function row(tier: string, inTok: string, outTok: string, cost: string, share: string): string {
  return (
    "  " +
    [
      padCell(tier, COL.tier, "left"),
      padCell(inTok, COL.inTok, "right"),
      padCell(outTok, COL.outTok, "right"),
      padCell(cost, COL.cost, "right"),
      padCell(share, COL.share, "right"),
    ].join(SEP)
  );
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((100 * part) / whole);
}

/**
 * Sum of (input rate - cache-read rate) * cacheReadTokens across every
 * model in byModel — what those cache reads *would* have cost at the
 * full input rate, minus what they actually cost.
 */
function cacheSavingsUsd(summary: LedgerSummary): number {
  const PER_MILLION = 1_000_000;
  let total = 0;
  for (const [key, bucket] of Object.entries(summary.byModel)) {
    const slash = key.indexOf("/");
    if (slash < 0) continue;
    const pricing = pricingFor(key.slice(0, slash), key.slice(slash + 1));
    if (!pricing) continue;
    const cacheRate = pricing.cacheReadPerMTok ?? pricing.inputPerMTok;
    const savedPerToken = pricing.inputPerMTok - cacheRate;
    total += (bucket.usage.cacheReadTokens * savedPerToken) / PER_MILLION;
  }
  return Math.max(0, total);
}

export function renderLedgerTable(summary: LedgerSummary, label: string): string {
  const lines: string[] = [];
  lines.push(
    `${label} — ${summary.entries} calls, ${formatTokens(summary.usage.inputTokens)} in (${formatTokens(
      summary.usage.cacheReadTokens,
    )} cached) / ${formatTokens(summary.usage.outputTokens)} out, ${formatUsd(summary.costUsd)}`,
  );
  lines.push(row("tier", "in-tok", "out-tok", "cost", "share"));
  for (const tier of TIERS) {
    const bucket = summary.byTier[tier];
    if (!bucket) continue;
    lines.push(
      row(
        tier,
        formatTokens(bucket.usage.inputTokens),
        formatTokens(bucket.usage.outputTokens),
        formatUsd(bucket.costUsd),
        `${pct(bucket.costUsd, summary.costUsd)}%`,
      ),
    );
  }
  const savings = summary.baselineArchitectCostUsd - summary.costUsd;
  lines.push(
    `  ─ savings vs all-architect baseline: ${formatUsd(savings)} (${pct(
      savings,
      summary.baselineArchitectCostUsd,
    )}% saved)`,
  );
  lines.push(
    `  ─ cache: ${formatTokens(summary.usage.cacheReadTokens)} reads saved ≈ ${formatUsd(
      cacheSavingsUsd(summary),
    )} vs uncached`,
  );
  return lines.join("\n");
}
