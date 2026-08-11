/**
 * One-line queue row for CLI.
 * Example: "[high] alpha p-1 12h remediate - fix billing"
 * (use ASCII hyphen only)
 */
export function formatQueueProposalLine(p: {
  urgency: string;
  specName: string;
  id: string;
  ageDisplay?: string;
  ageHours?: number;
  kind: string;
  summary: string;
}): string {
  const age =
    p.ageDisplay ??
    (typeof p.ageHours === "number" ? `${Math.floor(p.ageHours)}h` : "0h");
  const summary = (p.summary ?? "").slice(0, 60);
  return `[${p.urgency}] ${p.specName} ${p.id} ${age} ${p.kind} - ${summary}`;
}
