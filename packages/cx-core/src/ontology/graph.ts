import { intentId } from "./ids";
import type { CxOntology } from "./types";

/**
 * Strong/weak graph materialization for CXOS.
 *
 * Follows the 2026 Agentic GraphRAG practice (Capozzi & Helbing, arXiv:2605.18770;
 * NODES AI 2026 Agentic GraphRAG):
 *   Phase 1 — strong nodes from verified structured catalogs (ontology)
 *   Phase 2 — weak nodes from LLM / free-text (generated artifacts)
 *   Phase 3 — deterministic identity resolution (hub keys + absorption)
 *
 * Agent control flow is also a graph of nodes (LangGraph-class pattern):
 * steps are nodes, transitions are edges, shared state is threaded through.
 */

export type StrongNodeKind =
  | "domain"
  | "intent"
  | "journey"
  | "stage"
  | "kpi"
  | "nba_rule"
  | "channel"
  | "sentiment"
  | "urgency"
  | "action_type"
  | "confidence_band"
  | "escalation_chain"
  | "lifecycle_stage";

export type GraphEdgeKind =
  | "HAS_INTENT"
  | "TRIGGERS"
  | "HAS_STAGE"
  | "NEXT_STAGE"
  | "TERMINAL"
  | "RULE_ACTION"
  | "IN_BAND"
  | "CHAIN_STEP";

export interface StrongNode {
  /** Canonical id, e.g. intent:billing.payment_issue */
  uid: string;
  kind: StrongNodeKind;
  /** Local id inside its kind (payment_issue, billing_dispute, …) */
  id: string;
  name: string;
  /** Strength: always "strong" for catalog-derived nodes. */
  strength: "strong";
  props: Record<string, string | number | boolean | string[]>;
  /** Alphabetical hub key for identity resolution. */
  hubKey: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
  props?: Record<string, string | number>;
}

export interface CxStrongGraph {
  version: string;
  source: string;
  nodes: Map<string, StrongNode>;
  edges: GraphEdge[];
  /** hubKey → strong node uids (NameHub analog). */
  hubs: Map<string, string[]>;
}

/**
 * Deterministic NameHub-style key (no fuzzy matching).
 * Lowercase, keep alphanumerics as tokens, sort tokens, join.
 * "Doe, John" and "John Doe" → "doejohn".
 */
export function hubKey(raw: string): string {
  const lower = raw.toLowerCase();
  const chars: string[] = [];
  for (const ch of lower) {
    const code = ch.charCodeAt(0);
    const isAlpha = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (isAlpha || isDigit) chars.push(ch);
    else chars.push(" ");
  }
  const tokens = chars
    .join("")
    .split(" ")
    .filter((t) => t.length > 0)
    .sort();
  return tokens.join("");
}

function node(
  kind: StrongNodeKind,
  id: string,
  name: string,
  props: StrongNode["props"] = {},
): StrongNode {
  const uid = `${kind}:${id}`;
  return {
    uid,
    kind,
    id,
    name,
    strength: "strong",
    props,
    hubKey: hubKey(name.length > 0 ? name : id),
  };
}

function add(nodes: Map<string, StrongNode>, n: StrongNode, hubs: Map<string, string[]>): void {
  nodes.set(n.uid, n);
  const list = hubs.get(n.hubKey) ?? [];
  list.push(n.uid);
  hubs.set(n.hubKey, list);
}

