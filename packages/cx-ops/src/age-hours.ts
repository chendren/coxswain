/**
 * Compact age label for queue UI.
 * - non-finite or < 0 → "0h"
 * - < 24 → "Nh" (floor)
 * - < 48 → "1d"
 * - else → "Nd" where N = floor(hours/24)
 */
export function formatAgeHours(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "0h";
  const h = Math.floor(hours);
  if (h < 24) return `${h}h`;
  if (h < 48) return "1d";
  return `${Math.floor(h / 24)}d`;
}
