/**
 * Compact a path array for board/console one-liners.
 * - length <= max (default 6): join all segments with " → "
 * - length > max: first 2, " … ", last (max-3) segments
 */

/** Default maximum path length before collapsing. */
export const PATH_COMPACT_DEFAULT_MAX = 6;

/**
 * Compact a path array for readable one-line display.
 * @param path - Array of path segments
 * @param max - Maximum length before collapsing (default: 6)
 * @returns Compact string representation
 */
export function compactPath(path: string[], max: number = PATH_COMPACT_DEFAULT_MAX): string {
  if (path.length === 0) return "";
  if (path.length <= max) return path.join(" → ");
  
  const head = path.slice(0, 2);
  const tailCount = max - 3;
  const tail = path.slice(-tailCount);
  
  return [...head, "…", ...tail].join(" → ");
}
