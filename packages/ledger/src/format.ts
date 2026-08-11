/**
 * Format a number as USD currency string.
 * - Non-finite numbers (NaN, Infinity, -Infinity) return "$0.00"
 * - Always shows exactly 2 decimal places with $ prefix
 * - Negative values use "-$1.20" format
 */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "$0.00";
  }

  const sign = amount < 0 ? "-" : "";
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toFixed(2);

  return `${sign}$${formatted}`;
}
