import type { CxTargetId } from "./target";

/** Where an artifact came from — which spec, phase, target, and (if any)
 * the ledger entry that paid for the model call that produced it. */
export interface CxArtifactProvenance {
  specName: string;
  phase: "requirements" | "design" | "tasks" | "execution";
  targetId: CxTargetId;
  ledgerEntryTs?: string;
}

interface CxArtifactBase {
  id: string;
  provenance: CxArtifactProvenance;
}

export interface JourneyMap extends CxArtifactBase {
  kind: "journeyMap";
  name: string;
  stages: { id: string; name: string; description: string; touchpoints: string[] }[];
}

export interface Persona extends CxArtifactBase {
  kind: "persona";
  name: string;
  goals: string[];
  painPoints: string[];
}

export interface AgentDefinition extends CxArtifactBase {
  kind: "agentDefinition";
  name: string;
  systemPrompt: string;
  tools: string[];
}

/** Single intent entry on a generated taxonomy artifact.
 * Legacy adapters emit plain strings; rich form uses ontology ids. */
export type IntentTaxonomyIntentEntry =
  | string
  | { id: string; name?: string; description?: string; exemplars?: string[] };

/** Domain entry on a generated taxonomy artifact.
 * Prefer `id` matching ontology domain ids when available. */
export interface IntentTaxonomyDomain {
  /** Ontology domain id when known (preferred). */
  id?: string;
  name: string;
  intents: IntentTaxonomyIntentEntry[];
}

export interface IntentTaxonomy extends CxArtifactBase {
  kind: "intentTaxonomy";
  domains: IntentTaxonomyDomain[];
}

export interface NbaRuleSet extends CxArtifactBase {
  kind: "nbaRuleSet";
  rules: { id: string; condition: string; action: string; priority: number }[];
}

export interface KpiFrame extends CxArtifactBase {
  kind: "kpiFrame";
  metrics: { name: string; target: number; unit: string }[];
}

export interface CxArchitectureDoc extends CxArtifactBase {
  kind: "architectureDoc";
  title: string;
  markdown: string;
}

export type CxArtifact =
  | JourneyMap
  | Persona
  | AgentDefinition
  | IntentTaxonomy
  | NbaRuleSet
  | KpiFrame
  | CxArchitectureDoc;

/** Closed set of artifact kinds — also folded into CxOntology.artifactKinds. */
export const CX_ARTIFACT_KINDS = [
  "journeyMap",
  "persona",
  "agentDefinition",
  "intentTaxonomy",
  "nbaRuleSet",
  "kpiFrame",
  "architectureDoc",
] as const satisfies readonly CxArtifact["kind"][];
