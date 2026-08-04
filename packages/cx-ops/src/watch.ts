/**
 * Console watch loop — bounded graph-node daemon.
 *
 * Path per tick:
 *   sleep → poll_status → recommend_nba → persist_proposals → emit
 *
 * Stops after maxTicks or when aborted. Never mutates adapters.
 */
import type { CxDeployment, CxOntology, CxTargetAdapter, CxTargetId } from "@cox/cx-core";
import { DEFAULT_ONTOLOGY } from "@cox/cx-core";
import { runConsoleTick, type ConsoleProposal } from "./console";
import {
  appendProposalsFromTick,
  type CxProposal,
  type ProposalStoreDeps,
} from "./proposals";

export interface WatchTarget {
  targetId: CxTargetId;
  adapter: CxTargetAdapter;
  dep: CxDeployment;
  nbaContext?: {
    journey?: string;
    stage?: string;
    confidence?: number;
  };
}

export interface WatchLoopDeps extends ProposalStoreDeps {
  ontology?: CxOntology;
  intervalMs?: number;
  maxTicks?: number;
  signal?: AbortSignal;
  onTick?: (info: {
    tick: number;
    proposals: ConsoleProposal[];
    added: CxProposal[];
    path: string[];
  }) => void;
}

export interface WatchLoopResult {
  path: string[];
  ticks: number;
  totalAdded: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Run N console ticks (default 3) at intervalMs (default 5s).
 * Suitable for CLI `cox cx watch` smoke and tests with maxTicks=1.
 */
export async function runWatchLoop(
  specName: string,
  targets: WatchTarget[],
  deps: WatchLoopDeps,
): Promise<WatchLoopResult> {
  const path = ["load_strong", "watch_start"];
  const intervalMs = deps.intervalMs ?? 5_000;
  const maxTicks = deps.maxTicks ?? 3;
  const ontology = deps.ontology ?? DEFAULT_ONTOLOGY;
  let ticks = 0;
  let totalAdded = 0;

  for (let i = 0; i < maxTicks; i++) {
    if (deps.signal?.aborted) {
      path.push("aborted");
      break;
    }
    path.push(`tick:${i + 1}`);
    const tick = await runConsoleTick(
      targets.map((t) => ({
        targetId: t.targetId,
        adapter: t.adapter,
        dep: t.dep,
        nbaContext: t.nbaContext,
      })),
      { ontology, now: deps.now },
    );

    const persisted = await appendProposalsFromTick(deps, specName, tick.proposals);
    totalAdded += persisted.added.length;
    ticks++;
    deps.onTick?.({
      tick: i + 1,
      proposals: tick.proposals,
      added: persisted.added,
      path: [...tick.path, ...persisted.path],
    });

    if (i < maxTicks - 1) {
      path.push("sleep");
      try {
        await sleep(intervalMs, deps.signal);
      } catch {
        path.push("aborted");
        break;
      }
    }
  }

  path.push("watch_stop", "emit");
  return { path, ticks, totalAdded };
}
