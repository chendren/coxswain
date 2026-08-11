import { describe, expect, it } from "vitest";
import type {
  ResolveReport,
  RetrievalMode,
  RetrievalRoute,
  GraphPath,
  GraphEvalCase,
} from "../src/ontology";
import {
  DEFAULT_ONTOLOGY,
  buildStrongGraph,
  resolveArtifactAgainstGraph,
  absorbKpiFrame,
  routeRetrieval,
  shortestPath,
  entityResolutionPrecision,
  routingAccuracy,
  pathGroundingScore,
  runGraphEvalSuite,
} from "../src/ontology";

describe("eval-protocol — multi-tier GraphRAG evaluation", () => {
  const g = buildStrongGraph(DEFAULT_ONTOLOGY);

  describe("entityResolutionPrecision", () => {
    it("F1 in (0,1] for mixed resolution report", () => {
      // Build a resolve report with mixed KPI frame
      const kpiFrame = {
        kind: "kpiFrame" as const,
        id: "test-kpis",
        name: "test-kpis",
        provenance: { specName: "eval", phase: "design" as const, targetId: "artifacts" as const },
        metrics: [
          { name: "total_contacts", target: 95, unit: "count" },
          { name: "unknown_metric", target: 80, unit: "count" },
          { name: "sla_compliance_rate", target: 90, unit: "percent" },
        ],
      };

      const report = resolveArtifactAgainstGraph(g, kpiFrame);

      // Should have some resolved and some rejected
      expect(report.resolved).toBeGreaterThanOrEqual(1);
      expect(report.rejected).toBeGreaterThanOrEqual(1);

      const pr = entityResolutionPrecision(report);
      expect(pr.precision).toBeGreaterThanOrEqual(0);
      expect(pr.precision).toBeLessThanOrEqual(1);
      expect(pr.recall).toBeGreaterThanOrEqual(0);
      expect(pr.recall).toBeLessThanOrEqual(1);
      expect(pr.f1).toBeGreaterThan(0);
      expect(pr.f1).toBeLessThanOrEqual(1);

      // Verify counts match
      let tp = 0;
      let fn = 0;
      for (const w of report.weak) {
        if (w.claimedKind === "free_text") continue;
        if (w.strength === "resolved") tp += 1;
        else if (w.strength === "rejected") fn += 1;
      }
      expect(pr.truePositive).toBe(tp);
      expect(pr.falseNegative).toBe(fn);
    });

    it("handles empty report with aggregate counts", () => {
      const report: ResolveReport = { weak: [], resolved: 3, rejected: 2, issues: [] };
      const pr = entityResolutionPrecision(report);

      // TP=3, FP=0, FN=2 → precision=1, recall=3/5
      expect(pr.precision).toBe(1);
      expect(pr.recall).toBeCloseTo(0.6);
      expect(pr.f1).toBeGreaterThan(0);
    });

    it("handles all resolved (perfect score)", () => {
      const kpiFrame = {
        kind: "kpiFrame" as const,
        id: "test-kpis",
        name: "test-kpis",
        provenance: { specName: "eval", phase: "design" as const, targetId: "artifacts" as const },
        metrics: [
          { name: "total_contacts", target: 95, unit: "count" },
          { name: "sla_compliance_rate", target: 90, unit: "percent" },
        ],
      };

      const report = resolveArtifactAgainstGraph(g, kpiFrame);

      // All KPIs should resolve in default ontology
      expect(report.resolved).toBe(2);
      expect(report.rejected).toBe(0);

      const pr = entityResolutionPrecision(report);
      expect(pr.precision).toBe(1);
      expect(pr.recall).toBe(1);
      expect(pr.f1).toBe(1);
    });

    it("handles all rejected (zero score)", () => {
      const kpiFrame = {
        kind: "kpiFrame" as const,
        id: "test-kpis",
        name: "test-kpis",
        provenance: { specName: "eval", phase: "design" as const, targetId: "artifacts" as const },
        metrics: [
          { name: "unknown_metric_1", target: 95, unit: "percent" },
          { name: "another_unknown", target: 80, unit: "count" },
        ],
      };

      const report = resolveArtifactAgainstGraph(g, kpiFrame);

      expect(report.resolved).toBe(0);
      expect(report.rejected).toBe(2);

      const pr = entityResolutionPrecision(report);
      expect(pr.precision).toBe(1); // TP=0, FP=0 → precision=1 by convention
      expect(pr.recall).toBe(0);
      expect(pr.f1).toBe(0);
    });

    it("ignores free_text claimedKind in weak nodes", () => {
      const report: ResolveReport = {
        weak: [
          { uid: "w1", claimedKind: "free_text", rawLabel: "some text", hubKey: "sometext", strength: "resolved" },
          { uid: "w2", claimedKind: "kpi", rawLabel: "total_contacts", hubKey: "totalcontacts", strength: "resolved", strongUid: "kpi:total_contacts" },
        ],
        resolved: 1,
        rejected: 0,
        issues: [],
      };

      const pr = entityResolutionPrecision(report);
      // Only w2 counts (kpi, not free_text)
      expect(pr.truePositive).toBe(1);
      expect(pr.falseNegative).toBe(0);
    });
  });

  describe("routingAccuracy", () => {
    it("returns ok=true when mode matches", () => {
      const expected: RetrievalMode = "closed_set_lookup";
      const actual: RetrievalRoute = routeRetrieval("billing.payment_issue");

      const result = routingAccuracy(expected, actual);
      expect(result.ok).toBe(true);
      expect(result.expected).toBe(expected);
    });

    it("returns ok=false when mode differs", () => {
      const expected: RetrievalMode = "graph_multihop";
      const actual: RetrievalRoute = routeRetrieval("billing.payment_issue");

      const result = routingAccuracy(expected, actual);
      expect(result.ok).toBe(false);
      expect(result.actual).toBe("closed_set_lookup");
    });

    it("accepts mode string directly", () => {
      const expected: RetrievalMode = "refuse";
      const actual: RetrievalMode = "refuse";

      const result = routingAccuracy(expected, actual);
      expect(result.ok).toBe(true);
    });
  });

  describe("pathGroundingScore", () => {
    it("all allowed → score 1", () => {
      const path = shortestPath(g, "domain:billing", "intent:billing.payment_issue", { maxHops: 2 })!;
      const allowedUids = new Set(["domain:billing", "intent:billing.payment_issue"]);

      const score = pathGroundingScore(path, allowedUids);
      expect(score).toBe(1);
    });

    it("half allowed → score 0.5", () => {
      const path = shortestPath(g, "domain:billing", "intent:billing.payment_issue", { maxHops: 2 })!;
      // Only allow the domain node
      const allowedUids = ["domain:billing"];

      const score = pathGroundingScore(path, allowedUids);
      expect(score).toBe(0.5);
    });

    it("empty path → score 1 (by definition)", () => {
      const emptyPath: GraphPath = { nodes: [], edges: [], hops: 0 };
      const allowedUids = new Set(["domain:billing"]);

      const score = pathGroundingScore(emptyPath, allowedUids);
      expect(score).toBe(1);
    });

    it("accepts string array for allowedUids", () => {
      const path = shortestPath(g, "domain:billing", "intent:billing.payment_issue", { maxHops: 2 })!;
      const allowedUids = ["domain:billing", "intent:billing.payment_issue"];

      const score = pathGroundingScore(path, allowedUids);
      expect(score).toBe(1);
    });

    it("no overlap → score 0", () => {
      const path = shortestPath(g, "domain:billing", "intent:billing.payment_issue", { maxHops: 2 })!;
      const allowedUids = new Set(["domain:orders", "intent:orders.shipping"]);

      const score = pathGroundingScore(path, allowedUids);
      expect(score).toBe(0);
    });
  });

  describe("runGraphEvalSuite", () => {
    it("integrates all three case kinds", () => {
      // Resolution case - use actual KPIs from default ontology
      const kpiFrame = {
        kind: "kpiFrame" as const,
        id: "test-kpis",
        name: "test-kpis",
        provenance: { specName: "eval", phase: "design" as const, targetId: "artifacts" as const },
        metrics: [
          { name: "total_contacts", target: 95, unit: "count" },
          { name: "unknown_metric", target: 80, unit: "count" },
        ],
      };
      const resolutionReport = resolveArtifactAgainstGraph(g, kpiFrame);

      // Routing case
      const routingQuery = "billing.payment_issue";
      const actualRoute = routeRetrieval(routingQuery);

      // Path case
      const path = shortestPath(g, "domain:billing", "intent:billing.payment_issue", { maxHops: 2 })!;
      const allowedUids = ["domain:billing", "intent:billing.payment_issue"];

      const cases: GraphEvalCase[] = [
        {
          id: "case-1",
          kind: "resolution" as const,
          report: resolutionReport,
        },
        {
          id: "case-2",
          kind: "routing" as const,
          expectedMode: "closed_set_lookup",
          actualRoute,
        },
        {
          id: "case-3",
          kind: "path" as const,
          path,
          allowedUids,
        },
      ];

      const summary = runGraphEvalSuite(cases);

      expect(summary.cases).toBe(3);
      expect(summary.details.length).toBe(3);

      // Resolution case should pass (F1 >= 0.5)
      const resolutionDetail = summary.details.find((d) => d.id === "case-1");
      expect(resolutionDetail?.metric).toBe("resolution_f1");
      expect(resolutionDetail?.value).toBeGreaterThan(0);
      expect(summary.resolutionF1Avg).toBeGreaterThan(0);

      // Routing case should pass (mode matches)
      const routingDetail = summary.details.find((d) => d.id === "case-2");
      expect(routingDetail?.metric).toBe("routing");
      expect(routingDetail?.ok).toBe(true);
      expect(summary.routingAccuracy).toBe(1);

      // Path case should pass (grounding = 1)
      const pathDetail = summary.details.find((d) => d.id === "case-3");
      expect(pathDetail?.metric).toBe("path_grounding");
      expect(pathDetail?.value).toBe(1);
      expect(summary.pathGroundingAvg).toBe(1);

      // All cases should pass
      expect(summary.passed).toBe(3);
      expect(summary.failed).toBe(0);
    });

    it("handles invalid cases gracefully", () => {
      const cases: GraphEvalCase[] = [
        {
          id: "invalid-1",
          kind: "resolution" as const,
          // Missing report
        },
        {
          id: "invalid-2",
          kind: "routing" as const,
          expectedMode: "closed_set_lookup",
          // Missing actualRoute
        },
      ];

      const summary = runGraphEvalSuite(cases);

      expect(summary.cases).toBe(2);
      expect(summary.passed).toBe(0);
      expect(summary.failed).toBe(2);

      for (const detail of summary.details) {
        expect(detail.metric).toBe("invalid_case");
        expect(detail.ok).toBe(false);
      }
    });

    it("handles empty suite", () => {
      const summary = runGraphEvalSuite([]);

      expect(summary.cases).toBe(0);
      expect(summary.passed).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.resolutionF1Avg).toBe(0);
      expect(summary.routingAccuracy).toBe(0);
      expect(summary.pathGroundingAvg).toBe(0);
    });
  });
});
