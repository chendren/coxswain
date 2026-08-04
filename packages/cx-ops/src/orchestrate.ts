/**
 * Multi-target CXOS orchestration as a graph of control nodes.
 *
 * Path:
 *   load_workspace → route_targets → [per target: plan → build → merge_design? → deploy]
 *   → status_all → optional_simulate → recommend_nba → emit
 */
import type {
  CxArtifact,
  CxDeployment,
  CxHealth,
  CxOntology,
  CxSimReport,
  CxSpec,
  CxTargetAdapter,
  CxTargetId,
  CxTrafficProfile,
  JourneyMap,
} from "@cox/cx-core";
import { DEFAULT_ONTOLOGY, recommendNba, type CxNbaContext } from "@cox/cx-core";
import type { CxOpsReport } from "./report";
import { generateReport } from "./report";
import {
  mergeDesignFromArtifacts,
  saveDeployment,
  type CxWorkspaceDeps,
  type CxWorkspaceRecord,
} from "./workspace";
import { getStatus, runSimulate } from "./status";

export interface OrchestratorAdapters {
  artifacts?: CxTargetAdapter;
  local?: CxTargetAdapter;
  aws?: CxTargetAdapter;
}

export interface OrchestrateDeps extends CxWorkspaceDeps {
  adapters: OrchestratorAdapters;
  ontology?: CxOntology;
  /** Scout-tier summary for reports. */
  generateSummary?: (prompt: string) => Promise<string>;
}

export interface TargetResult {
  targetId: CxTargetId;
  planSteps?: number;
  artifacts?: CxArtifact[];
  deployment?: CxDeployment;
  health?: CxHealth;
  sim?: CxSimReport;
  error?: string;
}

export interface OrchestrateResult {
  path: string[];
  ok: boolean;
  record: CxWorkspaceRecord;
  targets: TargetResult[];
  nba?: ReturnType<typeof recommendNba>;
  report?: CxOpsReport;
}

function adapterFor(
  adapters: OrchestratorAdapters,
  id: CxTargetId,
): CxTargetAdapter | undefined {
  return adapters[id];
}

/**
 * Build (+ optional deploy) targets in graph order: artifacts first, then others.
 * Merges design from artifacts into the workspace so local/aws can plan.
 */
export async function orchestrateBuild(
  deps: OrchestrateDeps,
  record: CxWorkspaceRecord,
  targets: CxTargetId[],
  opts?: { deploy?: boolean },
): Promise<OrchestrateResult> {
  const path = ["load_workspace", "route_targets"];
  const results: TargetResult[] = [];
  let current = record;
  let ok = true;

  // Ensure artifacts runs first if present
  const ordered = [...targets].sort((a, b) => {
    if (a === "artifacts") return -1;
    if (b === "artifacts") return 1;
    return 0;
  });

  for (const targetId of ordered) {
    const adapter = adapterFor(deps.adapters, targetId);
    const entry: TargetResult = { targetId };
    if (!adapter) {
      entry.error = `no adapter wired for "${targetId}"`;
      results.push(entry);
      ok = false;
      path.push(`fail:${targetId}:no_adapter`);
      continue;
    }

    try {
      path.push(`plan:${targetId}`);
      const plan = await adapter.plan(current.spec);
      entry.planSteps = plan.steps.length;

      path.push(`build:${targetId}`);
      const artifacts = await adapter.build(plan);
      entry.artifacts = artifacts;

      if (targetId === "artifacts") {
        path.push("merge_design");
        current = await mergeDesignFromArtifacts(deps, current.spec.state.name, artifacts);
      }

      if (opts?.deploy !== false) {
        path.push(`deploy:${targetId}`);
        const deployment = await adapter.deploy(artifacts);
        entry.deployment = deployment;
        await saveDeployment(deps, current.spec.state.name, deployment);
      }

      path.push(`ok:${targetId}`);
    } catch (e) {
      ok = false;
      entry.error = e instanceof Error ? e.message : String(e);
      path.push(`fail:${targetId}`);
    }
    results.push(entry);
  }

  path.push("emit");
  current.path = [...current.path, ...path];
  return { path, ok, record: current, targets: results };
}

