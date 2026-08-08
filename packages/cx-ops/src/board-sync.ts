/**
 * Shared board storage: export / import fleet snapshot JSON for multi-host handoff.
 * Not a multi-writer DB — last-write-wins merge of proposals/tasks by id.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildOpsBoard, type OpsBoard } from "./board";
import { buildWorkQueue, type WorkQueue } from "./fleet-queue";
import type { CxProposal } from "./proposals";
import { loadProposals } from "./proposals";
import type { CxTask } from "./tasks";
import { loadCxTasks } from "./tasks";
import { listCxSpecs, type CxWorkspaceDeps } from "./workspace";

export interface BoardSyncSnapshot {
  version: 1;
  exportedAt: string;
  board: OpsBoard;
  queue: WorkQueue;
  specs: {
    name: string;
    proposals: CxProposal[];
    tasks: CxTask[];
  }[];
}

export async function exportBoardSync(
  deps: CxWorkspaceDeps,
  outFile: string,
  cwd: string,
): Promise<{ path: string[]; file: string; specs: number }> {
  const path = ["list_specs", "build_board", "build_queue", "load_each", "write", "emit"];
  const board = await buildOpsBoard(deps);
  const queue = await buildWorkQueue(deps);
  const names = await listCxSpecs(deps);
  const specs = [];
  for (const name of names) {
    specs.push({
      name,
      proposals: await loadProposals(deps, name),
      tasks: await loadCxTasks(deps, name),
    });
  }
  const snap: BoardSyncSnapshot = {
    version: 1,
    exportedAt: deps.now(),
    board,
    queue,
    specs,
  };
  const file = resolve(cwd, outFile);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, JSON.stringify(snap, null, 2), "utf8");
  return { path, file, specs: names.length };
}

/**
 * Import proposals/tasks from snapshot (merge by id; incoming wins on conflict).
 * Does not overwrite spec.json or deployments.
 */
export async function importBoardSync(
  deps: CxWorkspaceDeps,
  inFile: string,
  cwd: string,
): Promise<{ path: string[]; specs: number; proposals: number; tasks: number }> {
  const path = ["read_snapshot", "merge_each", "emit"];
  const file = resolve(cwd, inFile);
  const raw = await readFile(file, "utf8");
  const snap = JSON.parse(raw) as BoardSyncSnapshot;
  if (snap.version !== 1 || !Array.isArray(snap.specs)) {
    throw new Error("invalid board-sync snapshot (expected version 1)");
  }
  let proposals = 0;
  let tasks = 0;
  for (const s of snap.specs) {
    await mkdir(join(deps.cxRoot, s.name), { recursive: true });
    const existingP = await loadProposals(deps, s.name);
    const byId = new Map(existingP.map((p) => [p.id, p]));
    for (const p of s.proposals ?? []) {
      byId.set(p.id, p);
    }
    const mergedP = [...byId.values()];
    proposals += (s.proposals ?? []).length;
    await writeFile(
      join(deps.cxRoot, s.name, "proposals.json"),
      JSON.stringify({ proposals: mergedP, updatedAt: deps.now() }, null, 2),
      "utf8",
    );

    const existingT = await loadCxTasks(deps, s.name);
    const tById = new Map(existingT.map((t) => [t.id, t]));
    for (const t of s.tasks ?? []) {
      tById.set(t.id, t);
    }
    const mergedT = [...tById.values()];
    tasks += (s.tasks ?? []).length;
    await writeFile(
      join(deps.cxRoot, s.name, "tasks.json"),
      JSON.stringify({ tasks: mergedT, updatedAt: deps.now() }, null, 2),
      "utf8",
    );
  }
  return { path, specs: snap.specs.length, proposals, tasks };
}
