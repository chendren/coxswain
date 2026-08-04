import { describe, expect, it } from "vitest";
import type { IntentTaxonomy, KpiFrame } from "../src/artifacts";
import {
  DEFAULT_ONTOLOGY,
  buildStrongGraph,
  graphStats,
  hubKey,
  neighbors,
  resolveLabel,
  resolveArtifactAgainstGraph,
  absorbKpiFrame,
  absorbIntentTaxonomy,
  runClosedWorldPass,
  runGraphNodePipeline,
  recommendNba,
  hasStrongId,
} from "../src/ontology";

const provenance = {
  specName: "billing-dispute",
  phase: "design" as const,
  targetId: "artifacts" as const,
};

describe("hubKey (NameHub identity)", () => {
  it("normalizes token order for person-like labels", () => {
    expect(hubKey("Doe, John")).toBe(hubKey("John Doe"));
    expect(hubKey("Total Contacts")).toBe(hubKey("contacts total"));
  });

  it("is strict — middle initial changes the key", () => {
    expect(hubKey("John Doe")).not.toBe(hubKey("John A Doe"));
  });
});

describe("buildStrongGraph", () => {
  it("materializes strong nodes and edges from DEFAULT_ONTOLOGY", () => {
    const g = buildStrongGraph(DEFAULT_ONTOLOGY);
    const stats = graphStats(g);
    expect(stats.nodes).toBeGreaterThan(50);
    expect(stats.edges).toBeGreaterThan(40);
    expect(stats.byKind.intent).toBe(40);
    expect(stats.byKind.domain).toBe(10);
    expect(stats.byKind.journey).toBe(7);
    expect(hasStrongId(g, "kpi", "total_contacts")).toBe(true);
    expect(hasStrongId(g, "intent", "billing.payment_issue")).toBe(true);
  });

  it("exposes HAS_INTENT neighbors from domain", () => {
    const g = buildStrongGraph(DEFAULT_ONTOLOGY);
    const intents = neighbors(g, "domain:billing", "HAS_INTENT");
    expect(intents.map((n) => n.id)).toContain("billing.payment_issue");
  });
});

describe("identity resolution", () => {
  it("resolves weak KPI labels to strong ids", () => {
    const g = buildStrongGraph(DEFAULT_ONTOLOGY);
    expect(resolveLabel(g, "kpi", "total_contacts")?.id).toBe("total_contacts");
    expect(resolveLabel(g, "kpi", "Total Contacts")?.id).toBe("total_contacts");
    expect(resolveLabel(g, "kpi", "made_up")).toBeUndefined();
  });

  it("absorbs KPI frames and drops unknown metrics", () => {
    const g = buildStrongGraph(DEFAULT_ONTOLOGY);
    const frame: KpiFrame = {
      kind: "kpiFrame",
      id: "kpiFrame",
      provenance,
      metrics: [
        { name: "total_contacts", target: 100, unit: "count" },
        { name: "invented_metric", target: 1, unit: "count" },
      ],
    };
    const report = resolveArtifactAgainstGraph(g, frame);
    expect(report.resolved).toBe(1);
    expect(report.rejected).toBe(1);
    const absorbed = absorbKpiFrame(g, frame);
    expect(absorbed.metrics).toEqual([{ name: "total_contacts", target: 100, unit: "count" }]);
  });

  it("absorbs intent taxonomies onto strong domain/intent ids", () => {
    const g = buildStrongGraph(DEFAULT_ONTOLOGY);
    const tax: IntentTaxonomy = {
      kind: "intentTaxonomy",
      id: "intentTaxonomy",
      provenance,
      domains: [
        {
          name: "Billing",
          intents: ["payment_issue", "not_real_intent"],
        },
      ],
    };
    const absorbed = absorbIntentTaxonomy(g, tax);
    expect(absorbed.domains).toHaveLength(1);
    expect(absorbed.domains[0]!.id).toBe("billing");
    expect(absorbed.domains[0]!.intents).toHaveLength(1);
  });
});

describe("graph-node pipeline", () => {
  it("passes closed-world KPI after absorb", () => {
    const frame: KpiFrame = {
      kind: "kpiFrame",
      id: "kpiFrame",
      provenance,
      metrics: [
        { name: "Total Contacts", target: 50, unit: "count" },
        { name: "garbage", target: 1, unit: "x" },
      ],
    };
    const result = runClosedWorldPass(DEFAULT_ONTOLOGY, frame, { absorb: true });
    expect(result.state.ok).toBe(true);
    expect(result.state.path).toContain("resolve_identity");
    expect(result.state.path).toContain("absorb");
    expect(result.state.path).toContain("emit");
    if (result.artifact?.kind === "kpiFrame") {
      expect(result.artifact.metrics.every((m) => m.name === "total_contacts")).toBe(true);
    }
  });

  it("fails closed-world KPI without absorb when names are unknown", () => {
    const frame: KpiFrame = {
      kind: "kpiFrame",
      id: "kpiFrame",
      provenance,
      metrics: [{ name: "garbage", target: 1, unit: "x" }],
    };
    const result = runClosedWorldPass(DEFAULT_ONTOLOGY, frame, { absorb: false });
    expect(result.state.ok).toBe(false);
    expect(result.state.path).toContain("fail");
  });

  it("runs bounded generate/parse loop and absorbs", async () => {
    let calls = 0;
    const result = await runGraphNodePipeline({
      ontology: DEFAULT_ONTOLOGY,
      kind: "kpiFrame",
      absorb: true,
      maxAttempts: 2,
      hooks: {
        generateWeak: async () => {
          calls += 1;
          return JSON.stringify({
            metrics: [{ name: "sla_compliance_rate", target: 95, unit: "percent" }],
          });
        },
        parseWeak: (kind, raw) => {
          const p = JSON.parse(raw) as { metrics: KpiFrame["metrics"] };
          return {
            kind: "kpiFrame" as const,
            id: "kpiFrame",
            provenance,
            metrics: p.metrics,
          };
        },
      },
    });
    expect(calls).toBe(1);
    expect(result.state.ok).toBe(true);
    expect(result.artifact?.kind).toBe("kpiFrame");
  });

  it("recommendNba is pure and priority-ordered", () => {
    const { primary, rules } = recommendNba(DEFAULT_ONTOLOGY, {
      journey: "churn_prevention",
      stage: "cancel_requested",
    });
    expect(primary?.id).toBe("CHURN_RISK_HIGH");
    expect(rules[0]?.priority).toBeGreaterThanOrEqual(rules[rules.length - 1]?.priority ?? 0);
  });
});
