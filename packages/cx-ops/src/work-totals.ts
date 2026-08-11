/**
 * Example: "2 proposals, 1 task across 2 specs"
 * Plural rules: 1 proposal / N proposals; 1 task / N tasks; 1 spec / N specs
 * Non-finite or negative counts treated as 0.
 */
export function formatWorkTotals(totals: {
  proposals: number;
  tasks: number;
  specsWithWork: number;
}): string {
  const p = sanitize(totals.proposals);
  const t = sanitize(totals.tasks);
  const s = sanitize(totals.specsWithWork);
  const pWord = p === 1 ? "proposal" : "proposals";
  const tWord = t === 1 ? "task" : "tasks";
  const sWord = s === 1 ? "spec" : "specs";
  return `${p} ${pWord}, ${t} ${tWord} across ${s} ${sWord}`;
}

function sanitize(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
