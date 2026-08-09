/**
 * CX task list — proposal apply bridge (appendTask substitute).
 * Graph: load_tasks → apply_proposal → persist → emit
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CxProposal } from "./proposals";
import { transitionProposal, type ProposalStoreDeps } from "./proposals";
import { getCxDb, isSqliteEnabled } from "./sqlite.js";

export type CxTaskStatus = "pending" | "in_progress" | "done" | "cancelled";

export interface TaskEvidence {
  at: string;
  note: string;
  by?: string;
  url?: string;
}

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
  /** Operator who applied / owns the task. */
  assignedTo?: string;
  /** Operator who marked done/cancelled. */
  closedBy?: string;
  closedAt?: string;
  /** Human verify-back notes (proof of work outside CXOS). */
  evidence?: TaskEvidence[];
}

function tasksPath(deps: ProposalStoreDeps, specName: string): string {
  return join(deps.cxRoot, specName, "tasks.json");
}

export async function loadCxTasks(
  deps: ProposalStoreDeps,
  specName: string,
): Promise<CxTask[]> {
  if (isSqliteEnabled()) {
    try {
      const db = getCxDb(deps.cxRoot);
      const rows = db
        .prepare<{
          id: string;
          spec_name: string;
          title: string;
          detail: string;
          status: string;
          source_proposal_id: string | null;
          target_id: string | null;
          nba_action: string | null;
          created_at: string;
          updated_at: string;
          path_json: string | null;
          assigned_to: string | null;
          closed_by: string | null;
          closed_at: string | null;
          evidence_json: string | null;
        }>("SELECT * FROM tasks WHERE spec_name = ? ORDER BY created_at ASC")
        .all(specName);
      return rows.map((r) => ({
        id: r.id,
        specName: r.spec_name,
        title: r.title,
        detail: r.detail,
        status: r.status as CxTaskStatus,
        sourceProposalId: r.source_proposal_id ?? undefined,
        targetId: r.target_id ?? undefined,
        nbaAction: r.nba_action ?? undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        path: r.path_json ? JSON.parse(r.path_json) : [],
        assignedTo: r.assigned_to ?? undefined,
        closedBy: r.closed_by ?? undefined,
        closedAt: r.closed_at ?? undefined,
        evidence: r.evidence_json ? JSON.parse(r.evidence_json) : undefined,
      }));
    } catch {
      return [];
    }
  }
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
  if (isSqliteEnabled()) {
    const db = getCxDb(deps.cxRoot);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM tasks WHERE spec_name = ?").run(specName);
      for (const t of tasks) {
        db.prepare(
          "INSERT INTO tasks (id, spec_name, title, detail, status, source_proposal_id, target_id, nba_action, created_at, updated_at, path_json, assigned_to, closed_by, closed_at, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          t.id,
          t.specName,
          t.title,
          t.detail,
          t.status,
          t.sourceProposalId ?? null,
          t.targetId ?? null,
          t.nbaAction ?? null,
          t.createdAt,
          t.updatedAt,
          JSON.stringify(t.path),
          t.assignedTo ?? null,
          t.closedBy ?? null,
          t.closedAt ?? null,
          t.evidence ? JSON.stringify(t.evidence) : null,
        );
      }
      db.exec("COMMIT");
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      throw e;
    }
    return;
  }
  await mkdir(join(deps.cxRoot, specName), { recursive: true });
  await writeFile(
    tasksPath(deps, specName),
    JSON.stringify({ tasks, updatedAt: deps.now() }, null, 2),
    "utf8",
  );
}

export function remediationFilePath(
  deps: ProposalStoreDeps,
  specName: string,
  proposalId: string,
): string {
  return join(deps.cxRoot, specName, "remediations", `${proposalId}.md`);
}

export interface TaskSummary {
  pending: number;
  in_progress: number;
  done: number;
  cancelled: number;
  total: number;
  open: number;
}

export function summarizeTasks(tasks: CxTask[]): TaskSummary {
  let pending = 0;
  let in_progress = 0;
  let done = 0;
  let cancelled = 0;
  for (const t of tasks) {
    if (t.status === "pending") pending++;
    else if (t.status === "in_progress") in_progress++;
    else if (t.status === "done") done++;
    else if (t.status === "cancelled") cancelled++;
  }
  return {
    pending,
    in_progress,
    done,
    cancelled,
    total: tasks.length,
    open: pending + in_progress,
  };
}

/**
 * Apply an open/claimed proposal: create a CX task + remediation note.
 * Default marks proposal **claimed**. Pass `{ resolve: true }` to mark **resolved**.
 */
export async function applyProposal(
  deps: ProposalStoreDeps,
  specName: string,
  proposal: CxProposal,
  opts?: { resolve?: boolean; actor?: string },
): Promise<{ path: string[]; task: CxTask; remediationPath: string }> {
  const path = ["load_tasks", "apply_proposal", "write_remediation", "transition_proposal", "emit"];
  if (proposal.status === "resolved" || proposal.status === "dismissed") {
    throw new Error(`proposal ${proposal.id} is ${proposal.status} — nothing to apply`);
  }
  const now = deps.now();
  const tasks = await loadCxTasks(deps, specName);
  const actor = opts?.actor?.trim() || undefined;

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
    assignedTo: actor,
  };
  tasks.push(task);
  await saveCxTasks(deps, specName, tasks);

  const remediationPath = remediationFilePath(deps, specName, proposal.id);
  await mkdir(join(deps.cxRoot, specName, "remediations"), { recursive: true });
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
    `3. If NBA action present, execute via platform ops console - do not auto-mutate prod`,
    `4. Mark task done: \`cox cx task ${specName} ${task.id} done\` (auto-resolves proposal)`,
    `5. Or resolve proposal only: \`cox cx proposal ${specName} ${proposal.id} resolved\``,
    ``,
    `## Graph path`,
    "```",
    proposal.path.join(" → "),
    "```",
    ``,
  ].join("\n");
  await writeFile(remediationPath, md, "utf8");

  // resolve:true → resolved; default → claimed (human still owns close-out)
  const nextStatus = opts?.resolve ? "resolved" : "claimed";
  await transitionProposal(deps, specName, proposal.id, nextStatus, { actor });

  return { path, task, remediationPath };
}

export async function transitionTask(
  deps: ProposalStoreDeps,
  specName: string,
  taskId: string,
  status: CxTaskStatus,
  opts?: { resolveSource?: boolean; actor?: string; evidence?: string; evidenceUrl?: string },
): Promise<CxTask | null> {
  const tasks = await loadCxTasks(deps, specName);
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return null;
  const current = tasks[idx]!;
  const now = deps.now();
  const actor = opts?.actor?.trim() || undefined;
  const next: CxTask = { ...current, status, updatedAt: now };
  if (opts?.evidence?.trim()) {
    const ev = {
      at: now,
      note: opts.evidence.trim(),
      by: actor,
      url: opts.evidenceUrl?.trim() || undefined,
    };
    next.evidence = [...(current.evidence ?? []), ev];
  }
  if ((status === "done" || status === "cancelled") && actor) {
    next.closedBy = actor;
    next.closedAt = now;
  }
  tasks[idx] = next;
  await saveCxTasks(deps, specName, tasks);

  // Closing a task resolves the source proposal by default (human gate still required to get here).
  const resolveSource = opts?.resolveSource !== false;
  if (status === "done" && resolveSource && current.sourceProposalId) {
    try {
      await transitionProposal(deps, specName, current.sourceProposalId, "resolved", {
        actor,
      });
    } catch {
      // Proposal may already be resolved/dismissed; task transition still succeeds.
    }
  }
  return next;
}
