import { CX_ARTIFACT_KINDS } from "../artifacts";
import { CX_TARGET_IDS, type CxCapability, type CxOpsMode } from "../target";
import {
  CX_ACTION_TYPE_IDS,
  CX_CHANNEL_IDS,
  CX_SENTIMENT_IDS,
  CX_URGENCY_IDS,
} from "./enums";
import type { CxOntology, CxOntologyCatalog } from "./types";

import defaultCatalogJson from "./catalogs/default.json";
import platformLocalCatalogJson from "./catalogs/platform-local.json";

const ALL_CAPABILITIES: readonly CxCapability[] = [
  "build",
  "deploy",
  "status",
  "simulate",
  "teardown",
  "autonomousRemediate",
];

const ALL_OPS_MODES: readonly CxOpsMode[] = ["commands", "console", "autonomous"];

function emptyPolicies(): CxOntologyCatalog["actionPolicies"] {
  return {
    confidenceBands: {},
    escalationChains: {},
    actionSequenceTemplates: {},
    resolutionFactors: { weights: {} },
    customerLifecycleStages: {},
  };
}

/** Build a runtime ontology from a catalog JSON object. */
export function loadOntologyFromCatalog(catalog: CxOntologyCatalog): CxOntology {
  return {
    version: catalog.version,
    source: catalog.source,
    domains: catalog.domains ?? [],
    journeys: catalog.journeys ?? [],
    nbaRules: catalog.nbaRules ?? [],
    actionPolicies: catalog.actionPolicies ?? emptyPolicies(),
    kpis: catalog.kpis ?? [],
    channels: catalog.channels?.length ? catalog.channels : [...CX_CHANNEL_IDS],
    sentiments: catalog.sentiments?.length ? catalog.sentiments : [...CX_SENTIMENT_IDS],
    urgencies: catalog.urgencies?.length ? catalog.urgencies : [...CX_URGENCY_IDS],
    actionTypes: catalog.actionTypes?.length ? catalog.actionTypes : [...CX_ACTION_TYPE_IDS],
    targets: CX_TARGET_IDS,
    capabilities: ALL_CAPABILITIES,
    opsModes: ALL_OPS_MODES,
    artifactKinds: CX_ARTIFACT_KINDS,
  };
}

/**
 * Merge extension packs onto a base ontology.
 * Domains/journeys/nba/kpis are unioned by id (pack wins on collision).
 * Enum lists are unioned (deduped, base order first).
 * Action policies shallow-merge maps (pack entries override).
 */
export function mergeOntologies(base: CxOntology, ...packs: CxOntology[]): CxOntology {
  let result = base;
  for (const pack of packs) {
    result = mergeTwo(result, pack);
  }
  return result;
}

function mergeById<T extends { id: string }>(base: T[], pack: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of base) map.set(item.id, item);
  for (const item of pack) map.set(item.id, item);
  return [...map.values()];
}

function unionStrings(base: readonly string[], pack: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...base, ...pack]) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function mergeTwo(base: CxOntology, pack: CxOntology): CxOntology {
  const ap = base.actionPolicies;
  const pp = pack.actionPolicies;
  return {
    version: pack.version || base.version,
    source: `${base.source}+${pack.source}`,
    domains: mergeById(base.domains, pack.domains),
    journeys: mergeById(base.journeys, pack.journeys),
    nbaRules: mergeById(base.nbaRules, pack.nbaRules),
    kpis: mergeById(base.kpis, pack.kpis),
    actionPolicies: {
      confidenceBands: { ...ap.confidenceBands, ...pp.confidenceBands },
      escalationChains: { ...ap.escalationChains, ...pp.escalationChains },
      actionSequenceTemplates: {
        ...ap.actionSequenceTemplates,
        ...pp.actionSequenceTemplates,
      },
      resolutionFactors: {
        weights: {
          ...ap.resolutionFactors.weights,
          ...pp.resolutionFactors.weights,
        },
      },
      customerLifecycleStages: {
        ...ap.customerLifecycleStages,
        ...pp.customerLifecycleStages,
      },
    },
    channels: unionStrings(base.channels, pack.channels),
    sentiments: unionStrings(base.sentiments, pack.sentiments),
    urgencies: unionStrings(base.urgencies, pack.urgencies),
    actionTypes: unionStrings(base.actionTypes, pack.actionTypes),
    targets: base.targets,
    capabilities: base.capabilities,
    opsModes: base.opsModes,
    artifactKinds: base.artifactKinds,
  };
}

export function loadDefaultOntology(): CxOntology {
  return loadOntologyFromCatalog(defaultCatalogJson as CxOntologyCatalog);
}

export function loadPlatformLocalOntology(): CxOntology {
  return loadOntologyFromCatalog(platformLocalCatalogJson as CxOntologyCatalog);
}

/** Default commercial+gov catalog, frozen at module load. */
export const DEFAULT_ONTOLOGY: CxOntology = loadDefaultOntology();

/**
 * Default catalog plus local omnichannel platform treasury journeys.
 * Use this when targeting the local platform adapter.
 */
export const LOCAL_PLATFORM_ONTOLOGY: CxOntology = mergeOntologies(
  DEFAULT_ONTOLOGY,
  loadPlatformLocalOntology(),
);
