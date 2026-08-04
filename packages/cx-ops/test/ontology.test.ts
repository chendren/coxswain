import { describe, expect, it } from "vitest";
import {
  showOntology,
  showStrongGraph,
  validateOntologyPack,
} from "../src/ontology";

describe("ontology ops", () => {
  it("showOntology inventories default pack", () => {
    const show = showOntology("default");
    expect(show.domains).toBe(10);
    expect(show.intents).toBe(40);
    expect(show.journeys).toContain("billing_dispute");
    expect(show.kpis).toContain("total_contacts");
    expect(show.path).toContain("emit");
  });

  it("local pack adds treasury journeys", () => {
    const show = showOntology("local");
    expect(show.journeys).toContain("treasury_check_replacement");
    expect(show.journeys.length).toBeGreaterThan(showOntology("default").journeys.length);
  });

  it("validateOntologyPack is clean and reports graph stats", () => {
    const v = validateOntologyPack("default");
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
    expect(v.graph.byKind.intent).toBe(40);
    expect(v.graph.nodes).toBeGreaterThan(50);
  });

  it("showStrongGraph reports edge kinds", () => {
    const g = showStrongGraph("default");
    expect(g.edgeKinds.HAS_INTENT).toBe(40);
    expect(g.edgeKinds.TRIGGERS).toBeGreaterThan(0);
    expect(g.stats.edges).toBeGreaterThan(40);
  });
});
