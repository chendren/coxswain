import {
  buildOpsBoard,
  buildWorkQueue,
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
