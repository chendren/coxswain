import type { CxOntology } from "@cox/cx-core";
import {
  DEFAULT_ONTOLOGY,
  LOCAL_PLATFORM_ONTOLOGY,
  buildStrongGraph,
  graphStats,
  listDomainIds,
  listIntentIds,
  listJourneyIds,
  listKpiIds,
  listNbaRuleIds,
  validateOntology,
} from "@cox/cx-core";

export type OntologyPack = "default" | "local";

export function resolveOntologyPack(pack: OntologyPack = "default"): CxOntology {
  return pack === "local" ? LOCAL_PLATFORM_ONTOLOGY : DEFAULT_ONTOLOGY;
}

export interface OntologyShowResult {
  path: string[];
  version: string;
  source: string;
  pack: OntologyPack;
  domains: number;
  intents: number;
  journeys: string[];
  kpis: string[];
  nbaRules: number;
  channels: readonly string[];
  sampleIntents: string[];
}

/** Strong-graph inventory for humans/CLI. Zero model calls. */
export function showOntology(pack: OntologyPack = "default"): OntologyShowResult {
  const path = ["load_strong", "inventory", "emit"];
  const ontology = resolveOntologyPack(pack);
  const intents = listIntentIds(ontology);
  return {
    path,
    version: ontology.version,
    source: ontology.source,
    pack,
    domains: listDomainIds(ontology).length,
    intents: intents.length,
    journeys: listJourneyIds(ontology),
    kpis: listKpiIds(ontology),
    nbaRules: listNbaRuleIds(ontology).length,
    channels: ontology.channels,
    sampleIntents: intents.slice(0, 12),
  };
}

export interface OntologyValidateResult {
  path: string[];
  pack: OntologyPack;
  ok: boolean;
  issues: { path: string; message: string }[];
  graph: ReturnType<typeof graphStats>;
}

/** Catalog integrity + strong graph materialization stats. */
export function validateOntologyPack(pack: OntologyPack = "default"): OntologyValidateResult {
  const path = ["load_strong", "validate_catalog", "materialize_graph", "emit"];
  const ontology = resolveOntologyPack(pack);
  const result = validateOntology(ontology);
  const graph = graphStats(buildStrongGraph(ontology));
  return {
    path,
    pack,
    ok: result.ok,
    issues: result.issues,
    graph,
  };
}

export interface OntologyGraphResult {
  path: string[];
  pack: OntologyPack;
  stats: ReturnType<typeof graphStats>;
  edgeKinds: Record<string, number>;
}

/** Strong graph stats + edge-kind histogram. */
export function showStrongGraph(pack: OntologyPack = "default"): OntologyGraphResult {
  const path = ["load_strong", "materialize_graph", "emit"];
  const ontology = resolveOntologyPack(pack);
  const g = buildStrongGraph(ontology);
  const edgeKinds: Record<string, number> = {};
  for (const e of g.edges) {
    edgeKinds[e.kind] = (edgeKinds[e.kind] ?? 0) + 1;
  }
  return {
    path,
    pack,
    stats: graphStats(g),
    edgeKinds,
  };
}
