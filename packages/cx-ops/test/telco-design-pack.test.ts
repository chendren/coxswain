import { describe, expect, it } from "vitest";
import { LOCAL_PLATFORM_ONTOLOGY } from "@cox/cx-core";
import { isTelcoIdea, seedTelcoDesignPack } from "../src/telco-design-pack";

const baseSpec = {
  state: {
    name: "telco-core",
    createdAt: "2026-08-07T00:00:00Z",
    phases: {
      requirements: "approved" as const,
      design: "draft" as const,
      tasks: "missing" as const,
    },
    tasks: [],
    approvals: [],
  },
  requirements: [
    {
      id: "R1.1",
      text: "Typical telco mobile and broadband CX for billing, outages, and churn",
    },
  ],
};

describe("telco design pack", () => {
  it("detects telco ideas", () => {
    expect(isTelcoIdea("mobile wireless carrier CX")).toBe(true);
    expect(isTelcoIdea("broadband fiber install")).toBe(true);
    expect(isTelcoIdea("generic retail checkout")).toBe(false);
  });

  it("emits multi journey maps, personas, architecture", () => {
    const arts = seedTelcoDesignPack(baseSpec, LOCAL_PLATFORM_ONTOLOGY);
    const journeys = arts.filter((a) => a.kind === "journeyMap");
    const personas = arts.filter((a) => a.kind === "persona");
    const arch = arts.filter((a) => a.kind === "architectureDoc");
    expect(journeys.length).toBe(5);
    expect(personas.length).toBe(4);
    expect(arch.length).toBe(1);
    expect(journeys.map((j) => j.id).sort()).toEqual(
      [
        "billing_dispute",
        "churn_prevention",
        "new_account_setup",
        "service_upgrade",
        "technical_troubleshooting",
      ].sort(),
    );
    expect(arch[0]!.title).toMatch(/Telco CX architecture/);
    expect(arch[0]!.markdown).toContain("billing_dispute");
    expect(personas.some((p) => p.id.includes("churn"))).toBe(true);
  });
});
