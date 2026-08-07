/**
 * Cross-spec work queue: open proposals + open tasks for the whole CXOS fleet.
 */
import { loadProposals, suggestedProposalNext, type CxProposal } from "./proposals";
import { loadCxTasks, type CxTask } from "./tasks";
import { listCxSpecs, type CxWorkspaceDeps } from "./workspace";

export interface QueueProposalItem {
  specName: string;
  id: string;
  status: string;
  kind: string;
  targetId: string;
  summary: string;
  ageHours: number;
  next: string;
  urgency: "high" | "med" | "low";
}

export interface QueueTaskItem {
  specName: string;
  id: string;
  status: string;
  title: string;
  targetId?: string;
  sourceProposalId?: string;
  ageHours: number;
}

export interface WorkQueue {
  proposals: QueueProposalItem[];
  tasks: QueueTaskItem[];
  totals: { proposals: number; tasks: number; specsWithWork: number };
  path: string[];
}

function ageHours(iso: string, nowMs: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.floor(Math.max(0, nowMs - t) / 3_600_000);
}

function urg(kind: string): "high" | "med" | "low" {
  if (kind === "remediate") return "high";
  if (kind === "investigate") return "med";
  return "low";
}

export async function buildWorkQueue(
  deps: CxWorkspaceDeps,
  nowMs: number = Date.now(),
): Promise<WorkQueue> {
  const path = ["list_specs", "load_proposals_tasks", "sort", "emit"];
  const names = await listCxSpecs(deps);
  const proposals: QueueProposalItem[] = [];
  const tasks: QueueTaskItem[] = [];
  const specsWithWork = new Set<string>();

  for (const specName of names) {
    const props = await loadProposals(deps, specName);
    for (const p of props) {
      if (p.status !== "open" && p.status !== "claimed") continue;
      specsWithWork.add(specName);
      proposals.push({
        specName,
        id: p.id,
        status: p.status,
        kind: p.kind,
        targetId: p.targetId,
        summary: p.summary,
        ageHours: ageHours(p.createdAt, nowMs),
        next: suggestedProposalNext(p.status),
        urgency: urg(p.kind),
      });
    }
    const ts = await loadCxTasks(deps, specName);
    for (const t of ts) {
      if (t.status !== "pending" && t.status !== "in_progress") continue;
      specsWithWork.add(specName);
      tasks.push({
        specName,
        id: t.id,
        status: t.status,
        title: t.title,
        targetId: t.targetId,
        sourceProposalId: t.sourceProposalId,
        ageHours: ageHours(t.createdAt, nowMs),
      });
    }
  }

  proposals.sort((a, b) => {
    const u = { high: 0, med: 1, low: 2 } as const;
    const du = u[a.urgency] - u[b.urgency];
    if (du !== 0) return du;
    return b.ageHours - a.ageHours;
  });
  tasks.sort((a, b) => b.ageHours - a.ageHours);

  return {
    proposals,
    tasks,
    totals: {
      proposals: proposals.length,
      tasks: tasks.length,
      specsWithWork: specsWithWork.size,
    },
    path,
  };
}

/** @internal helper for tests */
export function _urgencyFromKind(kind: string): "high" | "med" | "low" {
  return urg(kind);
}

export type { CxProposal, CxTask };
