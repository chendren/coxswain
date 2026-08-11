import { savingsPercent } from "./savings.js";
import { formatUsd } from "./format.js";

/**
 * Human-readable savings line for TUI/CLI.
 * Example: "saved $6.41 of $8.28 (77%)"
 * - Non-finite inputs: treat via existing helpers
 * - Display percent with Math.round(savingsPercent(...)) so UI shows integer %
 */
export function formatSavingsLine(savedUsd: number, baselineUsd: number): string {
  const saved = formatUsd(savedUsd);
  const baseline = formatUsd(baselineUsd);
  const pct = Math.round(savingsPercent(savedUsd, baselineUsd));
  return `saved ${saved} of ${baseline} (${pct}%)`;
}
