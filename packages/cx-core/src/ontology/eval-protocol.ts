import type { ResolveReport } from "./resolve";
import type { RetrievalMode, RetrievalRoute } from "./retrieval-router";
import type { GraphPath } from "./traverse";

export interface PrecisionRecall {
  precision: number; // 0-1
  recall: number;
  f1: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
}

export function entityResolutionPrecision(report: ResolveReport): PrecisionRecall {
  // resolved = TP for claimed resolvable; rejected that should stay rejected need fixtures.
  // For a single report: precision = resolved / (resolved+rejected) when treating resolve as positive prediction
  // Better: use weak nodes with expected strongUid in props — if not available, use:
  //   TP = resolved, FP = 0 (unknown), FN = rejected (if we assume all should resolve) — too harsh.
  // Spec: treat resolved as TP, rejected as FN when weak.claimedKind !== free_text, free_text rejected as TN (ignore).
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const w of report.weak) {
    if (w.claimedKind === "free_text") continue;
    if (w.strength === "resolved") tp += 1;
    else if (w.strength === "rejected") fn += 1;
  }
  // If report has only aggregate counts:
  if (report.weak.length === 0) {
    tp = report.resolved;
    fn = report.rejected;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    precision,
    recall,
    f1,
    truePositive: tp,
    falsePositive: fp,
    falseNegative: fn,
  };
}

export function routingAccuracy(
  expected: RetrievalMode,
  actual: RetrievalRoute | RetrievalMode,
): { ok: boolean; expected: RetrievalMode; actual: RetrievalMode } {
  const mode = typeof actual === "string" ? actual : actual.mode;
  return { ok: mode === expected, expected, actual: mode };
}

/** Fraction of path nodes that are in allowed strong uid set (grounding). */
export function pathGroundingScore(path: GraphPath, allowedUids: Set<string> | string[]): number {
  const allow = allowedUids instanceof Set ? allowedUids : new Set(allowedUids);
  if (path.nodes.length === 0) return 1;
  let ok = 0;
  for (const n of path.nodes) if (allow.has(n)) ok += 1;
  return ok / path.nodes.length;
}

export interface GraphEvalCase {
  id: string;
  kind: "resolution" | "routing" | "path";
  // resolution
  report?: ResolveReport;
  // routing
  expectedMode?: RetrievalMode;
  actualRoute?: RetrievalRoute;
  // path
  path?: GraphPath;
  allowedUids?: string[];
}

export interface GraphEvalSummary {
  cases: number;
  passed: number;
  failed: number;
  resolutionF1Avg: number;
  routingAccuracy: number;
  pathGroundingAvg: number;
  details: Array<{ id: string; ok: boolean; metric: string; value: number }>;
}

export function runGraphEvalSuite(cases: GraphEvalCase[]): GraphEvalSummary {
  const details: GraphEvalSummary["details"] = [];
  let passed = 0;
  let resF1 = 0;
  let resN = 0;
  let routeOk = 0;
  let routeN = 0;
  let pathG = 0;
  let pathN = 0;

  for (const c of cases) {
    if (c.kind === "resolution" && c.report) {
      const pr = entityResolutionPrecision(c.report);
      resF1 += pr.f1;
      resN += 1;
      const ok = pr.f1 >= 0.5;
      if (ok) passed += 1;
      details.push({ id: c.id, ok, metric: "resolution_f1", value: pr.f1 });
    } else if (c.kind === "routing" && c.expectedMode && c.actualRoute) {
      const r = routingAccuracy(c.expectedMode, c.actualRoute);
      routeN += 1;
      if (r.ok) {
        routeOk += 1;
        passed += 1;
      }
      details.push({ id: c.id, ok: r.ok, metric: "routing", value: r.ok ? 1 : 0 });
    } else if (c.kind === "path" && c.path && c.allowedUids) {
      const g = pathGroundingScore(c.path, c.allowedUids);
      pathG += g;
      pathN += 1;
      const ok = g >= 1;
      if (ok) passed += 1;
      details.push({ id: c.id, ok, metric: "path_grounding", value: g });
    } else {
      details.push({ id: c.id, ok: false, metric: "invalid_case", value: 0 });
    }
  }

  return {
    cases: cases.length,
    passed,
    failed: cases.length - passed,
    resolutionF1Avg: resN ? resF1 / resN : 0,
    routingAccuracy: routeN ? routeOk / routeN : 0,
    pathGroundingAvg: pathN ? pathG / pathN : 0,
    details,
  };
}
