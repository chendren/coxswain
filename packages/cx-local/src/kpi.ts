import type { CxTargetId, KpiFrame } from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

// The real platform's `GET /api/dashboard/kpis` endpoint returns a fixed
// vocabulary of scalar numeric keys (see NOTES.md). kpiPrompt() must
// constrain generated metric names to these exact keys, or simulate()'s
// `kpis[m.name]` lookup silently misses and reports `achieved: 0`.
export const REAL_KPI_KEYS = [
  "total_contacts",
  "sla_compliance_rate",
  "avg_wait_time",
  "deflection_rate",
  "avg_contact_value",
  "high_priority_contacts",
] as const;

export function kpiPrompt(journeyType: string): string {
  return `Produce a JSON object with field "metrics" (array of {name, target: number, unit}) describing realistic operational KPI targets for the "${journeyType}" customer journey. Each metric's "name" MUST be exactly one of these real platform metric keys (do not invent new names): ${REAL_KPI_KEYS.join(", ")}. Pick 2-4 of the most relevant ones for this journey type and assign realistic numeric targets with appropriate units (rates and percentages as 0-100, counts as whole numbers, avg_wait_time in seconds, avg_contact_value as a currency amount). Respond with JSON only.`;
}

export function parseKpiFrame(raw: string, specName: string, targetId: CxTargetId): KpiFrame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw createCxAdapterError({
      message: `cx-local: malformed JSON generating kpiFrame: ${raw.slice(0, 200)}`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as Record<string, unknown>).metrics)) {
    throw createCxAdapterError({
      message: `cx-local: response for kpiFrame is missing required fields`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  const rawMetrics = (parsed as Record<string, unknown>).metrics as unknown[];
  const isValidMetric = (m: unknown): m is KpiFrame["metrics"][number] =>
    typeof m === "object" &&
    m !== null &&
    typeof (m as Record<string, unknown>).name === "string" &&
    typeof (m as Record<string, unknown>).target === "number" &&
    typeof (m as Record<string, unknown>).unit === "string";
  if (!rawMetrics.every(isValidMetric)) {
    throw createCxAdapterError({
      message: `cx-local: response for kpiFrame is missing required fields`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  const metrics = rawMetrics as KpiFrame["metrics"];
  return {
    kind: "kpiFrame",
    id: "kpiFrame",
    provenance: { specName, phase: "design", targetId },
    metrics,
  };
}
