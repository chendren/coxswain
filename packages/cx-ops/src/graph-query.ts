/**
 * Strong-graph lookup (closed-world node search). Zero model calls.
 */
import { buildStrongGraph } from "@cox/cx-core";
import type { OntologyPack } from "./ontology";
import { resolveOntologyPack } from "./ontology";

export interface GraphHit {
  id: string;
  uid: string;
  kind: string;
  name: string;
  hubKey: string;
}

export interface GraphQueryResult {
  pack: OntologyPack;
  query: string;
  hits: GraphHit[];
  path: string[];
}

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
    if (
      n.uid.toLowerCase().includes(q) ||
      n.id.toLowerCase().includes(q) ||
      n.name.toLowerCase().includes(q) ||
      n.kind.toLowerCase().includes(q) ||
      n.hubKey.toLowerCase().includes(q)
    ) {
      hits.push({
        id: n.id,
        uid: n.uid,
        kind: n.kind,
        name: n.name,
        hubKey: n.hubKey,
      });
      if (hits.length >= limit) break;
    }
  }
  return { pack, query, hits, path };
}
