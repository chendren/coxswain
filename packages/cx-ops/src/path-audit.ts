/**
 * Format a control-flow path audit for operator display.
 * Long paths collapse to first 3 + last 3 with ellipsis when length exceeds max.
 */

/** Default length above which paths are collapsed. */
export const PATH_AUDIT_DEFAULT_MAX = 8;

/**
 * Collapse a path audit array for readable CLI/status output.
 * - length <= max (default 8): join all segments with " -> "
 * - length > max: first 3, "...", last 3
 */
export function formatPathAudit(path: string[], max: number = PATH_AUDIT_DEFAULT_MAX): string {
  if (path.length === 0) return "";
  if (path.length <= max) return path.join(" -> ");
  const head = path.slice(0, 3);
  const tail = path.slice(-3);
  return [...head, "...", ...tail].join(" -> ");
}
