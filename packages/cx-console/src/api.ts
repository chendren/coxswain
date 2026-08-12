import {
  applyProposal,
  buildOpsBoard,
  buildWorkQueue,
  loadCxWorkspace,
  loadProposals,
  runGraphAutopilot,
  transitionProposal,
  type CxWorkspaceDeps,
} from "@cox/cx-ops";
import {
  lookupStrongNode,
  multiHopQuery,
  neighborhoodQuery,
  intentRouteQuery,
  resolveOntologyPack,
  type OntologyPack,
} from "@cox/cx-journey";
import { routeRetrieval, buildStrongGraph, graphStats } from "@cox/cx-core";

export function packOf(p?: string): OntologyPack {
  return p === "default" ? "default" : "local";
}

export async function apiFleet(deps: CxWorkspaceDeps) {
  const path = ["load_workspace", "build_board", "emit"];
  const board = await buildOpsBoard(deps);
  return { ok: true, path, data: board, at: deps.now() };
}

export async function apiQueue(deps: CxWorkspaceDeps) {
  const path = ["load_workspace", "build_queue", "emit"];
  const queue = await buildWorkQueue(deps);
  return { ok: true, path, data: queue, at: deps.now() };
}

export function apiGraphFind(pack: OntologyPack, query: string) {
  const result = lookupStrongNode(pack, query);
  return {
    ok: true,
    path: ["route_retrieval", ...result.path],
    data: { route: routeRetrieval(query), result },
    at: new Date().toISOString(),
  };
}

export function apiGraphPath(pack: OntologyPack, fromUid: string, toUid: string, maxHops = 4) {
  const r = multiHopQuery(pack, fromUid, toUid, maxHops);
  return { ok: true, path: r.controlPath, data: r, at: new Date().toISOString() };
}

export function apiNeighborhood(pack: OntologyPack, startUid: string, k = 2) {
  const r = neighborhoodQuery(pack, startUid, k);
  return { ok: true, path: r.controlPath, data: r, at: new Date().toISOString() };
}

export function apiIntent(pack: OntologyPack, utterance: string) {
  const r = intentRouteQuery(pack, utterance, 10);
  const route = routeRetrieval(utterance);
  return {
    ok: true,
    path: r.controlPath,
    data: { ...r, route },
    at: new Date().toISOString(),
  };
}

export function apiGraphStats(pack: OntologyPack) {
  const path = ["load_ontology", "build_strong", "stats", "emit"];
  const g = buildStrongGraph(resolveOntologyPack(pack));
  return { ok: true, path, data: graphStats(g), at: new Date().toISOString() };
}

export function apiHealth() {
  return { ok: true, path: ["healthz"], data: { status: "ok" }, at: new Date().toISOString() };
}

export async function apiAutopilot(
  deps: CxWorkspaceDeps,
  opts: {
    specName: string;
    utterance?: string;
    apply?: boolean;
    actor?: string;
    pack?: OntologyPack;
  },
) {
  const pack = packOf(opts.pack);
  const ontology = resolveOntologyPack(pack);
  const rec = await loadCxWorkspace(deps, opts.specName);
  if (!rec) {
    return {
      ok: false,
      path: ["load_workspace", "fail"],
      error: `spec not found: ${opts.specName}`,
      at: deps.now(),
    };
  }
  const result = await runGraphAutopilot(deps, opts.specName, {
    utterance: opts.utterance,
    apply: opts.apply === true,
    actor: opts.actor,
    ontology,
    spec: rec.spec,
  });
  return {
    ok: result.route.mode !== "refuse",
    path: result.path,
    data: result,
    at: deps.now(),
  };
}

export type ProposalAction = "claim" | "dismiss";

/**
 * Human-gated queue action. Claim = applyProposal (task + claimed).
 * Dismiss = transitionProposal dismissed. Never mutates AWS/adapters.
 */
export async function apiProposalAction(
  deps: CxWorkspaceDeps,
  opts: {
    specName: string;
    id: string;
    action: ProposalAction;
    actor?: string;
  },
) {
  const pathBase = ["load_proposals", "human_gate", opts.action, "emit"];
  const actor =
    opts.actor?.trim() ||
    process.env.CX_ACTOR?.trim() ||
    "console-local";
  const specName = opts.specName.trim();
  const id = opts.id.trim();
  if (!specName || !id) {
    return {
      ok: false,
      path: ["human_gate", "fail"],
      error: "missing spec or id",
      at: deps.now(),
    };
  }
  const all = await loadProposals(deps, specName);
  const prop = all.find((p) => p.id === id);
  if (!prop) {
    return {
      ok: false,
      path: pathBase,
      error: `proposal not found: ${id}`,
      at: deps.now(),
    };
  }
  try {
    if (opts.action === "claim") {
      const applied = await applyProposal(deps, specName, prop, { actor });
      return {
        ok: true,
        path: [...pathBase, ...applied.path],
        data: {
          action: "claim" as const,
          proposalId: id,
          specName,
          taskId: applied.task.id,
          status: "claimed",
          remediationPath: applied.remediationPath,
          actor,
        },
        at: deps.now(),
      };
    }
    if (opts.action === "dismiss") {
      const next = await transitionProposal(deps, specName, id, "dismissed", {
        actor,
      });
      return {
        ok: true,
        path: pathBase,
        data: {
          action: "dismiss" as const,
          proposalId: id,
          specName,
          status: next?.status ?? "dismissed",
          actor,
        },
        at: deps.now(),
      };
    }
    return {
      ok: false,
      path: ["human_gate", "fail"],
      error: `unknown action: ${String(opts.action)}`,
      at: deps.now(),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      path: ["human_gate", "fail"],
      error: msg,
      at: deps.now(),
    };
  }
}
