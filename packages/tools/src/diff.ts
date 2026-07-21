/**
 * Unified-style diff for a single contiguous change (a find/replace edit).
 * Finds the common line prefix/suffix between `before` and `after` and
 * renders one hunk covering the differing middle plus `context` lines of
 * surrounding, unchanged lines on each side.
 *
 * This is not a general-purpose LCS/Myers diff — edit.ts is the only caller
 * and every call is a single old_string→new_string swap, which always
 * produces exactly one changed region. A multi-hunk diff is unnecessary here.
 */
export function unifiedDiff(
  path: string,
  before: string,
  after: string,
  context = 3,
): string {
  const a = before.split("\n");
  const b = after.split("\n");

  const maxCommon = Math.min(a.length, b.length);
  let start = 0;
  while (start < maxCommon && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const ctxStart = Math.max(0, start - context);
  const ctxEndA = Math.min(a.length - 1, endA + context);
  const ctxEndB = Math.min(b.length - 1, endB + context);

  const oldCount = Math.max(0, ctxEndA - ctxStart + 1);
  const newCount = Math.max(0, ctxEndB - ctxStart + 1);
  const oldStartLine = a.length === 0 ? 0 : ctxStart + 1;
  const newStartLine = b.length === 0 ? 0 : ctxStart + 1;

  const lines: string[] = [
    `--- ${path}`,
    `+++ ${path}`,
    `@@ -${oldStartLine},${oldCount} +${newStartLine},${newCount} @@`,
  ];

  for (let i = ctxStart; i < start; i++) lines.push(` ${a[i] ?? ""}`);
  for (let i = start; i <= endA; i++) lines.push(`-${a[i] ?? ""}`);
  for (let i = start; i <= endB; i++) lines.push(`+${b[i] ?? ""}`);
  for (let i = endA + 1; i <= ctxEndA; i++) lines.push(` ${a[i] ?? ""}`);

  return lines.join("\n");
}
