/**
 * Executive / sponsor brief (markdown) for one CX program.
 * Pure string render from workspace state — no model required.
 */
import type { CxDeployment } from "@cox/cx-core";
import type { CxProposal } from "./proposals";
import type { CxTask } from "./tasks";
import { summarizeTasks } from "./tasks";
import type { CxWorkspaceRecord } from "./workspace";
import { summarizeDeployments, type HealthEntry } from "./metrics-summary";

export interface BriefInput {
  name: string;
  record: CxWorkspaceRecord;
  deployments: Partial<Record<string, CxDeployment>>;
  proposals: CxProposal[];
  tasks: CxTask[];
  healthEntries?: HealthEntry[];
  /** Recent scores newest-last, e.g. from health-history. */
  healthScoreTrail?: number[];
  generatedAt: string;
}

export function renderExecBrief(input: BriefInput): string {
  const { name, record, deployments, proposals, tasks, generatedAt } = input;
  const phases = record.spec.state.phases;
  const depIds = Object.keys(deployments);
  const taskSum = summarizeTasks(tasks);
  const openProps = proposals.filter((p) => p.status === "open" || p.status === "claimed");
  const health =
    input.healthEntries && input.healthEntries.length > 0
      ? summarizeDeployments(input.healthEntries)
      : null;

  const lines: string[] = [
    `# CXOS Executive Brief: ${name}`,
    ``,
    `Generated: ${generatedAt}`,
    ``,
    `## Program`,
    ``,
    `- **Idea:** ${record.idea}`,
    `- **Phases:** requirements=${phases.requirements} · design=${phases.design} · tasks=${phases.tasks}`,
    `- **Deployments:** ${depIds.length ? depIds.join(", ") : "(none)"}`,
    ``,
    `## Health`,
    ``,
  ];

  if (health) {
    lines.push(
      `- **Score:** ${health.score}/100`,
      `- **Targets:** healthy=${health.healthy} degraded=${health.degraded} down=${health.down} errors=${health.errors}`,
      ``,
    );
  } else {
    lines.push(`- Status not polled in this brief (run \`cox cx status ${name}\` for live score).`, ``);
  }
  if (input.healthScoreTrail && input.healthScoreTrail.length > 0) {
    lines.push(`- **Score trail:** ${input.healthScoreTrail.join(" → ")}`, ``);
  }

  lines.push(
    `## Work queue`,
    ``,
    `- **Proposals open/claimed:** ${openProps.length}`,
    `- **Tasks open:** ${taskSum.open} (pending=${taskSum.pending} in_progress=${taskSum.in_progress})`,
    `- **Tasks done:** ${taskSum.done}`,
    `- **Tasks cancelled:** ${taskSum.cancelled}`,
    ``,
  );

  if (openProps.length > 0) {
    lines.push(`### Top proposals`, ``);
    for (const p of openProps.slice(0, 8)) {
      lines.push(`- \`${p.id}\` [${p.status}/${p.kind}] ${p.targetId}: ${p.summary}`);
    }
    lines.push(``);
  }

  if (taskSum.open > 0) {
    lines.push(`### Open tasks`, ``);
    for (const t of tasks.filter((x) => x.status === "pending" || x.status === "in_progress").slice(0, 8)) {
      lines.push(`- \`${t.id}\` [${t.status}] ${t.title}`);
    }
    lines.push(``);
  }

  const journeys = record.spec.design?.journeyMaps?.length ?? 0;
  lines.push(
    `## Design footprint`,
    ``,
    `- Journey maps: ${journeys}`,
    `- Requirements: ${record.spec.requirements.length}`,
    ``,
    `## Controls`,
    ``,
    `- AWS: plan-only (\`cox cx export-aws ${name}\`); human applies CFN.`,
    `- Mutations: console/daemon propose only; \`apply\` creates tasks + remediation notes.`,
    `- Close-out: \`cox cx task ${name} <taskId> done\` resolves linked proposals.`,
    ``,
    `## Suggested next steps`,
    ``,
    "```bash",
    `pnpm cox cx status ${name} --live`,
    `pnpm cox cx console ${name} --live`,
    `pnpm cox cx board`,
    `pnpm cox cx cab-export ${name}`,
    "```",
    ``,
    `---`,
    `*CXOS closed-world brief — no model required.*`,
    ``,
  );

  return lines.join("\n");
}
