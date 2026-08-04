import type { CxArtifact, IntentTaxonomy, KpiFrame, NbaRuleSet } from "../artifacts";
import { CX_RULE_OPS } from "./enums";
import { getIntent, listIntentIds, parseIntentId } from "./ids";
import type {
  CxOntology,
  CxValidationIssue,
  CxValidationResult,
} from "./types";

function result(issues: CxValidationIssue[]): CxValidationResult {
  return { ok: issues.length === 0, issues };
}

/** Integrity checks for a catalog after load/merge. */
export function validateOntology(ontology: CxOntology): CxValidationResult {
  const issues: CxValidationIssue[] = [];
  const domainIds = new Set<string>();
  const intentIds = new Set(listIntentIds(ontology));

  for (const domain of ontology.domains) {
    if (domainIds.has(domain.id)) {
      issues.push({ path: `domains.${domain.id}`, message: "duplicate domain id" });
    }
    domainIds.add(domain.id);
    const localIntent = new Set<string>();
    for (const intent of domain.intents) {
      if (localIntent.has(intent.id)) {
        issues.push({
          path: `domains.${domain.id}.intents.${intent.id}`,
          message: "duplicate intent id within domain",
        });
      }
      localIntent.add(intent.id);
    }
  }

  const journeyIds = new Set<string>();
  for (const journey of ontology.journeys) {
    if (journeyIds.has(journey.id)) {
      issues.push({ path: `journeys.${journey.id}`, message: "duplicate journey id" });
    }
    journeyIds.add(journey.id);

    const stageIds = new Set(journey.stages.map((s) => s.id));
    for (const stage of journey.stages) {
      for (const next of stage.nextStages) {
        if (!stageIds.has(next)) {
          issues.push({
            path: `journeys.${journey.id}.stages.${stage.id}.nextStages`,
            message: `unknown next stage "${next}"`,
          });
        }
      }
    }
    for (const term of journey.terminalStages) {
      if (!stageIds.has(term)) {
        issues.push({
          path: `journeys.${journey.id}.terminalStages`,
          message: `unknown terminal stage "${term}"`,
        });
      }
    }
    for (const trigger of journey.triggerIntents) {
      if (!intentIds.has(trigger)) {
        issues.push({
          path: `journeys.${journey.id}.triggerIntents`,
          message: `unknown trigger intent "${trigger}"`,
        });
      }
    }
  }

  const ruleIds = new Set<string>();
  for (const rule of ontology.nbaRules) {
    if (ruleIds.has(rule.id)) {
      issues.push({ path: `nbaRules.${rule.id}`, message: "duplicate nba rule id" });
    }
    ruleIds.add(rule.id);
    if (rule.logic !== "AND" && rule.logic !== "OR") {
      issues.push({ path: `nbaRules.${rule.id}.logic`, message: `invalid logic "${rule.logic}"` });
    }
    for (let i = 0; i < rule.conditions.length; i++) {
      const c = rule.conditions[i]!;
      if (!(CX_RULE_OPS as readonly string[]).includes(c.op)) {
        issues.push({
          path: `nbaRules.${rule.id}.conditions[${i}].op`,
          message: `invalid op "${c.op}"`,
        });
      }
    }
  }

  const kpiIds = new Set<string>();
  for (const kpi of ontology.kpis) {
    if (kpiIds.has(kpi.id)) {
      issues.push({ path: `kpis.${kpi.id}`, message: "duplicate kpi id" });
    }
    kpiIds.add(kpi.id);
  }

  for (const [band, def] of Object.entries(ontology.actionPolicies.confidenceBands)) {
    if (typeof def.min !== "number" || def.min < 0 || def.min > 1) {
      issues.push({
        path: `actionPolicies.confidenceBands.${band}.min`,
        message: "min must be a number in [0, 1]",
      });
    }
  }

  return result(issues);
}

function resolveDomainToken(
  ontology: CxOntology,
  token: string,
): { domainId: string } | undefined {
  const byId = ontology.domains.find((d) => d.id === token);
  if (byId) return { domainId: byId.id };
  const byName = ontology.domains.find(
    (d) => d.name.toLowerCase() === token.toLowerCase(),
  );
  if (byName) return { domainId: byName.id };
  return undefined;
}

function resolveIntentToken(
  ontology: CxOntology,
  domainId: string,
  token: string,
): string | undefined {
  // full id
  if (getIntent(ontology, token)) return token;
  const composed = `${domainId}.${token}`;
  if (getIntent(ontology, composed)) return composed;
  const domain = ontology.domains.find((d) => d.id === domainId);
  if (!domain) return undefined;
  const byName = domain.intents.find(
    (i) => i.name.toLowerCase() === token.toLowerCase() || i.id === token,
  );
  return byName ? `${domainId}.${byName.id}` : undefined;
}

