/**
 * Pure function to determine health band from a numeric score.
 */
export function healthBand(score: number): "green" | "yellow" | "red" {
  if (!Number.isFinite(score)) return "red";
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}
