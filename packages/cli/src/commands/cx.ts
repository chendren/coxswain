/**
 * `cox cx …` — CXOS graph-node commands (deterministic ops + ontology).
 * Pure surfaces use @cox/cx-ops; no adapter packages imported here.
 */
import { DEFAULT_ONTOLOGY, LOCAL_PLATFORM_ONTOLOGY } from "@cox/cx-core";
import {
  opsRecommendNba,
  parseNbaContext,
  showOntology,
  showStrongGraph,
  validateOntologyPack,
  type OntologyPack,
} from "@cox/cx-ops";

export interface CxWrite {
  write: (line: string) => void;
}

function parsePack(raw: string | undefined): OntologyPack {
  if (!raw || raw === "default") return "default";
  if (raw === "local") return "local";
  throw new Error(`unknown ontology pack "${raw}" (use default|local)`);
}

export function runCxOntologyShow(deps: CxWrite, packRaw?: string): void {
  const pack = parsePack(packRaw);
  const show = showOntology(pack);
  deps.write(`CXOS ontology  pack=${show.pack}  version=${show.version}`);
  deps.write(`source: ${show.source}`);
  deps.write(`domains: ${show.domains}  intents: ${show.intents}  nbaRules: ${show.nbaRules}`);
  deps.write(`journeys (${show.journeys.length}): ${show.journeys.join(", ")}`);
  deps.write(`kpis: ${show.kpis.join(", ")}`);
  deps.write(`channels: ${show.channels.join(", ")}`);
  deps.write(`sample intents: ${show.sampleIntents.join(", ")}`);
  deps.write(`path: ${show.path.join(" → ")}`);
}

export function runCxOntologyValidate(deps: CxWrite, packRaw?: string): number {
  const pack = parsePack(packRaw);
  const result = validateOntologyPack(pack);
  deps.write(`CXOS ontology validate  pack=${result.pack}  ok=${result.ok}`);
  deps.write(
    `graph: nodes=${result.graph.nodes} edges=${result.graph.edges} hubs=${result.graph.hubs}`,
  );
  for (const [kind, n] of Object.entries(result.graph.byKind).sort()) {
    deps.write(`  ${kind}: ${n}`);
  }
  if (!result.ok) {
    for (const issue of result.issues) {
      deps.write(`issue  ${issue.path}: ${issue.message}`);
    }
  }
  deps.write(`path: ${result.path.join(" → ")}`);
  return result.ok ? 0 : 1;
}

export function runCxOntologyGraph(deps: CxWrite, packRaw?: string): void {
  const pack = parsePack(packRaw);
  const g = showStrongGraph(pack);
  deps.write(`CXOS strong graph  pack=${g.pack}`);
  deps.write(`nodes=${g.stats.nodes} edges=${g.stats.edges} hubs=${g.stats.hubs}`);
  deps.write("by kind:");
  for (const [kind, n] of Object.entries(g.stats.byKind).sort()) {
    deps.write(`  ${kind}: ${n}`);
  }
  deps.write("edge kinds:");
  for (const [kind, n] of Object.entries(g.edgeKinds).sort()) {
    deps.write(`  ${kind}: ${n}`);
  }
  deps.write(`path: ${g.path.join(" → ")}`);
}

export function runCxNba(deps: CxWrite, pairs: string[], packRaw?: string): number {
  const pack = parsePack(packRaw);
  const context = parseNbaContext(pairs);
  if (Object.keys(context).length === 0) {
    deps.write("usage: cox cx nba journey=… stage=… [confidence=0.9] [field=value …]");
    return 2;
  }

  const ontology = pack === "local" ? LOCAL_PLATFORM_ONTOLOGY : DEFAULT_ONTOLOGY;
  const result = opsRecommendNba(context, ontology);

  deps.write(`CXOS NBA recommend  pack=${pack}`);
  deps.write(`context: ${JSON.stringify(context)}`);
  if (result.primary) {
    deps.write(
      `primary: ${result.primary.id}  action=${result.primary.action}  type=${result.primary.actionType}  urgency=${result.primary.urgency}  priority=${result.primary.priority}`,
    );
  } else {
    deps.write("primary: (none matched)");
  }
  deps.write(`matched rules (${result.rules.length}):`);
  for (const r of result.rules) {
    deps.write(`  [${r.priority}] ${r.id} → ${r.action} (${r.actionType}/${r.urgency})`);
  }
  if (result.confidence) {
    deps.write(
      `confidence band: ${result.confidence.band} (min=${result.confidence.min}) strategy=${result.confidence.strategy}`,
    );
  }
  if (result.nextStages) {
    deps.write(`next stages: ${result.nextStages.join(", ") || "(terminal or unknown)"}`);
  }
  deps.write(`path: ${result.path.join(" → ")}`);
  return 0;
}
