import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONTOLOGY,
  LOCAL_PLATFORM_ONTOLOGY,
  listIntentIds,
  listJourneyIds,
  listKpiIds,
  loadDefaultOntology,
  loadPlatformLocalOntology,
  mergeOntologies,
  validateOntology,
} from "../src/ontology";

describe("ontology load", () => {
  it("loads the default catalog with expected seed counts", () => {
    const o = loadDefaultOntology();
    expect(o.version).toBe("2026.08.0");
    expect(o.domains).toHaveLength(10);
    expect(o.journeys).toHaveLength(7);
    expect(o.nbaRules).toHaveLength(17);
    expect(o.kpis.length).toBeGreaterThanOrEqual(6);
    expect(listIntentIds(o)).toHaveLength(40);
  });

  it("DEFAULT_ONTOLOGY is a valid closed world", () => {
    const result = validateOntology(DEFAULT_ONTOLOGY);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("folds control-plane enums into the ontology", () => {
    expect(DEFAULT_ONTOLOGY.targets).toContain("artifacts");
    expect(DEFAULT_ONTOLOGY.capabilities).toContain("build");
    expect(DEFAULT_ONTOLOGY.opsModes).toContain("commands");
    expect(DEFAULT_ONTOLOGY.artifactKinds).toContain("intentTaxonomy");
  });

  it("platform-local pack adds treasury journeys without dropping defaults", () => {
    const pack = loadPlatformLocalOntology();
    expect(pack.journeys.length).toBe(8);
    expect(listJourneyIds(LOCAL_PLATFORM_ONTOLOGY)).toEqual(
      expect.arrayContaining([
        "billing_dispute",
        "treasury_check_replacement",
        "foreign_compliance",
      ]),
    );
    expect(listJourneyIds(DEFAULT_ONTOLOGY)).not.toContain("treasury_check_replacement");
    expect(listJourneyIds(LOCAL_PLATFORM_ONTOLOGY).length).toBe(
      DEFAULT_ONTOLOGY.journeys.length + pack.journeys.length,
    );
  });

  it("mergeOntologies lets pack win on id collision", () => {
    const base = loadDefaultOntology();
    const pack = loadPlatformLocalOntology();
    const renamed = {
      ...pack,
      journeys: pack.journeys.map((j) =>
        j.id === "bond_redemption" ? { ...j, name: "Renamed Bond Redemption" } : j,
      ),
    };
    const merged = mergeOntologies(base, renamed);
    expect(merged.journeys.find((j) => j.id === "bond_redemption")?.name).toBe(
      "Renamed Bond Redemption",
    );
  });

  it("exposes KPI ids used by the local platform", () => {
    for (const id of [
      "total_contacts",
      "sla_compliance_rate",
      "avg_wait_time",
      "deflection_rate",
      "avg_contact_value",
      "high_priority_contacts",
    ]) {
      expect(listKpiIds(DEFAULT_ONTOLOGY)).toContain(id);
    }
  });
});
