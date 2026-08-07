/**
 * Closed-world journey inventory from ontology packs (strong nodes only).
 */
import {
  DEFAULT_ONTOLOGY,
  LOCAL_PLATFORM_ONTOLOGY,
  type CxOntology,
} from "@cox/cx-core";
import type { OntologyPack } from "./ontology";

export interface JourneyListItem {
  id: string;
  name: string;
  stages: string[];
  terminalStages: string[];
  triggerIntents: string[];
}

export interface JourneyInventory {
  pack: OntologyPack;
  journeys: JourneyListItem[];
  path: string[];
}

export function listJourneys(pack: OntologyPack = "local"): JourneyInventory {
  const ontology: CxOntology =
    pack === "default" ? DEFAULT_ONTOLOGY : LOCAL_PLATFORM_ONTOLOGY;
  const journeys: JourneyListItem[] = ontology.journeys.map((j) => ({
    id: j.id,
    name: j.name,
    stages: j.stages.map((s) => s.id),
    terminalStages: [...j.terminalStages],
    triggerIntents: [...j.triggerIntents],
  }));
  return {
    pack,
    journeys,
    path: ["load_ontology", "list_journeys", "emit"],
  };
}
