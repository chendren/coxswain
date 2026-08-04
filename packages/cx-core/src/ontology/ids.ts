import type { CxDomain, CxIntentDef, CxOntology } from "./types";

/** Compose a full intent id: `domain.intent`. */
export function intentId(domainId: string, intentLocalId: string): string {
  return `${domainId}.${intentLocalId}`;
}

export interface ParsedIntentId {
  domainId: string;
  intentId: string;
}

/** Split `domain.intent`. Returns null if the string has no single-dot form. */
export function parseIntentId(fullId: string): ParsedIntentId | null {
  const dot = fullId.indexOf(".");
  if (dot <= 0 || dot !== fullId.lastIndexOf(".") || dot === fullId.length - 1) {
    return null;
  }
  return {
    domainId: fullId.slice(0, dot),
    intentId: fullId.slice(dot + 1),
  };
}

export function getDomain(ontology: CxOntology, domainId: string): CxDomain | undefined {
  return ontology.domains.find((d) => d.id === domainId);
}

export function getIntent(
  ontology: CxOntology,
  fullId: string,
): { domain: CxDomain; intent: CxIntentDef } | undefined {
  const parsed = parseIntentId(fullId);
  if (!parsed) return undefined;
  const domain = getDomain(ontology, parsed.domainId);
  if (!domain) return undefined;
  const intent = domain.intents.find((i) => i.id === parsed.intentId);
  if (!intent) return undefined;
  return { domain, intent };
}

export function listIntentIds(ontology: CxOntology): string[] {
  const ids: string[] = [];
  for (const domain of ontology.domains) {
    for (const intent of domain.intents) {
      ids.push(intentId(domain.id, intent.id));
    }
  }
  return ids;
}

export function listDomainIds(ontology: CxOntology): string[] {
  return ontology.domains.map((d) => d.id);
}

export function listJourneyIds(ontology: CxOntology): string[] {
  return ontology.journeys.map((j) => j.id);
}

export function listKpiIds(ontology: CxOntology): string[] {
  return ontology.kpis.map((k) => k.id);
}

export function listNbaRuleIds(ontology: CxOntology): string[] {
  return ontology.nbaRules.map((r) => r.id);
}
