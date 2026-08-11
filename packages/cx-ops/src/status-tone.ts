export type StatusTone = "neutral" | "active" | "done" | "danger" | "muted";

/**
 * Map lifecycle status to a tone token.
 * Proposals: open→active, claimed→active, dismissed→muted, resolved→done
 * Tasks: pending→neutral, in_progress→active, done→done, cancelled→muted
 * Unknown / empty → neutral
 */
export function statusTone(status: string): StatusTone {
  const s = (status ?? "").toLowerCase().trim();
  if (s === "open" || s === "claimed" || s === "in_progress") return "active";
  if (s === "pending") return "neutral";
  if (s === "done" || s === "resolved") return "done";
  if (s === "dismissed" || s === "cancelled") return "muted";
  if (s === "failed" || s === "error" || s === "blocked") return "danger";
  return "neutral";
}
