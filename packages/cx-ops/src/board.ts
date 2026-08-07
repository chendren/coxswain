/**
 * Multi-spec CXOS operations board (fleet view).
 * Strong rollup: phases, deployments, open proposals/tasks, daemon.
 */
import { isDaemonRunning, readDaemonMeta } from "./daemon";
import { loadProposals } from "./proposals";
import { loadCxTasks, summarizeTasks } from "./tasks";
import {
  listCxSpecs,
  loadCxWorkspace,
  loadDeployments,
  type CxWorkspaceDeps,
} from "./workspace";

export interface BoardRow {
  name: string;
  idea: string;
  phases: { requirements: string; design: string; tasks: string };
  deployments: string[];
  proposalsOpen: number;
  proposalsClaimed: number;
  tasksOpen: number;
  tasksDone: number;
  daemonRunning: boolean;
  daemonLastTickAt?: string;
  updatedAt: string;
}

export interface OpsBoard {
  rows: BoardRow[];
  totals: {
    specs: number;
    proposalsOpen: number;
    tasksOpen: number;
    daemonsRunning: number;
    deployedSpecs: number;
  };
  path: string[];
}

export async function buildOpsBoard(deps: CxWorkspaceDeps): Promise<OpsBoard> {
  const path = ["list_specs", "load_each", "rollup", "emit"];
  const names = await listCxSpecs(deps);
  const rows: BoardRow[] = [];
  let proposalsOpen = 0;
  let tasksOpen = 0;
  let daemonsRunning = 0;
  let deployedSpecs = 0;

  for (const name of names) {
    const rec = await loadCxWorkspace(deps, name);
    if (!rec) continue;
    const depsFile = await loadDeployments(deps, name);
    const deployed = Object.keys(depsFile.deployments);
    if (deployed.length > 0) deployedSpecs++;

    const props = await loadProposals(deps, name);
    const pOpen = props.filter((p) => p.status === "open").length;
    const pClaimed = props.filter((p) => p.status === "claimed").length;
    proposalsOpen += pOpen + pClaimed;

    const tasks = await loadCxTasks(deps, name);
    const ts = summarizeTasks(tasks);
    tasksOpen += ts.open;

    const daemonRunning = await isDaemonRunning(deps.cxRoot, name);
    if (daemonRunning) daemonsRunning++;
    const meta = await readDaemonMeta(deps.cxRoot, name);

    rows.push({
      name,
      idea: rec.idea,
      phases: {
        requirements: rec.spec.state.phases.requirements,
        design: rec.spec.state.phases.design,
        tasks: rec.spec.state.phases.tasks,
      },
      deployments: deployed,
      proposalsOpen: pOpen,
      proposalsClaimed: pClaimed,
      tasksOpen: ts.open,
      tasksDone: ts.done,
      daemonRunning,
      daemonLastTickAt: meta?.lastTickAt,
      updatedAt: rec.updatedAt,
    });
  }

  return {
    rows,
    totals: {
      specs: rows.length,
      proposalsOpen,
      tasksOpen,
      daemonsRunning,
      deployedSpecs,
    },
    path,
  };
}
