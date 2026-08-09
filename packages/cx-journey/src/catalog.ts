/**
 * Closed-world catalog browsers (domains, intents, KPIs, NBA, channels).
 * Strong nodes only — zero model calls.
 */
import type { OntologyPack } from "./ontology";
import { resolveOntologyPack } from "./ontology";

export interface CatalogDomain {
  id: string;
  name: string;
  intentCount: number;
  intents: { id: string; name: string }[];
}

export interface CatalogKpi {
  id: string;
  name: string;
  unit: string;
  description: string;
}

export interface CatalogNbaRule {
  id: string;
  name: string;
  priority: number;
  action: string;
  urgency: string;
  actionType: string;
}

export interface CatalogInventory {
  pack: OntologyPack;
  version: string;
  source: string;
  domains: CatalogDomain[];
  kpis: CatalogKpi[];
  nbaRules: CatalogNbaRule[];
  channels: string[];
  sentiments: string[];
  urgencies: string[];
  path: string[];
}

export function inventoryCatalog(pack: OntologyPack = "local"): CatalogInventory {
  const o = resolveOntologyPack(pack);
  return {
    pack,
    version: o.version,
    source: o.source,
    domains: o.domains.map((d) => ({
      id: d.id,
      name: d.name,
      intentCount: d.intents.length,
      intents: d.intents.map((i) => ({ id: `${d.id}.${i.id}`, name: i.name })),
    })),
    kpis: o.kpis.map((k) => ({
      id: k.id,
      name: k.name,
      unit: String(k.unit),
      description: k.description,
    })),
    nbaRules: o.nbaRules.map((r) => ({
      id: r.id,
      name: r.name,
      priority: r.priority,
      action: r.action,
      urgency: String(r.urgency),
      actionType: String(r.actionType),
    })),
    channels: [...o.channels],
    sentiments: [...o.sentiments],
    urgencies: [...o.urgencies],
    path: ["load_strong", "inventory_catalog", "emit"],
  };
}
