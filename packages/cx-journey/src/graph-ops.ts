import {
  buildStrongGraph,
  shortestPath,
  kHopNeighborhood,
  formatGraphPath,
  routeRetrieval,
  scoreIntents,
  type GraphPath,
  type RetrievalRoute,
  type IntentScore,
} from "@cox/cx-core";
import type { OntologyPack } from "./ontology";
import { resolveOntologyPack } from "./ontology";

export interface MultiHopQueryResult {
  pack: OntologyPack;
  fromUid: string;
  toUid: string;
  path?: GraphPath;
  pathDisplay?: string;
  route: RetrievalRoute;
  controlPath: string[];
}

export function multiHopQuery(
  pack: OntologyPack,
  fromUid: string,
  toUid: string,
  maxHops = 4,
): MultiHopQueryResult {
  const controlPath = ["load_strong", "route_retrieval", "shortest_path", "emit"];
  const ontology = resolveOntologyPack(pack);
  const graph = buildStrongGraph(ontology);
  const route = routeRetrieval(`path between ${fromUid} and ${toUid}`, {
    hasStrongAnchor: true,
    multiHopLanguage: true,
  });
  const path = shortestPath(graph, fromUid, toUid, { maxHops });
  return {
    pack,
    fromUid,
    toUid,
    path,
    pathDisplay: path ? formatGraphPath(path) : undefined,
    route,
    controlPath,
  };
}

export interface NeighborhoodQueryResult {
  pack: OntologyPack;
  startUid: string;
  k: number;
  /** uid → distance */
  distances: Record<string, number>;
  controlPath: string[];
}

export function neighborhoodQuery(
  pack: OntologyPack,
  startUid: string,
  k = 2,
): NeighborhoodQueryResult {
  const controlPath = ["load_strong", "k_hop", "emit"];
  const graph = buildStrongGraph(resolveOntologyPack(pack));
  const dist = kHopNeighborhood(graph, startUid, k);
  const distances: Record<string, number> = {};
  for (const [uid, d] of dist) distances[uid] = d;
  return { pack, startUid, k, distances, controlPath };
}

export interface IntentRouteResult {
  pack: OntologyPack;
  utterance: string;
  top?: IntentScore;
  ranked: IntentScore[];
  controlPath: string[];
}

export function intentRouteQuery(
  pack: OntologyPack,
  utterance: string,
  limit = 5,
): IntentRouteResult {
  const controlPath = ["load_ontology", "score_intents", "emit"];
  const ontology = resolveOntologyPack(pack);
  const ranked = scoreIntents(ontology, utterance, limit);
  return { pack, utterance, top: ranked[0], ranked, controlPath };
}
