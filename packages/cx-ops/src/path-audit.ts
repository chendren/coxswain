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

/**
 * Group path segments by coarse phase prefix for multi-stage commands (run).
 * Segments matching known prefixes are bucketed; others go under "other".
 */
export function formatPathByPhase(path: string[]): string {
  if (path.length === 0) return "";
  const buckets: Record<string, string[]> = {
    build: [],
    status: [],
    simulate: [],
    report: [],
    other: [],
  };
  for (const seg of path) {
    const s = seg.toLowerCase();
    if (s.includes("build") || s.includes("deploy") || s.startsWith("create") || s.includes("approve") || s.includes("seed")) {
      buckets.build!.push(seg);
    } else if (s.includes("status") || s.includes("health")) {
      buckets.status!.push(seg);
    } else if (s.includes("simulat") || s.includes("traffic")) {
      buckets.simulate!.push(seg);
    } else if (s.includes("report") || s.includes("nba") || s.includes("summary")) {
      buckets.report!.push(seg);
    } else {
      buckets.other!.push(seg);
    }
  }
  const parts: string[] = [];
  for (const key of ["build", "status", "simulate", "report", "other"] as const) {
    const segs = buckets[key]!;
    if (segs.length === 0) continue;
    parts.push(`${key}: ${formatPathAudit(segs, 6)}`);
  }
  return parts.join(" | ");
}
