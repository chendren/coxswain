import {
  buildStrongGraph,
  resolveLabel,
  type CxOntology,
  type CxStrongGraph,
  type StrongNode,
  type StrongNodeKind,
} from "@cox/cx-core";

const KINDS: StrongNodeKind[] = [
  "journey",
  "intent",
  "domain",
  "kpi",
  "nba_rule",
];

export interface PhraseHit {
  phrase: string;
  node: StrongNode;
  how: "resolve" | "token";
}

const TOO_GENERIC = new Set([
  "support",
  "service",
  "order",
  "issue",
  "account",
  "health",
  "system",
  "customer",
]);

function tokenHit(graph: CxStrongGraph, phrase: string): StrongNode | undefined {
  const p = phrase.toLowerCase().trim();
  if (p.length < 5 || TOO_GENERIC.has(p)) return undefined;
  const ranked: StrongNode[] = [];
  for (const n of graph.nodes.values()) {
    if (!KINDS.includes(n.kind)) continue;
    const id = n.id.toLowerCase();
    const name = n.name.toLowerCase();
    const idParts = id.split(/[._:-]/);
    const nameParts = name.split(/[^a-z0-9]+/).filter(Boolean);
    // Exact token in id/name only (no loose substring: "support" must not hit connectivity)
    if (idParts.includes(p) || nameParts.includes(p)) {
      ranked.push(n);
    }
  }
  const order: Record<string, number> = {
    journey: 0,
    intent: 1,
    domain: 2,
    kpi: 3,
    nba_rule: 4,
  };
  ranked.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  return ranked[0];
}

export function matchPhrase(graph: CxStrongGraph, phrase: string): PhraseHit | undefined {
  for (const kind of KINDS) {
    const n = resolveLabel(graph, kind, phrase);
    if (n) return { phrase, node: n, how: "resolve" };
  }
  const tok = tokenHit(graph, phrase);
  if (tok) return { phrase, node: tok, how: "token" };
  return undefined;
}

export function graphOf(ontology: CxOntology): CxStrongGraph {
  return buildStrongGraph(ontology);
}
