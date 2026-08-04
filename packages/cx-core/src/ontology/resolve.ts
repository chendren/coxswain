import type { CxArtifact, IntentTaxonomy, JourneyMap, KpiFrame } from "../artifacts";
import { hubKey, type CxStrongGraph, type StrongNode, type StrongNodeKind } from "./graph";
import type { CxValidationIssue } from "./types";

/**
 * Phase 3 identity resolution: weak (LLM) labels → strong (catalog) nodes.
 * Strict hub-key match only — no fuzzy tolerance (2026 GraphRAG practice).
 */

export type WeakStrength = "weak" | "resolved" | "rejected";

export interface WeakNode {
  /** Ephemeral id before resolution. */
  uid: string;
  claimedKind: StrongNodeKind | "free_text";
  rawLabel: string;
  hubKey: string;
  strength: WeakStrength;
  /** Filled when strength === "resolved". */
  strongUid?: string;
  props?: Record<string, string | number | boolean | string[]>;
}

export interface ResolveReport {
  weak: WeakNode[];
  resolved: number;
  rejected: number;
  issues: CxValidationIssue[];
}

function weak(
  claimedKind: WeakNode["claimedKind"],
  rawLabel: string,
  props?: WeakNode["props"],
): WeakNode {
  return {
    uid: `weak:${claimedKind}:${rawLabel}`,
    claimedKind,
    rawLabel,
    hubKey: hubKey(rawLabel),
    strength: "weak",
    props,
  };
}

/** Lookup strong node by exact id, then by hub key among that kind. */
export function resolveLabel(
  graph: CxStrongGraph,
  kind: StrongNodeKind,
  rawLabel: string,
): StrongNode | undefined {
  const byId = graph.nodes.get(`${kind}:${rawLabel}`);
  if (byId) return byId;

  // id suffix match for intent:domain.intent style when label is local
  if (kind === "intent") {
    for (const n of graph.nodes.values()) {
      if (n.kind !== "intent") continue;
      if (n.id === rawLabel || n.id.endsWith(`.${rawLabel}`)) return n;
    }
  }

  const key = hubKey(rawLabel);
  const candidates = graph.hubs.get(key) ?? [];
  for (const uid of candidates) {
    const n = graph.nodes.get(uid);
    if (n && n.kind === kind) return n;
  }

  // name equality (case-insensitive) within kind
  const lower = rawLabel.toLowerCase();
  for (const n of graph.nodes.values()) {
    if (n.kind === kind && n.name.toLowerCase() === lower) return n;
  }
  return undefined;
}

function absorb(w: WeakNode, strong: StrongNode | undefined): WeakNode {
  if (!strong) {
    return { ...w, strength: "rejected" };
  }
  return {
    ...w,
    strength: "resolved",
    strongUid: strong.uid,
    hubKey: strong.hubKey,
  };
}

/** Extract weak nodes from a generated artifact and resolve against the strong graph. */
export function resolveArtifactAgainstGraph(
  graph: CxStrongGraph,
  artifact: CxArtifact,
): ResolveReport {
  const weakNodes: WeakNode[] = [];
  const issues: CxValidationIssue[] = [];

  switch (artifact.kind) {
    case "intentTaxonomy":
      collectIntentWeak(artifact, weakNodes);
      break;
    case "kpiFrame":
      collectKpiWeak(artifact, weakNodes);
      break;
    case "journeyMap":
      collectJourneyWeak(artifact, weakNodes);
      break;
    default:
      // free-form artifacts (persona, architectureDoc) stay narrative — no closed-set absorb
      break;
  }

  let resolved = 0;
  let rejected = 0;
  const out: WeakNode[] = [];
  for (const w of weakNodes) {
    if (w.claimedKind === "free_text") {
      out.push(w);
      continue;
    }
    const strong = resolveLabel(graph, w.claimedKind, w.rawLabel);
    const next = absorb(w, strong);
    out.push(next);
    if (next.strength === "resolved") resolved++;
    else {
      rejected++;
      issues.push({
        path: next.uid,
        message: `unresolved weak ${w.claimedKind} label "${w.rawLabel}"`,
      });
    }
  }

  return { weak: out, resolved, rejected, issues };
}

function collectIntentWeak(artifact: IntentTaxonomy, into: WeakNode[]): void {
  for (const domain of artifact.domains) {
    const domainLabel = domain.id ?? domain.name;
    into.push(weak("domain", domainLabel));
    for (const intent of domain.intents) {
      const label =
        typeof intent === "string"
          ? intent
          : intent.id || intent.name || "unknown";
      into.push(weak("intent", label, { domain: domainLabel }));
    }
  }
}

function collectKpiWeak(artifact: KpiFrame, into: WeakNode[]): void {
  for (const m of artifact.metrics) {
    into.push(weak("kpi", m.name, { unit: m.unit, target: m.target }));
  }
}

function collectJourneyWeak(artifact: JourneyMap, into: WeakNode[]): void {
  into.push(weak("journey", artifact.name));
  into.push(weak("journey", artifact.id));
  for (const stage of artifact.stages) {
    into.push(weak("stage", stage.id, { name: stage.name }));
  }
}

/**
 * Rewrite a KPI frame so metric names are strong ids only.
 * Drops unresolved metrics (deterministic absorption).
 */
export function absorbKpiFrame(graph: CxStrongGraph, artifact: KpiFrame): KpiFrame {
  const metrics: KpiFrame["metrics"] = [];
  for (const m of artifact.metrics) {
    const strong = resolveLabel(graph, "kpi", m.name);
    if (strong) {
      metrics.push({
        name: strong.id,
        target: m.target,
        unit: typeof strong.props.unit === "string" ? strong.props.unit : m.unit,
      });
    }
  }
  return { ...artifact, metrics };
}

/**
 * Rewrite intent taxonomy domains/intents to strong ids where resolvable.
 * Unresolved entries are dropped (strong graph wins).
 */
export function absorbIntentTaxonomy(
  graph: CxStrongGraph,
  artifact: IntentTaxonomy,
): IntentTaxonomy {
  const domains: IntentTaxonomy["domains"] = [];
  for (const domain of artifact.domains) {
    const domainLabel = domain.id ?? domain.name;
    const strongDomain = resolveLabel(graph, "domain", domainLabel);
    if (!strongDomain) continue;
    const intents: IntentTaxonomy["domains"][number]["intents"] = [];
    for (const intent of domain.intents) {
      const label =
        typeof intent === "string" ? intent : intent.id || intent.name || "";
      const strongIntent = resolveLabel(graph, "intent", label);
      if (!strongIntent) continue;
      // store local intent id after domain. if full id
      const local = strongIntent.id.includes(".")
        ? strongIntent.id.slice(strongIntent.id.indexOf(".") + 1)
        : strongIntent.id;
      intents.push({
        id: local,
        name: strongIntent.name,
        description:
          typeof strongIntent.props.description === "string"
            ? strongIntent.props.description
            : undefined,
        exemplars: Array.isArray(strongIntent.props.exemplars)
          ? (strongIntent.props.exemplars as string[])
          : undefined,
      });
    }
    if (intents.length > 0) {
      domains.push({
        id: strongDomain.id,
        name: strongDomain.name,
        intents,
      });
    }
  }
  return { ...artifact, domains };
}
