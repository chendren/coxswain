/**
 * Utilization as 0-100 percent (not 0-1).
 * - non-finite spent/limit → 0
 * - limit <= 0 → 0 if spent <= 0, else 100 (capped)
 * - otherwise min(100, max(0, round((spent/limit)*100)))
 */
export function utilizationPercent(spent: number, limit: number): number {
  if (!Number.isFinite(spent) || !Number.isFinite(limit)) return 0;
  if (limit <= 0) return spent > 0 ? 100 : 0;
  const pct = (spent / limit) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

/**
 * Label for UI: "ok" | "warn" | "exceeded"
 * - pct >= 100 → exceeded
 * - pct >= warnAt (default 80) → warn
 * - else ok
 * - non-finite pct → ok
 */
export function utilizationLevel(
  pct: number,
  warnAt: number = 80,
): "ok" | "warn" | "exceeded" {
  if (!Number.isFinite(pct)) return "ok";
  if (pct >= 100) return "exceeded";
  if (pct >= warnAt) return "warn";
  return "ok";
}
