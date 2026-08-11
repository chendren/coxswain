/**
 * Pure function to determine urgency label from a numeric score.
 */
export function urgencyLabel(score: number): "high" | "med" | "low" {
  if (!Number.isFinite(score)) return "low";
  if (score >= 70) return "high";
  if (score >= 40) return "med";
  return "low";
}
