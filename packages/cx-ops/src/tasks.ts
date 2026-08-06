/**
 * CX task list — proposal apply bridge (appendTask substitute).
 * Graph: load_tasks → apply_proposal → persist → emit
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CxProposal } from "./proposals";
import { transitionProposal, type ProposalStoreDeps } from "./proposals";

export type CxTaskStatus = "pending" | "in_progress" | "done" | "cancelled";

export interface CxTask {
  id: string;
  specName: string;
  title: string;
  detail: string;
  status: CxTaskStatus;
  sourceProposalId?: string;
  targetId?: string;
  nbaAction?: string;
  createdAt: string;
  updatedAt: string;
  path: string[];
}

function tasksPath(deps: ProposalStoreDeps, specName: string): string {
  return join(deps.cxRoot, specName, "tasks.json");
}

export async function loadCxTasks(
  deps: ProposalStoreDeps,
  specName: string,
): Promise<CxTask[]> {
  try {
    const raw = await readFile(tasksPath(deps, specName), "utf8");
    const data = JSON.parse(raw) as { tasks?: CxTask[] };
    return data.tasks ?? [];
  } catch {
    return [];
  }
}

async function saveCxTasks(
  deps: ProposalStoreDeps,
  specName: string,
  tasks: CxTask[],
): Promise<void> {
  await mkdir(join(deps.cxRoot, specName), { recursive: true });
  await writeFile(
    tasksPath(deps, specName),
    JSON.stringify({ tasks, updatedAt: deps.now() }, null, 2),
    "utf8",
  );
}

/**
 * Apply an open proposal: create a CX task + remediation note, mark proposal claimed/resolved.
 */
export async function applyProposal(
  deps: ProposalStoreDeps,
  specName: string,
  proposal: CxProposal,
  opts?: { resolve?: boolean },
): Promise<{ path: string[]; task: CxTask; remediationPath: string }> {
  const path = ["load_tasks", "apply_proposal", "write_remediation", "transition_proposal", "emit"];
  const now = deps.now();
  const tasks = await loadCxTasks(deps, specName);

  const task: CxTask = {
    id: `task_${now.replace(/[^0-9]/g, "").slice(0, 14)}_${tasks.length}`,
    specName,
    title: `[${proposal.kind}] ${proposal.targetId}: ${proposal.nbaAction ?? "investigate"}`,
    detail: proposal.summary,
    status: "pending",
    sourceProposalId: proposal.id,
    targetId: proposal.targetId,
    nbaAction: proposal.nbaAction,
    createdAt: now,
    updatedAt: now,
    path: [...proposal.path, "applied_to_task"],
  };
  tasks.push(task);
  await saveCxTasks(deps, specName, tasks);

  const remediationDir = join(deps.cxRoot, specName, "remediations");
  await mkdir(remediationDir, { recursive: true });
  const remediationPath = join(remediationDir, `${proposal.id}.md`);
  const md = [
    `# Remediation: ${proposal.id}`,
    ``,
    `- **Spec:** ${specName}`,
    `- **Target:** ${proposal.targetId}`,
    `- **Kind:** ${proposal.kind}`,
    `- **NBA rule:** ${proposal.nbaRuleId ?? "none"}`,
    `- **NBA action:** ${proposal.nbaAction ?? "none"}`,
    `- **Task:** ${task.id}`,
    `- **Created:** ${now}`,
    ``,
    `## Summary`,
    proposal.summary,
    ``,
    `## Operator steps (human-gated)`,
    `1. Review target health: \`cox cx status ${specName} --live\``,
    `2. If local platform: check dashboard and ollama (\`curl -s localhost:3143/api/health/ready\`)`,
    `3. If NBA action present, execute via platform ops console — do not auto-mutate prod`,
    `4. Mark task done: \`cox cx task ${specName} ${task.id} done\``,
    `5. Resolve proposal: \`cox cx proposal ${specName} ${proposal.id} resolved\``,
    ``,
    `## Graph path`,
    "```",
    proposal.path.join(" → "),
    "```",
    ``,
  ].join("\n");
  await writeFile(remediationPath, md, "utf8");

  const nextStatus = opts?.resolve === false ? "claimed" : "claimed";
  await transitionProposal(deps, specName, proposal.id, nextStatus);

  return { path, task, remediationPath };
}

export async function transitionTask(
  deps: ProposalStoreDeps,
  specName: string,
  taskId: string,
  status: CxTaskStatus,
): Promise<CxTask | null> {
  const tasks = await loadCxTasks(deps, specName);
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return null;
  const next = { ...tasks[idx]!, status, updatedAt: deps.now() };
  tasks[idx] = next;
  await saveCxTasks(deps, specName, tasks);
  return next;
}