/** Phase 1: build the strong graph from a closed ontology catalog. */
export function buildStrongGraph(ontology: CxOntology): CxStrongGraph {
  const nodes = new Map<string, StrongNode>();
  const hubs = new Map<string, string[]>();
  const edges: GraphEdge[] = [];

  for (const domain of ontology.domains) {
    const d = node("domain", domain.id, domain.name);
    add(nodes, d, hubs);
    for (const intent of domain.intents) {
      const full = intentId(domain.id, intent.id);
      const i = node("intent", full, intent.name, {
        domainId: domain.id,
        description: intent.description,
        exemplars: intent.exemplars,
      });
      add(nodes, i, hubs);
      edges.push({ from: d.uid, to: i.uid, kind: "HAS_INTENT" });
    }
  }

  for (const journey of ontology.journeys) {
    const j = node("journey", journey.id, journey.name, {
      terminalStages: journey.terminalStages,
      triggerIntents: journey.triggerIntents,
    });
    add(nodes, j, hubs);
    for (const trigger of journey.triggerIntents) {
      edges.push({ from: `intent:${trigger}`, to: j.uid, kind: "TRIGGERS" });
    }
    for (const stage of journey.stages) {
      const stageId = `${journey.id}.${stage.id}`;
      const s = node("stage", stageId, stage.name, {
        journeyId: journey.id,
        localId: stage.id,
        nextStages: stage.nextStages,
      });
      add(nodes, s, hubs);
      edges.push({ from: j.uid, to: s.uid, kind: "HAS_STAGE" });
      if (journey.terminalStages.includes(stage.id)) {
        edges.push({ from: s.uid, to: s.uid, kind: "TERMINAL" });
      }
      for (const next of stage.nextStages) {
        edges.push({
          from: s.uid,
          to: `stage:${journey.id}.${next}`,
          kind: "NEXT_STAGE",
        });
      }
    }
  }

  for (const kpi of ontology.kpis) {
    add(
      nodes,
      node("kpi", kpi.id, kpi.name, { unit: kpi.unit, description: kpi.description }),
      hubs,
    );
  }

  for (const rule of ontology.nbaRules) {
    const r = node("nba_rule", rule.id, rule.name, {
      priority: rule.priority,
      action: rule.action,
      actionType: rule.actionType,
      urgency: rule.urgency,
      logic: rule.logic,
    });
    add(nodes, r, hubs);
    edges.push({
      from: r.uid,
      to: `action_type:${rule.actionType}`,
      kind: "RULE_ACTION",
      props: { action: rule.action },
    });
  }

  for (const ch of ontology.channels) {
    add(nodes, node("channel", ch, ch), hubs);
  }
  for (const s of ontology.sentiments) {
    add(nodes, node("sentiment", s, s), hubs);
  }
  for (const u of ontology.urgencies) {
    add(nodes, node("urgency", u, u), hubs);
  }
  for (const a of ontology.actionTypes) {
    add(nodes, node("action_type", a, a), hubs);
  }

  for (const [band, def] of Object.entries(ontology.actionPolicies.confidenceBands)) {
    add(
      nodes,
      node("confidence_band", band, band, { min: def.min, strategy: def.strategy }),
      hubs,
    );
  }

  for (const [chainId, steps] of Object.entries(ontology.actionPolicies.escalationChains)) {
    const c = node("escalation_chain", chainId, chainId, { steps });
    add(nodes, c, hubs);
    for (let i = 0; i < steps.length - 1; i++) {
      edges.push({
        from: c.uid,
        to: c.uid,
        kind: "CHAIN_STEP",
        props: { fromStep: steps[i]!, toStep: steps[i + 1]!, order: i },
      });
    }
  }

  for (const [id, stage] of Object.entries(ontology.actionPolicies.customerLifecycleStages)) {
    add(
      nodes,
      node("lifecycle_stage", id, id, {
        maxTenureDays: stage.maxTenureDays ?? -1,
        priorities: stage.priorities,
      }),
      hubs,
    );
  }

  return {
    version: ontology.version,
    source: ontology.source,
    nodes,
    edges,
    hubs,
  };
}

export function getNode(graph: CxStrongGraph, uid: string): StrongNode | undefined {
  return graph.nodes.get(uid);
}

export function neighbors(
  graph: CxStrongGraph,
  fromUid: string,
  kind?: GraphEdgeKind,
): StrongNode[] {
  const out: StrongNode[] = [];
  for (const e of graph.edges) {
    if (e.from !== fromUid) continue;
    if (kind && e.kind !== kind) continue;
    const n = graph.nodes.get(e.to);
    if (n) out.push(n);
  }
  return out;
}

export function listNodesByKind(graph: CxStrongGraph, kind: StrongNodeKind): StrongNode[] {
  return [...graph.nodes.values()].filter((n) => n.kind === kind);
}

export function hasStrongId(graph: CxStrongGraph, kind: StrongNodeKind, id: string): boolean {
  return graph.nodes.has(`${kind}:${id}`);
}

/** Stats for tests / doctor. */
export function graphStats(graph: CxStrongGraph): {
  nodes: number;
  edges: number;
  hubs: number;
  byKind: Record<string, number>;
} {
  const byKind: Record<string, number> = {};
  for (const n of graph.nodes.values()) {
    byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
  }
  return {
    nodes: graph.nodes.size,
    edges: graph.edges.length,
    hubs: graph.hubs.size,
    byKind,
  };
}
