/**
 * Strong-graph lookup (closed-world node search). Zero model calls.
 */
import { buildStrongGraph } from "@cox/cx-core";
import type { OntologyPack } from "./ontology";
import { resolveOntologyPack } from "./ontology";

export interface GraphHit {
  id: string;
  kind: string;
  name: string;
  /** Full strong-node uid (kind:id); kept for CLI/display consumers. */
  uid: string;
  hubKey: string;
}

export interface GraphQueryResult {
  pack: OntologyPack;
  query: string;
  hits: GraphHit[];
  path: string[];
}

/**
 * Search the strong graph for nodes whose id or name contains query
 * (case-insensitive). Returns up to 20 matches with {id, kind, name}.
 */
export function lookupStrongNode(
  pack: OntologyPack,
  query: string,
  limit = 20,
): GraphQueryResult {
  const path = ["load_strong", "materialize_graph", "search", "emit"];
  const q = query.trim().toLowerCase();
  const ontology = resolveOntologyPack(pack);
  const g = buildStrongGraph(ontology);
  if (!q) {
    return { pack, query, hits: [], path };
  }
  const hits: GraphHit[] = [];
  for (const n of g.nodes.values()) {
    if (n.id.toLowerCase().includes(q) || n.name.toLowerCase().includes(q)) {
      hits.push({
        id: n.id,
        kind: n.kind,
        name: n.name,
        uid: n.uid,
        hubKey: n.hubKey,
      });
      if (hits.length >= limit) break;
    }
  }
  return { pack, query, hits, path };
}
