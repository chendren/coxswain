/**
 * Cross-spec work queue: open proposals + open tasks for the whole CXOS fleet.
 */
import {
  loadProposals,
  proposalUrgencyScore,
  suggestedProposalNext,
  type CxProposal,
} from "./proposals";
import { loadCxTasks, type CxTask } from "./tasks";
import { listCxSpecs, type CxWorkspaceDeps } from "./workspace";
import { urgencyLabel } from "./urgency-label";
import { compactPath } from "./path-compact";

export interface QueueProposalItem {
  specName: string;
  id: string;
  status: string;
  kind: string;
  targetId: string;
  summary: string;
  ageHours: number;
  next: string;
  urgencyScore: number;
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
  pathDisplay: string;
}

function ageHours(iso: string, nowMs: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.floor(Math.max(0, nowMs - t) / 3_600_000);
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
      const age = ageHours(p.createdAt, nowMs);
      const urgencyScore = proposalUrgencyScore(p.kind, age);
      proposals.push({
        specName,
        id: p.id,
        status: p.status,
        kind: p.kind,
        targetId: p.targetId,
        summary: p.summary,
        ageHours: age,
        next: suggestedProposalNext(p.status),
        urgencyScore,
        urgency: urgencyLabel(urgencyScore),
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
    pathDisplay: compactPath(path),
  };
}

/** @internal helper for tests */
export function _urgencyFromKind(kind: string): "high" | "med" | "low" {
  return urgencyLabel(proposalUrgencyScore(kind, 0));
}

export type { CxProposal, CxTask };
