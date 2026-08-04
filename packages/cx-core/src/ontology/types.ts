import type { CxArtifact } from "../artifacts";
import type { CxCapability, CxOpsMode, CxTargetId } from "../target";
import type {
  CxActionTypeId,
  CxChannelId,
  CxKpiUnit,
  CxRuleLogic,
  CxRuleOp,
  CxSentimentId,
  CxUrgencyId,
} from "./enums";

// ── Intent taxonomy ─────────────────────────────────────────

export interface CxIntentDef {
  id: string;
  name: string;
  description: string;
  exemplars: string[];
}

export interface CxDomain {
  id: string;
  name: string;
  intents: CxIntentDef[];
}

// ── Journey taxonomy ────────────────────────────────────────

export interface CxJourneyStageDef {
  id: string;
  name: string;
  nextStages: string[];
}

export interface CxJourneyDef {
  id: string;
  name: string;
  /** Full intent ids (`domain.intent`) that can open this journey. */
  triggerIntents: string[];
  stages: CxJourneyStageDef[];
  terminalStages: string[];
}

// ── NBA taxonomy ────────────────────────────────────────────

export interface CxRuleCondition {
  field: string;
  op: CxRuleOp;
  value: string | number | string[];
}

export interface CxNbaRule {
  id: string;
  name: string;
  priority: number;
  conditions: CxRuleCondition[];
  logic: CxRuleLogic;
  action: string;
  actionType: CxActionTypeId | string;
  urgency: CxUrgencyId;
}

// ── Policy taxonomy ─────────────────────────────────────────

export interface CxConfidenceBand {
  min: number;
  strategy: string;
}

export interface CxActionSequenceTemplate {
  steps: string[];
  applicableWhen: string;
}

export interface CxLifecycleStage {
  maxTenureDays: number | null;
  priorities: string[];
}

export interface CxActionPolicies {
  confidenceBands: Record<string, CxConfidenceBand>;
  escalationChains: Record<string, string[]>;
  actionSequenceTemplates: Record<string, CxActionSequenceTemplate>;
  resolutionFactors: { weights: Record<string, number> };
  customerLifecycleStages: Record<string, CxLifecycleStage>;
}

// ── KPI taxonomy ────────────────────────────────────────────

export interface CxKpiDef {
  id: string;
  name: string;
  unit: CxKpiUnit | string;
  description: string;
}

// ── Aggregate ontology ──────────────────────────────────────

/** Wire format for catalog JSON files (default.json, packs). */
export interface CxOntologyCatalog {
  version: string;
  source: string;
  domains: CxDomain[];
  journeys: CxJourneyDef[];
  nbaRules: CxNbaRule[];
  actionPolicies: CxActionPolicies;
  kpis: CxKpiDef[];
  channels: CxChannelId[] | string[];
  sentiments?: CxSentimentId[] | string[];
  urgencies?: CxUrgencyId[] | string[];
  actionTypes?: CxActionTypeId[] | string[];
}

/**
 * Closed-world CXOS ontology: taxonomies + control-plane enums.
 * Model calls may select/map/narrate inside this world; engines decide
 * deterministically using pure evaluators over it.
 */
export interface CxOntology {
  version: string;
  source: string;
  domains: CxDomain[];
  journeys: CxJourneyDef[];
  nbaRules: CxNbaRule[];
  actionPolicies: CxActionPolicies;
  kpis: CxKpiDef[];
  channels: readonly string[];
  sentiments: readonly string[];
  urgencies: readonly string[];
  actionTypes: readonly string[];
  targets: readonly CxTargetId[];
  capabilities: readonly CxCapability[];
  opsModes: readonly CxOpsMode[];
  artifactKinds: readonly CxArtifact["kind"][];
}

/** Runtime context for NBA rule evaluation (all fields optional). */
export type CxNbaContext = Record<string, string | number | boolean | undefined | null>;

export interface CxValidationIssue {
  path: string;
  message: string;
}

export interface CxValidationResult {
  ok: boolean;
  issues: CxValidationIssue[];
}
