/**
 * `cox cx …` — full CXOS command surface (graph-node orchestration).
 */
import {
  DEFAULT_ONTOLOGY,
  LOCAL_PLATFORM_ONTOLOGY,
  type CxTrafficProfile,
} from "@cox/cx-core";
import {
  approveCxPhase,
  clearDeployment,
  createCxSpec,
  listCxSpecs,
  loadCxWorkspace,
  loadDeployments,
  opsRecommendNba,
  orchestrateBuild,
  orchestrateReport,
  orchestrateSimulate,
  orchestrateStatus,
  parseNbaContext,
  parseTargets,
  saveCxWorkspace,
  seedDesignFromIdea,
  showOntology,
  showStrongGraph,
  validateOntologyPack,
  type OntologyPack,
  type CxPhase,
} from "@cox/cx-ops";
import type { CxRuntime } from "../cx/runtime";
import { createCxRuntime } from "../cx/runtime";

export interface CxWrite {
  write: (line: string) => void;
}

export interface CxCommandContext {
  cwd: string;
  write: (line: string) => void;
  /** Optional live model access. */
  tierModel?: CxRuntime["generate"] extends undefined
    ? undefined
    : import("@cox/core").ChatModel extends never
      ? never
      : (tier: import("@cox/core").Tier) => import("@cox/core").ChatModel;
  pack?: string;
  mode?: "offline" | "live";
}

function packOf(raw?: string): OntologyPack {
  if (!raw || raw === "default") return "default";
  if (raw === "local") return "local";
  throw new Error(`unknown pack "${raw}" (default|local)`);
}

function runtimeFrom(ctx: CxCommandContext): CxRuntime {
  return createCxRuntime({
    cwd: ctx.cwd,
    mode: ctx.mode ?? "offline",
    pack: packOf(ctx.pack),
    tierModel: ctx.tierModel as
      | ((tier: import("@cox/core").Tier) => import("@cox/core").ChatModel)
      | undefined,
  });
}

export function runCxOntologyShow(deps: CxWrite, packRaw?: string): void {
  const pack = packOf(packRaw);
  const show = showOntology(pack);
  deps.write(`CXOS ontology  pack=${show.pack}  version=${show.version}`);
  deps.write(`source: ${show.source}`);
  deps.write(`domains: ${show.domains}  intents: ${show.intents}  nbaRules: ${show.nbaRules}`);
  deps.write(`journeys (${show.journeys.length}): ${show.journeys.join(", ")}`);
  deps.write(`kpis: ${show.kpis.join(", ")}`);
  deps.write(`channels: ${show.channels.join(", ")}`);
  deps.write(`sample intents: ${show.sampleIntents.join(", ")}`);
  deps.write(`path: ${show.path.join(" → ")}`);
}

export function runCxOntologyValidate(deps: CxWrite, packRaw?: string): number {
  const pack = packOf(packRaw);
  const result = validateOntologyPack(pack);
  deps.write(`CXOS ontology validate  pack=${result.pack}  ok=${result.ok}`);
  deps.write(
    `graph: nodes=${result.graph.nodes} edges=${result.graph.edges} hubs=${result.graph.hubs}`,
  );
  for (const [kind, n] of Object.entries(result.graph.byKind).sort()) {
    deps.write(`  ${kind}: ${n}`);
  }
  if (!result.ok) {
    for (const issue of result.issues) {
      deps.write(`issue  ${issue.path}: ${issue.message}`);
    }
  }
  deps.write(`path: ${result.path.join(" → ")}`);
  return result.ok ? 0 : 1;
}

export function runCxOntologyGraph(deps: CxWrite, packRaw?: string): void {
  const pack = packOf(packRaw);
  const g = showStrongGraph(pack);
  deps.write(`CXOS strong graph  pack=${g.pack}`);
  deps.write(`nodes=${g.stats.nodes} edges=${g.stats.edges} hubs=${g.stats.hubs}`);
  deps.write("by kind:");
  for (const [kind, n] of Object.entries(g.stats.byKind).sort()) {
    deps.write(`  ${kind}: ${n}`);
  }
  deps.write("edge kinds:");
  for (const [kind, n] of Object.entries(g.edgeKinds).sort()) {
    deps.write(`  ${kind}: ${n}`);
  }
  deps.write(`path: ${g.path.join(" → ")}`);
}