export async function orchestrateStatus(
  deps: OrchestrateDeps,
  record: CxWorkspaceRecord,
  deployments: Partial<Record<CxTargetId, CxDeployment>>,
  targets: CxTargetId[],
): Promise<OrchestrateResult> {
  const path = ["load_workspace", "status_all"];
  const results: TargetResult[] = [];
  let ok = true;

  for (const targetId of targets) {
    const adapter = adapterFor(deps.adapters, targetId);
    const dep = deployments[targetId];
    const entry: TargetResult = { targetId, deployment: dep };
    if (!adapter || !dep) {
      entry.error = !adapter ? `no adapter for ${targetId}` : `no deployment for ${targetId}`;
      ok = false;
      results.push(entry);
      continue;
    }
    try {
      entry.health = await getStatus(adapter, dep);
      path.push(`status:${targetId}:${entry.health.level}`);
    } catch (e) {
      ok = false;
      entry.error = e instanceof Error ? e.message : String(e);
      path.push(`fail:status:${targetId}`);
    }
    results.push(entry);
  }

  path.push("emit");
  return { path, ok, record, targets: results };
}

export async function orchestrateSimulate(
  deps: OrchestrateDeps,
  record: CxWorkspaceRecord,
  deployments: Partial<Record<CxTargetId, CxDeployment>>,
  targets: CxTargetId[],
  traffic: CxTrafficProfile,
): Promise<OrchestrateResult> {
  const path = ["load_workspace", "simulate_route"];
  const results: TargetResult[] = [];
  let ok = true;

  for (const targetId of targets) {
    const adapter = adapterFor(deps.adapters, targetId);
    const dep = deployments[targetId];
    const entry: TargetResult = { targetId, deployment: dep };
    if (!adapter || !dep) {
      entry.error = !adapter ? `no adapter for ${targetId}` : `no deployment for ${targetId}`;
      ok = false;
      results.push(entry);
      continue;
    }
    try {
      path.push(`simulate:${targetId}`);
      entry.sim = await runSimulate(adapter, dep, traffic);
    } catch (e) {
      ok = false;
      entry.error = e instanceof Error ? e.message : String(e);
      path.push(`fail:simulate:${targetId}`);
    }
    results.push(entry);
  }

  path.push("emit");
  return { path, ok, record, targets: results };
}

export async function orchestrateReport(
  deps: OrchestrateDeps,
  record: CxWorkspaceRecord,
  deployments: Partial<Record<CxTargetId, CxDeployment>>,
  targets: CxTargetId[],
  traffic?: CxTrafficProfile,
  nbaContext?: CxNbaContext,
): Promise<OrchestrateResult> {
  const path = ["load_workspace", "aggregate_report"];
  const ontology = deps.ontology ?? DEFAULT_ONTOLOGY;

  const reportTargets = targets
    .map((targetId) => {
      const adapter = adapterFor(deps.adapters, targetId);
      const dep = deployments[targetId];
      if (!adapter || !dep) return null;
      return { targetId, adapter, dep, traffic };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const generate = deps.generateSummary
    ? async (prompt: string) => deps.generateSummary!(prompt)
    : async () => {
        const levels = reportTargets.map((t) => t.targetId).join(", ");
        return `CXOS offline report for ${record.spec.state.name}: targets ${levels}. Structured status collected; scout summary skipped (no generator).`;
      };

  const report = await generateReport(
    { generate: async (p, _tier) => generate(p), now: deps.now },
    record.spec.state.name,
    reportTargets,
  );
  path.push(...report.path);

  let nba: ReturnType<typeof recommendNba> | undefined;
  if (nbaContext) {
    path.push("recommend_nba");
    nba = recommendNba(ontology, nbaContext);
  }

  path.push("emit");
  return {
    path,
    ok: true,
    record,
    targets: report.targets.map((t) => ({
      targetId: t.targetId,
      health: t.health,
      sim: t.simReport,
      error: t.error,
    })),
    nba,
    report,
  };
}

/** Seed a minimal design so local/aws can build without LLM when needed. */
export function seedDesignFromIdea(spec: CxSpec, idea: string): CxSpec {
  if (spec.design?.journeyMaps?.length) return spec;
  const journeyMap: JourneyMap = {
    kind: "journeyMap",
    id: "billing_dispute",
    provenance: {
      specName: spec.state.name,
      phase: "design",
      targetId: "artifacts",
    },
    name: idea.slice(0, 80) || "Customer journey",
    stages: [
      {
        id: "initiated",
        name: "Initiated",
        description: "Customer starts the journey",
        touchpoints: ["chat", "phone"],
      },
      {
        id: "under_review",
        name: "Under Review",
        description: "Issue under review",
        touchpoints: ["agent"],
      },
      {
        id: "resolved",
        name: "Resolved",
        description: "Issue resolved",
        touchpoints: ["chat"],
      },
    ],
  };
  return {
    ...spec,
    design: {
      journeyMaps: [journeyMap],
      personas: [
        {
          kind: "persona",
          id: "persona",
          provenance: journeyMap.provenance,
          name: "Primary customer",
          goals: ["Resolve issue quickly"],
          painPoints: ["Long wait", "Repeat contacts"],
        },
      ],
    },
  };
}
