import { getIntent, intentId } from "./ids";
import type {
  CxJourneyDef,
  CxNbaContext,
  CxNbaRule,
  CxOntology,
  CxRuleCondition,
} from "./types";

export function getJourney(ontology: CxOntology, journeyId: string): CxJourneyDef | undefined {
  return ontology.journeys.find((j) => j.id === journeyId);
}

export function nextStages(
  ontology: CxOntology,
  journeyId: string,
  stageId: string,
): string[] {
  const journey = getJourney(ontology, journeyId);
  if (!journey) return [];
  const stage = journey.stages.find((s) => s.id === stageId);
  return stage ? [...stage.nextStages] : [];
}

export function isTerminalStage(
  ontology: CxOntology,
  journeyId: string,
  stageId: string,
): boolean {
  const journey = getJourney(ontology, journeyId);
  if (!journey) return false;
  return journey.terminalStages.includes(stageId);
}

export function journeysTriggeredBy(ontology: CxOntology, fullIntentId: string): CxJourneyDef[] {
  return ontology.journeys.filter((j) => j.triggerIntents.includes(fullIntentId));
}

function conditionHolds(cond: CxRuleCondition, ctx: CxNbaContext): boolean {
  const raw = ctx[cond.field];
  if (raw === undefined || raw === null) return false;

  switch (cond.op) {
    case "eq":
      return raw === cond.value || String(raw) === String(cond.value);
    case "neq":
      return !(raw === cond.value || String(raw) === String(cond.value));
    case "in": {
      if (!Array.isArray(cond.value)) return false;
      const asStr = String(raw);
      return cond.value.some((v) => v === raw || String(v) === asStr);
    }
    case "not_in": {
      if (!Array.isArray(cond.value)) return false;
      const asStr = String(raw);
      return !cond.value.some((v) => v === raw || String(v) === asStr);
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = typeof raw === "number" ? raw : Number(raw);
      const right = typeof cond.value === "number" ? cond.value : Number(cond.value);
      if (Number.isNaN(left) || Number.isNaN(right)) return false;
      if (cond.op === "gt") return left > right;
      if (cond.op === "gte") return left >= right;
      if (cond.op === "lt") return left < right;
      return left <= right;
    }
    default:
      return false;
  }
}

function ruleMatches(rule: CxNbaRule, ctx: CxNbaContext): boolean {
  if (rule.conditions.length === 0) return false;
  if (rule.logic === "OR") {
    return rule.conditions.some((c) => conditionHolds(c, ctx));
  }
  return rule.conditions.every((c) => conditionHolds(c, ctx));
}

/**
 * Evaluate executable NBA rules against a flat context.
 * Returns matching rules sorted by priority descending (highest first).
 */
export function matchNbaRules(ontology: CxOntology, ctx: CxNbaContext): CxNbaRule[] {
  return ontology.nbaRules
    .filter((r) => ruleMatches(r, ctx))
    .slice()
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Pick the confidence band with the highest `min` still satisfied by score.
 * Returns the band key, or undefined if no band applies.
 */
export function confidenceBand(
  ontology: CxOntology,
  score: number,
): { band: string; min: number; strategy: string } | undefined {
  const entries = Object.entries(ontology.actionPolicies.confidenceBands)
    .filter(([, v]) => score >= v.min)
    .sort((a, b) => b[1].min - a[1].min);
  const top = entries[0];
  if (!top) return undefined;
  return { band: top[0], min: top[1].min, strategy: top[1].strategy };
}

export function escalationChain(ontology: CxOntology, chainId: string): string[] {
  return ontology.actionPolicies.escalationChains[chainId]
    ? [...ontology.actionPolicies.escalationChains[chainId]]
    : [];
}

/** Human-readable constraint block for model prompts (no model call itself). */
export function ontologyPromptConstraint(ontology: CxOntology): string {
  const domains = ontology.domains
    .map((d) => {
      const intents = d.intents.map((i) => intentId(d.id, i.id)).join(", ");
      return `  ${d.id}: ${intents}`;
    })
    .join("\n");
  const journeys = ontology.journeys.map((j) => j.id).join(", ");
  const kpis = ontology.kpis.map((k) => k.id).join(", ");
  return [
    `Use ONLY these ontology ids (version ${ontology.version}). Do not invent new ones.`,
    "Intent ids (domain.intent):",
    domains,
    `Journey ids: ${journeys}`,
    `KPI metric names: ${kpis}`,
    `Channels: ${ontology.channels.join(", ")}`,
    `Sentiments: ${ontology.sentiments.join(", ")}`,
    `Urgencies: ${ontology.urgencies.join(", ")}`,
  ].join("\n");
}

/** True if a full intent id exists in the ontology. */
export function hasIntent(ontology: CxOntology, fullId: string): boolean {
  return getIntent(ontology, fullId) !== undefined;
}

/** True if a journey id exists. */
export function hasJourney(ontology: CxOntology, journeyId: string): boolean {
  return getJourney(ontology, journeyId) !== undefined;
}

/** True if a KPI id exists. */
export function hasKpi(ontology: CxOntology, kpiId: string): boolean {
  return ontology.kpis.some((k) => k.id === kpiId);
}
