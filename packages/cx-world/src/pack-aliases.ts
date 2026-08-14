import type { CxOntology, CxSpec, StrongNodeKind } from "@cox/cx-core";
import { DEFAULT_ONTOLOGY } from "@cox/cx-core";
import type { PackId } from "@cox/cx-pack-registry";
import { seedRetailDesignPack } from "@cox/cx-pack-retail";
import { seedFinancialDesignPack } from "@cox/cx-pack-financial";
import { seedHealthcareDesignPack } from "@cox/cx-pack-healthcare";
import { seedTravelDesignPack } from "@cox/cx-pack-travel";

export interface PackAlias {
  display: string;
  uid: string;
  kind: StrongNodeKind;
  name: string;
}

function dummySpec(name: string): CxSpec {
  return {
    state: {
      name,
      createdAt: "1970-01-01T00:00:00.000Z",
      phases: { requirements: "draft", design: "missing", tasks: "missing" },
      tasks: [],
      approvals: [],
    },
    requirements: [],
  };
}

function seedFor(pack: PackId, spec: CxSpec, ontology: CxOntology) {
  if (pack === "retail") return seedRetailDesignPack(spec, ontology);
  if (pack === "financial") return seedFinancialDesignPack(spec, ontology);
  if (pack === "healthcare") return seedHealthcareDesignPack(spec, ontology);
  if (pack === "travel") return seedTravelDesignPack(spec, ontology);
  return [];
}

/** Closed names from the winning vertical pack (never invented). */
export function aliasesFromPack(pack: PackId, specName: string): PackAlias[] {
  const arts = seedFor(pack, dummySpec(specName), DEFAULT_ONTOLOGY);
  const out: PackAlias[] = [];
  for (const a of arts) {
    if (a.kind === "journeyMap") {
      const name = "name" in a && typeof a.name === "string" ? a.name : a.id;
      out.push({
        display: name,
        uid: `journey:${a.id}`,
        kind: "journey",
        name,
      });
    }
  }
  return out;
}

export function matchPackAlias(aliases: PackAlias[], phrase: string): PackAlias | undefined {
  const p = phrase.toLowerCase().trim();
  if (p.length < 4) return undefined;
  for (const a of aliases) {
    const id = a.uid.replace(/^journey:/, "").toLowerCase();
    const name = a.name.toLowerCase();
    if (id === p || name === p) return a;
    const idParts = id.split(/[._-]/);
    const nameParts = name.split(/[^a-z0-9]+/).filter(Boolean);
    if (idParts.includes(p) || nameParts.includes(p)) return a;
  }
  return undefined;
}
