import type { Tier } from "@cox/core";
import type {
  CxDeployment,
  CxHealth,
  CxSimReport,
  CxTargetAdapter,
  CxTargetId,
  CxTrafficProfile,
} from "@cox/cx-core";
import { getStatus, runSimulate } from "./status";

export interface CxOpsReportEntry {
  targetId: CxTargetId;
  health?: CxHealth;
  simReport?: CxSimReport;
  error?: string;
}

export interface CxOpsReport {
  specName: string;
  generatedAt: string;
  targets: CxOpsReportEntry[];
  summary: string;
  /** Explicit control-flow path for audit (graph-node practice). */
  path: string[];
}

export interface ReportTarget {
  targetId: CxTargetId;
  adapter: CxTargetAdapter;
  dep: CxDeployment;
  traffic?: CxTrafficProfile;
}

export interface ReportDeps {
  generate: (prompt: string, tier: Tier) => Promise<string>;
  now?: () => string;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Cross-target ops report.
 * Path: aggregate_status → optional_simulate → scout_summary → emit
 * Failures are per-target (never abort the whole report).
 */
export async function generateReport(
  deps: ReportDeps,
  specName: string,
  deployments: ReportTarget[],
): Promise<CxOpsReport> {
  const path: string[] = ["aggregate_status"];
  const targets: CxOpsReportEntry[] = [];

  for (const d of deployments) {
    const entry: CxOpsReportEntry = { targetId: d.targetId };
    try {
      entry.health = await getStatus(d.adapter, d.dep);
    } catch (e) {
      entry.error = errorMessage(e);
      targets.push(entry);
      continue;
    }

    if (d.traffic && d.adapter.capabilities().includes("simulate")) {
      path.push(`simulate:${d.targetId}`);
      try {
        entry.simReport = await runSimulate(d.adapter, d.dep, d.traffic);
      } catch (e) {
        entry.error = errorMessage(e);
      }
    }
    targets.push(entry);
  }

  path.push("scout_summary");
  const structured = JSON.stringify(
    targets.map((t) => ({
      targetId: t.targetId,
      level: t.health?.level,
      metrics: t.health?.metrics,
      simOutcomes: t.simReport?.outcomes,
      error: t.error,
    })),
    null,
    2,
  );
  const prompt = [
    `Summarize CX ops status for spec "${specName}".`,
    "Use only the structured facts below. Do not invent metrics or targets.",
    "Be concise (3-6 sentences).",
    structured,
  ].join("\n\n");

  const summary = await deps.generate(prompt, "scout");
  path.push("emit");

  return {
    specName,
    generatedAt: (deps.now ?? (() => new Date().toISOString()))(),
    targets,
    summary,
    path,
  };
}