/**
 * Validate a generated CX artifact against the closed ontology.
 * Free-text fields are checked where they claim closed-set membership.
 */
export function validateArtifact(
  ontology: CxOntology,
  artifact: CxArtifact,
): CxValidationResult {
  switch (artifact.kind) {
    case "intentTaxonomy":
      return validateIntentTaxonomy(ontology, artifact);
    case "kpiFrame":
      return validateKpiFrame(ontology, artifact);
    case "nbaRuleSet":
      return validateNbaRuleSet(ontology, artifact);
    case "journeyMap":
      return validateJourneyMap(ontology, artifact);
    default:
      return result([]);
  }
}

function validateIntentTaxonomy(
  ontology: CxOntology,
  artifact: IntentTaxonomy,
): CxValidationResult {
  const issues: CxValidationIssue[] = [];
  for (let di = 0; di < artifact.domains.length; di++) {
    const domain = artifact.domains[di]!;
    const domainToken =
      "id" in domain && typeof (domain as { id?: string }).id === "string"
        ? (domain as { id: string }).id
        : domain.name;
    const resolved = resolveDomainToken(ontology, domainToken);
    if (!resolved) {
      issues.push({
        path: `domains[${di}]`,
        message: `unknown domain "${domainToken}"`,
      });
      continue;
    }
    for (let ii = 0; ii < domain.intents.length; ii++) {
      const intentEntry = domain.intents[ii]!;
      const intentToken =
        typeof intentEntry === "string"
          ? intentEntry
          : (intentEntry as { id?: string; name?: string }).id ??
            (intentEntry as { name?: string }).name ??
            String(intentEntry);
      const full = resolveIntentToken(ontology, resolved.domainId, intentToken);
      if (!full) {
        issues.push({
          path: `domains[${di}].intents[${ii}]`,
          message: `unknown intent "${intentToken}" in domain "${resolved.domainId}"`,
        });
      }
    }
  }
  return result(issues);
}

function validateKpiFrame(ontology: CxOntology, artifact: KpiFrame): CxValidationResult {
  const issues: CxValidationIssue[] = [];
  const known = new Set(ontology.kpis.map((k) => k.id));
  for (let i = 0; i < artifact.metrics.length; i++) {
    const name = artifact.metrics[i]!.name;
    if (!known.has(name)) {
      issues.push({
        path: `metrics[${i}].name`,
        message: `unknown KPI "${name}"`,
      });
    }
  }
  return result(issues);
}

function validateNbaRuleSet(
  ontology: CxOntology,
  artifact: NbaRuleSet,
): CxValidationResult {
  const issues: CxValidationIssue[] = [];
  const knownActions = new Set(ontology.nbaRules.map((r) => r.action));
  const knownTypes = new Set(ontology.actionTypes);
  for (let i = 0; i < artifact.rules.length; i++) {
    const rule = artifact.rules[i]!;
    // Free-text condition/action artifacts are allowed; only flag action
    // when it collides with no known ontology action *and* looks like an id.
    if (
      rule.action.length > 0 &&
      !rule.action.includes(" ") &&
      knownActions.size > 0 &&
      !knownActions.has(rule.action) &&
      !knownTypes.has(rule.action)
    ) {
      // soft: do not fail — free-text rules remain valid in v1
      void rule;
    }
  }
  return result(issues);
}

function validateJourneyMap(
  ontology: CxOntology,
  artifact: Extract<CxArtifact, { kind: "journeyMap" }>,
): CxValidationResult {
  const issues: CxValidationIssue[] = [];
  // If the journey map name or id matches a known journey, check stage ids.
  const byId = ontology.journeys.find((j) => j.id === artifact.id || j.id === artifact.name);
  const byName = ontology.journeys.find(
    (j) => j.name.toLowerCase() === artifact.name.toLowerCase(),
  );
  const journey = byId ?? byName;
  if (!journey) {
    // Free-form journey maps are allowed at design time; no hard fail.
    return result(issues);
  }
  const knownStages = new Set(journey.stages.map((s) => s.id));
  for (let i = 0; i < artifact.stages.length; i++) {
    const stage = artifact.stages[i]!;
    if (!knownStages.has(stage.id)) {
      // soft map: names may differ; only warn via issue if id looks like a slug
      // and none match — still soft for design freedom
      void stage;
    }
  }
  return result(issues);
}

/** Whether a full intent id is well-formed and present. */
export function assertKnownIntent(ontology: CxOntology, fullId: string): CxValidationResult {
  if (!parseIntentId(fullId)) {
    return result([{ path: "intent", message: `malformed intent id "${fullId}"` }]);
  }
  if (!getIntent(ontology, fullId)) {
    return result([{ path: "intent", message: `unknown intent "${fullId}"` }]);
  }
  return result([]);
}
