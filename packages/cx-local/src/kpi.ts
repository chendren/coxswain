import type { CxTargetId, KpiFrame } from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

export function kpiPrompt(journeyType: string): string {
  return `Produce a JSON object with field "metrics" (array of {name, target: number, unit}) describing realistic operational KPI targets for the "${journeyType}" customer journey (e.g. handle time, resolution rate, escalation rate). Respond with JSON only.`;
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
  const metrics = (parsed as Record<string, unknown>).metrics as KpiFrame["metrics"];
  return {
    kind: "kpiFrame",
    id: "kpiFrame",
    provenance: { specName, phase: "design", targetId },
    metrics,
  };
}