export function runCxNba(deps: CxWrite, pairs: string[], packRaw?: string): number {
  const pack = packOf(packRaw);
  const context = parseNbaContext(pairs);
  if (Object.keys(context).length === 0) {
    deps.write("usage: cox cx nba journey=… stage=… [confidence=0.9] [field=value …]");
    return 2;
  }
  const ontology = pack === "local" ? LOCAL_PLATFORM_ONTOLOGY : DEFAULT_ONTOLOGY;
  const result = opsRecommendNba(context, ontology);
  deps.write(`CXOS NBA recommend  pack=${pack}`);
  deps.write(`context: ${JSON.stringify(context)}`);
  if (result.primary) {
    deps.write(
      `primary: ${result.primary.id}  action=${result.primary.action}  type=${result.primary.actionType}  urgency=${result.primary.urgency}  priority=${result.primary.priority}`,
    );
  } else {
    deps.write("primary: (none matched)");
  }
  deps.write(`matched rules (${result.rules.length}):`);
  for (const r of result.rules) {
    deps.write(`  [${r.priority}] ${r.id} → ${r.action} (${r.actionType}/${r.urgency})`);
  }
  if (result.confidence) {
    deps.write(
      `confidence band: ${result.confidence.band} (min=${result.confidence.min}) strategy=${result.confidence.strategy}`,
    );
  }
  if (result.nextStages) {
    deps.write(`next stages: ${result.nextStages.join(", ") || "(terminal or unknown)"}`);
  }
  deps.write(`path: ${result.path.join(" → ")}`);
  return 0;
}

export async function runCxNew(
  ctx: CxCommandContext,
  name: string,
  ideaParts: string[],
): Promise<number> {
  const rt = runtimeFrom(ctx);
  const idea = ideaParts.join(" ").trim() || name;
  const existing = await loadCxWorkspace(rt.workspace, name);
  if (existing) {
    ctx.write(`CX spec "${name}" already exists`);
    return 1;
  }
  const record = await createCxSpec(rt.workspace, name, idea);
  ctx.write(`created CX spec "${name}"`);
  ctx.write(`idea: ${idea}`);
  ctx.write(`requirements: ${record.spec.requirements.length}`);
  ctx.write(`phases: ${JSON.stringify(record.spec.state.phases)}`);
  ctx.write(`path: ${record.path.join(" → ")}`);
  ctx.write(`next: cox cx approve ${name} && cox cx build ${name}`);
  return 0;
}

