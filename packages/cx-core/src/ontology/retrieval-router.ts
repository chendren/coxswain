// ── Failure-aware retrieval router (2026 Agentic GraphRAG) ───────────────────

export type RetrievalMode =
  | "closed_set_lookup" // exact id / hub / name search
  | "graph_multihop" // need edges / neighborhood / path
  | "soft_narrative" // design prose, non-binding
  | "refuse"; // would invent ids without catalog

export interface RetrievalSignals {
  /** Query mentions a known strong uid or kind:id */
  hasStrongAnchor?: boolean;
  /** User asks who/what related / path / multi-hop language */
  multiHopLanguage?: boolean;
  /** User wants invent / free-form domain ids outside catalog */
  inventRequest?: boolean;
  /** Query is empty/whitespace */
  empty?: boolean;
  /** Closed catalog available (always true in CXOS when ontology loaded) */
  closedWorldAvailable?: boolean;
}

export interface RetrievalRoute {
  mode: RetrievalMode;
  /** Human reason for audit / dashboard */
  reason: string;
  /** Ordered tool ids the agent may call */
  tools: string[];
  /** Risk 0-100: higher = more hallucination risk if mode ignored */
  risk: number;
  path: string[]; // control-flow nodes for audit
}

const MULTI_HOP_RE =
  /\b(path|related|neighbor|multi[- ]?hop|connected|between|from .+ to|journey stage|escalat|who owns|linked)\b/i;
const INVENT_RE =
  /\b(invent|make up|create new (intent|kpi|domain)|any id you want|hallucin)\b/i;
const ANCHOR_RE = /\b(domain|intent|journey|kpi|nba_rule|stage):[a-z0-9_.-]+\b/i;

export function inferSignals(query: string, extra?: Partial<RetrievalSignals>): RetrievalSignals {
  const q = query ?? "";
  return {
    empty: q.trim().length === 0,
    hasStrongAnchor: ANCHOR_RE.test(q) || extra?.hasStrongAnchor === true,
    multiHopLanguage: MULTI_HOP_RE.test(q) || extra?.multiHopLanguage === true,
    inventRequest: INVENT_RE.test(q) || extra?.inventRequest === true,
    closedWorldAvailable: extra?.closedWorldAvailable !== false,
  };
}

export function routeRetrieval(
  query: string,
  signals?: Partial<RetrievalSignals>,
): RetrievalRoute {
  const path = ["classify_query", "score_risk", "select_mode", "emit"];
  const s = { ...inferSignals(query, signals), ...signals };

  if (s.empty) {
    return {
      mode: "refuse",
      reason: "empty query",
      tools: [],
      risk: 0,
      path,
    };
  }

  if (s.inventRequest && s.closedWorldAvailable !== false) {
    return {
      mode: "refuse",
      reason: "closed world forbids inventing catalog ids",
      tools: ["list_strong_kinds", "lookup_strong_node"],
      risk: 95,
      path,
    };
  }

  if (s.multiHopLanguage || (s.hasStrongAnchor && s.multiHopLanguage !== false && MULTI_HOP_RE.test(query))) {
    // prefer graph when multi-hop language present
  }

  if (s.multiHopLanguage) {
    return {
      mode: "graph_multihop",
      reason: "multi-hop / relation language detected",
      tools: ["shortest_path", "k_hop_neighborhood", "lookup_strong_node"],
      risk: 25,
      path,
    };
  }

  if (s.hasStrongAnchor || ANCHOR_RE.test(query)) {
    return {
      mode: "closed_set_lookup",
      reason: "strong anchor or closed-set lookup",
      tools: ["lookup_strong_node", "resolve_label"],
      risk: 15,
      path,
    };
  }

  // default: closed-set search first (hard preference)
  if (s.closedWorldAvailable !== false) {
    return {
      mode: "closed_set_lookup",
      reason: "default closed-world search before soft narrative",
      tools: ["lookup_strong_node", "graph_stats"],
      risk: 35,
      path,
    };
  }

  return {
    mode: "soft_narrative",
    reason: "no closed world available; soft only",
    tools: ["generate_soft"],
    risk: 70,
    path,
  };
}
