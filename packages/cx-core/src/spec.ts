import type { SpecState } from "@cox/core";
import type { IntentTaxonomy, JourneyMap, NbaRuleSet, Persona } from "./artifacts";

/** CX-EARS acceptance criterion, e.g. "R2.1: WHEN a customer disputes a
 * charge, THE SYSTEM SHALL resolve in <= 1 contact". */
export interface CxRequirement {
  id: string;
  text: string;
}

/** The design-phase output: target-neutral, built by the `artifacts`
 * adapter first and handed to `local`/`aws` as build context. */
export interface CxDesignDoc {
  journeyMaps: JourneyMap[];
  personas: Persona[];
  intentTaxonomy?: IntentTaxonomy;
  nbaRuleSet?: NbaRuleSet;
}

/** A CX spec reuses @cox/core's phase state machine (`SpecState`) as-is —
 * `state` carries requirements/design/tasks/execution status and approval
 * gates exactly like a coding spec. `requirements`/`design` are the parsed,
 * CX-typed views of that same spec's generated markdown. */
export interface CxSpec {
  state: SpecState;
  requirements: CxRequirement[];
  design?: CxDesignDoc;
}
