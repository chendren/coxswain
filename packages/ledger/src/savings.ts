/**
 * Returns the percentage saved on a 0-100 scale.
 * @param savedUsd - Amount saved in USD
 * @param baselineUsd - Baseline amount in USD (what it would have cost without savings)
 * @returns Percent saved (0-100), clamped and guarded against invalid inputs
 */
export function savingsPercent(savedUsd: number, baselineUsd: number): number {
  // Guard: if baselineUsd <= 0 or non-finite → return 0
  if (!Number.isFinite(baselineUsd) || baselineUsd <= 0) {
    return 0;
  }

  // Guard: if savedUsd non-finite → 0
  if (!Number.isFinite(savedUsd)) {
    return 0;
  }

  const percent = (savedUsd / baselineUsd) * 100;

  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, percent));
}