export async function runCxApprove(
  ctx: CxCommandContext,
  name: string,
  phase?: string,
): Promise<number> {
  const rt = runtimeFrom(ctx);
  const p = phase as CxPhase | undefined;
  try {
    const record = await approveCxPhase(rt.workspace, name, p);
    ctx.write(`approved CX spec "${name}"`);
    ctx.write(`phases: ${JSON.stringify(record.spec.state.phases)}`);
    ctx.write(`path: ${record.path.slice(-4).join(" → ")}`);
    return 0;
  } catch (e) {
    ctx.write(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

export async function runCxList(ctx: CxCommandContext): Promise<number> {
  const rt = runtimeFrom(ctx);
  const names = await listCxSpecs(rt.workspace);
  if (names.length === 0) {
    ctx.write("(no CX specs under .cox/cx/)");
    return 0;
  }
  for (const n of names) {
    const rec = await loadCxWorkspace(rt.workspace, n);
    const phases = rec ? JSON.stringify(rec.spec.state.phases) : "?";
    ctx.write(`${n}  ${phases}`);
  }
  return 0;
}

export async function runCxStatus(
  ctx: CxCommandContext,
  name?: string,
  targetsRaw?: string,
): Promise<number> {
  const rt = runtimeFrom(ctx);
  if (!name) {
    return runCxList(ctx);
  }
  const record = await loadCxWorkspace(rt.workspace, name);
  if (!record) {
    ctx.write(`CX spec "${name}" not found`);
    return 1;
  }
  ctx.write(`CX spec "${name}"`);
  ctx.write(`idea: ${record.idea}`);
  ctx.write(`phases: ${JSON.stringify(record.spec.state.phases)}`);
  ctx.write(`requirements: ${record.spec.requirements.length}`);
  ctx.write(`design journeys: ${record.spec.design?.journeyMaps.length ?? 0}`);

  const depsFile = await loadDeployments(rt.workspace, name);
  const deployed = Object.keys(depsFile.deployments) as import("@cox/cx-core").CxTargetId[];
  if (deployed.length === 0) {
    ctx.write("deployments: (none — run cox cx build)");
    ctx.write(`path: status_workspace`);
    return 0;
  }

  const targets = parseTargets(
    targetsRaw ?? (deployed.length ? deployed.join(",") : "all"),
  ).filter((t) => depsFile.deployments[t]);

  const result = await orchestrateStatus(
    {
      ...rt.workspace,
      adapters: rt.adapters,
      ontology: rt.ontology,
    },
    record,
    depsFile.deployments,
    targets,
  );
  for (const t of result.targets) {
    if (t.error) ctx.write(`  ${t.targetId}: ERROR ${t.error}`);
    else {
      const m = (t.health?.metrics ?? []).map((x) => `${x.name}=${x.value}`).join(" ");
      ctx.write(`  ${t.targetId}: ${t.health?.level}  ${m}`);
    }
  }
  ctx.write(`path: ${result.path.join(" → ")}`);
  return result.ok ? 0 : 1;
}

export async function runCxBuild(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
  deploy = true,
): Promise<number> {
  const rt = runtimeFrom(ctx);
  let record = await loadCxWorkspace(rt.workspace, name);
  if (!record) {
    ctx.write(`CX spec "${name}" not found — run cox cx new ${name} "<idea>"`);
    return 1;
  }
  if (record.spec.state.phases.requirements !== "approved") {
    ctx.write(`requirements not approved — run: cox cx approve ${name} requirements`);
    return 1;
  }

  // Seed design if missing so multi-target offline build can proceed after artifacts
  if (!record.spec.design?.journeyMaps?.length) {
    record = {
      ...record,
      spec: seedDesignFromIdea(record.spec, record.idea),
      path: [...record.path, "seed_design"],
    };
    await saveCxWorkspace(rt.workspace, record);
  }

  const targets = parseTargets(targetsRaw ?? "all");
  ctx.write(`building ${name} targets=${targets.join(",")} mode=${rt.mode}`);

  const result = await orchestrateBuild(
    {
      ...rt.workspace,
      adapters: rt.adapters,
      ontology: rt.ontology,
      generateSummary: rt.generate
        ? (p) => rt.generate!(p, "scout")
        : undefined,
    },
    record,
    targets,
    { deploy },
  );

  for (const t of result.targets) {
    if (t.error) ctx.write(`  ${t.targetId}: FAIL ${t.error}`);
    else {
      ctx.write(
        `  ${t.targetId}: ok steps=${t.planSteps ?? 0} artifacts=${t.artifacts?.length ?? 0} deployed=${Boolean(t.deployment)}`,
      );
    }
  }
  ctx.write(`ok=${result.ok}`);
  ctx.write(`path: ${result.path.join(" → ")}`);
  return result.ok ? 0 : 1;
}

export async function runCxDeploy(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
): Promise<number> {
  // Deploy-only reuses build with deploy true; build already deploys by default.
  return runCxBuild(ctx, name, targetsRaw, true);
}

export async function runCxSimulate(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
): Promise<number> {
  const rt = runtimeFrom(ctx);
  const record = await loadCxWorkspace(rt.workspace, name);
  if (!record) {
    ctx.write(`CX spec "${name}" not found`);
    return 1;
  }
  const depsFile = await loadDeployments(rt.workspace, name);
  const targets = parseTargets(targetsRaw ?? "local").filter((t) => depsFile.deployments[t]);
  if (targets.length === 0) {
    ctx.write("no matching deployments to simulate");
    return 1;
  }
  const traffic: CxTrafficProfile = {
    name: "smoke",
    volumePerMinute: 12,
    personaWeights: { primary: 1 },
    durationMinutes: 1,
  };
  const result = await orchestrateSimulate(
    { ...rt.workspace, adapters: rt.adapters, ontology: rt.ontology },
    record,
    depsFile.deployments,
    targets,
    traffic,
  );
  for (const t of result.targets) {
    if (t.error) ctx.write(`  ${t.targetId}: FAIL ${t.error}`);
    else {
      const outcomes = (t.sim?.outcomes ?? [])
        .map((o) => `${o.kpiName}:${o.achieved.toFixed?.(1) ?? o.achieved}/${o.target}`)
        .join(" ");
      ctx.write(`  ${t.targetId}: ${outcomes || "(no outcomes)"}`);
    }
  }
  ctx.write(`path: ${result.path.join(" → ")}`);
  return result.ok ? 0 : 1;
}

export async function runCxReport(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
): Promise<number> {
  const rt = runtimeFrom(ctx);
  const record = await loadCxWorkspace(rt.workspace, name);
  if (!record) {
    ctx.write(`CX spec "${name}" not found`);
    return 1;
  }
  const depsFile = await loadDeployments(rt.workspace, name);
  const deployedKeys = Object.keys(depsFile.deployments);
  const targets = parseTargets(
    targetsRaw ?? (deployedKeys.length ? deployedKeys.join(",") : "all"),
  ).filter((t) => depsFile.deployments[t]);

  const traffic: CxTrafficProfile = {
    name: "smoke",
    volumePerMinute: 10,
    personaWeights: { primary: 1 },
    durationMinutes: 1,
  };

  const result = await orchestrateReport(
    {
      ...rt.workspace,
      adapters: rt.adapters,
      ontology: rt.ontology,
      generateSummary: rt.generate
        ? (p) => rt.generate!(p, "scout")
        : async () =>
            `Offline report for ${name}: ${targets.length} target(s) with deployments. Use cox cx status for details.`,
    },
    record,
    depsFile.deployments,
    targets,
    traffic,
    { journey: "billing_dispute", stage: "under_review", confidence: 0.75 },
  );

  if (result.report) {
    for (const t of result.report.targets) {
      ctx.write(
        `  ${t.targetId}: ${t.health?.level ?? "n/a"}${t.error ? ` ERROR ${t.error}` : ""}`,
      );
    }
    ctx.write(`summary: ${result.report.summary}`);
  }
  if (result.nba?.primary) {
    ctx.write(
      `nba: ${result.nba.primary.id} → ${result.nba.primary.action} (${result.nba.primary.urgency})`,
    );
  }
  ctx.write(`path: ${result.path.join(" → ")}`);
  return 0;
}

export async function runCxTeardown(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
): Promise<number> {
  const rt = runtimeFrom(ctx);
  const depsFile = await loadDeployments(rt.workspace, name);
  const targets = parseTargets(targetsRaw ?? "all").filter((t) => depsFile.deployments[t]);
  let ok = true;
  for (const t of targets) {
    const adapter = rt.adapters[t];
    const dep = depsFile.deployments[t];
    if (!adapter || !dep) continue;
    try {
      await adapter.teardown(dep);
      await clearDeployment(rt.workspace, name, t);
      ctx.write(`  ${t}: torn down`);
    } catch (e) {
      ok = false;
      ctx.write(`  ${t}: FAIL ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  ctx.write(`path: teardown → emit`);
  return ok ? 0 : 1;
}

export async function runCxPlan(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
): Promise<number> {
  const rt = runtimeFrom(ctx);
  let record = await loadCxWorkspace(rt.workspace, name);
  if (!record) {
    ctx.write(`CX spec "${name}" not found`);
    return 1;
  }
  if (!record.spec.design?.journeyMaps?.length) {
    record = {
      ...record,
      spec: seedDesignFromIdea(record.spec, record.idea),
    };
  }
  const targets = parseTargets(targetsRaw ?? "all");
  for (const t of targets) {
    const adapter = rt.adapters[t];
    if (!adapter) {
      ctx.write(`  ${t}: (not wired)`);
      continue;
    }
    try {
      const plan = await adapter.plan(record.spec);
      ctx.write(`  ${t}: ${plan.steps.length} steps`);
      for (const s of plan.steps) {
        ctx.write(`    - ${s.id} → ${s.producesArtifactKind}`);
      }
    } catch (e) {
      ctx.write(`  ${t}: FAIL ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  ctx.write(`path: plan_all → emit`);
  return 0;
}
