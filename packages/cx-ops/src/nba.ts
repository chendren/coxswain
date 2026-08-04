import type { CxNbaContext, CxNbaRule, CxOntology } from "@cox/cx-core";
import {
  DEFAULT_ONTOLOGY,
  confidenceBand,
  nextStages,
  recommendNba,
} from "@cox/cx-core";

export interface NbaRecommendResult {
  path: string[];
  primary?: CxNbaRule;
  rules: CxNbaRule[];
  confidence?: { band: string; min: number; strategy: string };
  nextStages?: string[];
}

/**
 * Pure graph-node NBA recommendation.
 * Path: load_strong → match_rules → optional_stage_neighbors → emit
 * Zero model calls.
 */
export function opsRecommendNba(
  context: CxNbaContext,
  ontology: CxOntology = DEFAULT_ONTOLOGY,
): NbaRecommendResult {
  const path = ["load_strong", "match_rules"];
  const { rules, primary } = recommendNba(ontology, context);

  let band: NbaRecommendResult["confidence"];
  const confRaw = context.confidence;
  if (typeof confRaw === "number") {
    path.push("confidence_band");
    band = confidenceBand(ontology, confRaw);
  }

  let stages: string[] | undefined;
  const journey = context.journey;
  const stage = context.stage;
  if (typeof journey === "string" && typeof stage === "string") {
    path.push("next_stages");
    stages = nextStages(ontology, journey, stage);
  }

  path.push("emit");
  return {
    path,
    primary,
    rules,
    confidence: band,
    nextStages: stages,
  };
}

/**
 * Parse CLI-style key=value pairs into CxNbaContext.
 * Numbers are coerced when the whole value parses as a finite number.
 */
export function parseNbaContext(pairs: string[]): CxNbaContext {
  const ctx: CxNbaContext = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const key = pair.slice(0, eq);
    const raw = pair.slice(eq + 1);
    const asNum = Number(raw);
    if (raw !== "" && Number.isFinite(asNum) && String(asNum) === raw) {
      ctx[key] = asNum;
    } else {
      ctx[key] = raw;
    }
  }
  return ctx;
}
