/**
 * `cox cx …` — full CXOS command surface (graph-node orchestration).
 */
import type { ChatModel, Tier } from "@cox/core";
import {
  DEFAULT_ONTOLOGY,
  LOCAL_PLATFORM_ONTOLOGY,
  type CxTrafficProfile,
} from "@cox/cx-core";
import {
  appendProposalsFromTick,
  applyProposal,
  approveCxPhase,
  clearDeployment,
  createCxSpec,
  isDaemonRunning,
  listCxSpecs,
  loadCxTasks,
  loadCxWorkspace,
  loadDeployments,
  loadProposals,
  opsRecommendNba,
  probeStackHealth,
  readDaemonMeta,
  recordDaemonLastTick,
  spawnWatchDaemon,
  stopDaemon,
  transitionTask,
  orchestrateBuild,
  orchestrateReport,
  orchestrateSimulate,
  orchestrateStatus,
  parseNbaContext,
  parseTargets,
  resolveNbaContextFromSpec,
  runConsoleTick,
  runWatchLoop,
  saveCxWorkspace,
  seedDesignFromIdea,
  showOntology,
  showStrongGraph,
  summarizeDeployments,
  summarizeTasks,
  formatPathAudit,
  formatPathByPhase,
  suggestedProposalNext,
  remediationFilePath,
  listOpenProposals,
  transitionProposal,
  validateOntologyPack,
  buildOpsBoard,
  renderExecBrief,
  exportCabPackage,
  appendAuditEvent,
  loadAuditEvents,
  listJourneys,
  inventoryCatalog,
  appendHealthSample,
  loadHealthHistory,
  archiveCxSpec,
  restoreCxSpec,
  snapshotCxSpec,
  type OntologyPack,
  type CxPhase,
  type ProposalStatus,
} from "@cox/cx-ops";
import { cp, mkdir, access, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CxRuntime, CxRuntimeMode } from "../cx/runtime";
import { createCxRuntime, createOfflineCxRuntime } from "../cx/runtime";

export interface CxWrite {
  write: (line: string) => void;
}

export interface CxCommandContext {
  cwd: string;
  write: (line: string) => void;
  tierModel?: (tier: Tier) => ChatModel;
  pack?: string;
  mode?: CxRuntimeMode;
  localBaseUrl?: string;
  skipProbe?: boolean;
  /** Explicit --live (prefer live wiring / stack readiness checks). */
  live?: boolean;
  /** Prefer hybrid without an explicit --live (also CX_AUTO_LIVE=1). */
  autoLive?: boolean;
}

function packOf(raw?: string): OntologyPack {
  if (!raw || raw === "default" || raw === "local") {
    return (raw as OntologyPack) || "local";
  }
  throw new Error(`unknown pack "${raw}" (default|local)`);
}

async function runtimeFrom(ctx: CxCommandContext): Promise<CxRuntime> {
  const auto =
    Boolean(ctx.autoLive) || process.env.CX_AUTO_LIVE === "1";
  // Explicit offline always wins; auto-live otherwise forces hybrid.
  const mode: CxRuntimeMode =
    ctx.mode === "offline"
      ? "offline"
      : auto
        ? "hybrid"
        : (ctx.mode ?? (ctx.tierModel ? "hybrid" : "offline"));
  if (mode === "offline" && !ctx.tierModel) {
    return createOfflineCxRuntime({
      cwd: ctx.cwd,
      pack: packOf(ctx.pack),
      localBaseUrl: ctx.localBaseUrl,
    });
  }
  return createCxRuntime({
    cwd: ctx.cwd,
    mode,
    pack: packOf(ctx.pack),
    tierModel: ctx.tierModel,
    localBaseUrl: ctx.localBaseUrl,
    skipProbe: ctx.skipProbe,
  });
}

export function runCxOntologyShow(deps: CxWrite, packRaw?: string): void {
  const pack = packOf(packRaw === "default" ? "default" : packRaw ?? "default");
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
  const pack = packOf(packRaw === "default" ? "default" : packRaw ?? "default");
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
  const pack = packOf(packRaw === "default" ? "default" : packRaw ?? "default");
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
  const pack = packOf(packRaw === "default" ? "default" : packRaw ?? "default");
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

function printWiring(ctx: CxCommandContext, rt: CxRuntime): void {
  ctx.write(
    `runtime mode=${rt.mode} platform=${rt.platformHealthy ? "up" : "down"} url=${rt.localBaseUrl ?? "-"}`,
  );
  ctx.write(
    `wiring artifacts=${rt.wiring.artifacts} local=${rt.wiring.local} aws=${rt.wiring.aws}`,
  );
  ctx.write(`compose path: ${rt.path.join(" → ")}`);
}

export async function runCxDoctor(ctx: CxCommandContext): Promise<number> {
  const rt = await runtimeFrom(ctx);
  printWiring(ctx, rt);
  const v = validateOntologyPack(ctx.pack === "default" ? "default" : "local");
  ctx.write(`ontology ok=${v.ok} nodes=${v.graph.nodes} edges=${v.graph.edges}`);

  const stack = await probeStackHealth({
    platformBaseUrl: ctx.localBaseUrl ?? rt.localBaseUrl,
  });
  ctx.write(
    `ollama: ${stack.ollama.ok ? "up" : "down"} embed=${stack.ollama.hasEmbed} llm=${stack.ollama.hasLlm} models=${stack.ollama.models.join(",") || "-"}`,
  );
  if (stack.ollama.error) ctx.write(`  ollama error: ${stack.ollama.error}`);
  ctx.write(
    `platform: ${stack.platform.ok ? "ready" : "not-ready"} http=${stack.platform.httpStatus} status=${stack.platform.status ?? "-"}`,
  );
  if (stack.platform.checks) {
    ctx.write(
      `  checks: ${Object.entries(stack.platform.checks)
        .map(([k, val]) => `${k}=${val}`)
        .join(" ")}`,
    );
  }
  if (stack.platform.error) ctx.write(`  platform error: ${stack.platform.error}`);
  ctx.write(`stack ready for live local: ${stack.ready}`);
  ctx.write(`stack path: ${stack.path.join(" → ")}`);

  const specs = await listCxSpecs(rt.workspace);
  ctx.write(`specs: ${specs.length ? specs.join(", ") : "(none)"}`);

  // Full doctor output always printed above. Offline: exit on ontology only.
  // Live / hybrid / auto-live: also require stack.ready.
  if (!v.ok) return 1;
  const wantsLiveStack =
    Boolean(ctx.live) ||
    Boolean(ctx.autoLive) ||
    process.env.CX_AUTO_LIVE === "1" ||
    ctx.mode === "live" ||
    ctx.mode === "hybrid" ||
    rt.mode === "live" ||
    rt.mode === "hybrid";
  if (wantsLiveStack && !stack.ready) return 1;
  return 0;
}

export async function runCxNew(
  ctx: CxCommandContext,
  name: string,
  ideaParts: string[],
): Promise<number> {
  const rt = await runtimeFrom(ctx);
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
  const rt = await runtimeFrom(ctx);
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
  const rt = await runtimeFrom(ctx);
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
  const rt = await runtimeFrom(ctx);
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
  const entries = result.targets.map((t) => ({
    targetId: t.targetId,
    level: t.health?.level,
    error: t.error,
  }));
  const summary = summarizeDeployments(entries);
  ctx.write(
    `summary score: ${summary.score} (healthy=${summary.healthy} degraded=${summary.degraded} down=${summary.down} errors=${summary.errors})`,
  );
  await appendHealthSample(rt.workspace, name, entries);
  const hist = await loadHealthHistory(rt.workspace, name, 5);
  if (hist.length > 1) {
    ctx.write(`health history (last ${hist.length}): ${hist.map((h) => h.score).join(" → ")}`);
  }
  ctx.write(`path: ${formatPathAudit(result.path)}`);
  return result.ok ? 0 : 1;
}

export async function runCxBuild(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
  deploy = true,
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  printWiring(ctx, rt);

  let record = await loadCxWorkspace(rt.workspace, name);
  if (!record) {
    ctx.write(`CX spec "${name}" not found — run cox cx new ${name} "<idea>"`);
    return 1;
  }
  if (record.spec.state.phases.requirements !== "approved") {
    ctx.write(`requirements not approved — run: cox cx approve ${name} requirements`);
    return 1;
  }

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
        `  ${t.targetId}: ok steps=${t.planSteps ?? 0} artifacts=${t.artifacts?.length ?? 0} deployed=${Boolean(t.deployment)} wiring=${rt.wiring[t.targetId]}`,
      );
    }
  }
  ctx.write(`ok=${result.ok}`);
  ctx.write(`path: ${result.path.join(" → ")}`);
  return result.ok ? 0 : 1;
}

/**
 * Golden path: new (if needed) → approve requirements → build+deploy all →
 * status → simulate local (if deployed) → report. Prints path audit + next steps.
 */
export async function runCxRun(
  ctx: CxCommandContext,
  name: string,
  ideaParts: string[],
  targetsRaw?: string,
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  printWiring(ctx, rt);

  const audit: string[] = ["cx_run"];
  const idea = ideaParts.join(" ").trim() || name;

  let record = await loadCxWorkspace(rt.workspace, name);
  if (!record) {
    ctx.write(`creating CX spec "${name}"`);
    record = await createCxSpec(rt.workspace, name, idea);
    audit.push("create_spec");
    ctx.write(`idea: ${idea}`);
    ctx.write(`requirements: ${record.spec.requirements.length}`);
  } else {
    ctx.write(`CX spec "${name}" already exists`);
    audit.push("load_existing");
  }

  if (record.spec.state.phases.requirements !== "approved") {
    ctx.write(`approving requirements for "${name}"`);
    record = await approveCxPhase(rt.workspace, name, "requirements");
    audit.push("approve:requirements");
  } else {
    audit.push("requirements_already_approved");
  }

  if (!record.spec.design?.journeyMaps?.length) {
    record = {
      ...record,
      spec: seedDesignFromIdea(record.spec, record.idea),
      path: [...record.path, "seed_design"],
    };
    await saveCxWorkspace(rt.workspace, record);
    audit.push("seed_design");
  }

  const targets = parseTargets(targetsRaw ?? "all");
  ctx.write(`building ${name} targets=${targets.join(",")} mode=${rt.mode}`);

  const orchDeps = {
    ...rt.workspace,
    adapters: rt.adapters,
    ontology: rt.ontology,
    generateSummary: rt.generate
      ? (p: string) => rt.generate!(p, "scout")
      : undefined,
  };

  const built = await orchestrateBuild(orchDeps, record, targets, { deploy: true });
  audit.push(...built.path);
  for (const t of built.targets) {
    if (t.error) ctx.write(`  build ${t.targetId}: FAIL ${t.error}`);
    else {
      ctx.write(
        `  build ${t.targetId}: ok steps=${t.planSteps ?? 0} artifacts=${t.artifacts?.length ?? 0} deployed=${Boolean(t.deployment)} wiring=${rt.wiring[t.targetId]}`,
      );
    }
  }
  if (!built.ok) {
    ctx.write(`ok=false (build failed)`);
    ctx.write(`path: ${audit.join(" → ")}`);
    return 1;
  }

  record = built.record;
  const depsFile = await loadDeployments(rt.workspace, name);
  const deployed = Object.keys(depsFile.deployments) as import("@cox/cx-core").CxTargetId[];
  const statusTargets = targets.filter((t) => depsFile.deployments[t]);

  if (statusTargets.length > 0) {
    const status = await orchestrateStatus(
      orchDeps,
      record,
      depsFile.deployments,
      statusTargets,
    );
    audit.push(...status.path);
    for (const t of status.targets) {
      if (t.error) ctx.write(`  status ${t.targetId}: ERROR ${t.error}`);
      else {
        const m = (t.health?.metrics ?? []).map((x) => `${x.name}=${x.value}`).join(" ");
        ctx.write(`  status ${t.targetId}: ${t.health?.level}  ${m}`);
      }
    }
  } else {
    ctx.write("status: (no deployments)");
    audit.push("status_skipped");
  }

  if (depsFile.deployments.local) {
    const traffic: CxTrafficProfile = {
      name: "smoke",
      volumePerMinute: 12,
      personaWeights: { primary: 1 },
      durationMinutes: 1,
    };
    const sim = await orchestrateSimulate(
      orchDeps,
      record,
      depsFile.deployments,
      ["local"],
      traffic,
    );
    audit.push(...sim.path);
    for (const t of sim.targets) {
      if (t.error) ctx.write(`  simulate ${t.targetId}: FAIL ${t.error}`);
      else {
        const outcomes = (t.sim?.outcomes ?? [])
          .map(
            (o) =>
              `${o.kpiName}:${typeof o.achieved === "number" ? o.achieved.toFixed(1) : o.achieved}/${o.target}`,
          )
          .join(" ");
        ctx.write(`  simulate ${t.targetId}: ${outcomes || "(no outcomes)"}`);
      }
    }
  } else {
    ctx.write("simulate: skipped (local not deployed)");
    audit.push("simulate_skipped");
  }

  const reportTargets =
    statusTargets.length > 0
      ? statusTargets
      : parseTargets(deployed.length ? deployed.join(",") : "all").filter(
          (t) => depsFile.deployments[t],
        );
  const reportTraffic: CxTrafficProfile = {
    name: "smoke",
    volumePerMinute: 10,
    personaWeights: { primary: 1 },
    durationMinutes: 1,
  };
  const report = await orchestrateReport(
    {
      ...orchDeps,
      generateSummary: orchDeps.generateSummary
        ? orchDeps.generateSummary
        : async () =>
            `Offline report for ${name}: ${reportTargets.length} target(s) with deployments. Use cox cx status for details.`,
    },
    record,
    depsFile.deployments,
    reportTargets,
    reportTraffic,
    resolveNbaContextFromSpec(record.spec, rt.ontology),
  );
  audit.push(...report.path);

  if (report.report) {
    for (const t of report.report.targets) {
      ctx.write(
        `  report ${t.targetId}: ${t.health?.level ?? "n/a"}${t.error ? ` ERROR ${t.error}` : ""}`,
      );
    }
    ctx.write(`summary: ${report.report.summary}`);
  }
  if (report.nba?.primary) {
    ctx.write(
      `nba: ${report.nba.primary.id} → ${report.nba.primary.action} (${report.nba.primary.urgency})`,
    );
  }

  ctx.write(`ok=true deployments=${deployed.join(",") || "(none)"}`);
  ctx.write(`path: ${formatPathByPhase(audit)}`);
  ctx.write(`path_full: ${formatPathAudit(audit, 12)}`);
  ctx.write("next steps:");
  ctx.write(`  cox cx console ${name}     # poll status, propose gated NBA`);
  ctx.write(`  cox cx apply ${name} <id>   # apply a proposal → task`);
  ctx.write(`  cox cx board               # multi-spec ops board`);
  ctx.write(`  cox cx brief ${name}       # executive brief`);
  ctx.write(`  cox cx cab-export ${name}  # CAB change package`);
  ctx.write(`  cox cx daemon start ${name} # long-running watch loop`);
  return 0;
}

export async function runCxDeploy(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
): Promise<number> {
  return runCxBuild(ctx, name, targetsRaw, true);
}

export async function runCxSimulate(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
): Promise<number> {
  const rt = await runtimeFrom(ctx);
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
        .map((o) => `${o.kpiName}:${typeof o.achieved === "number" ? o.achieved.toFixed(1) : o.achieved}/${o.target}`)
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
  const rt = await runtimeFrom(ctx);
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
    resolveNbaContextFromSpec(record.spec, rt.ontology),
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
  ctx.write(`path: ${formatPathAudit(result.path)}`);
  return 0;
}

export async function runCxTeardown(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
): Promise<number> {
  const rt = await runtimeFrom(ctx);
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
  const rt = await runtimeFrom(ctx);
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
      ctx.write(`  ${t}: ${plan.steps.length} steps  wiring=${rt.wiring[t]}`);
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

/**
 * Console tick: poll deployments, intent-route, propose NBA (no mutations).
 */
export async function runCxConsole(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  printWiring(ctx, rt);
  const record = await loadCxWorkspace(rt.workspace, name);
  if (!record) {
    ctx.write(`CX spec "${name}" not found`);
    return 1;
  }
  const depsFile = await loadDeployments(rt.workspace, name);
  const deployedKeys = Object.keys(depsFile.deployments) as import("@cox/cx-core").CxTargetId[];
  if (deployedKeys.length === 0) {
    ctx.write("no deployments — run cox cx build first");
    return 1;
  }
  const targets = parseTargets(
    targetsRaw ?? deployedKeys.join(","),
  ).filter((t) => depsFile.deployments[t]);

  const nbaContext = resolveNbaContextFromSpec(record.spec, rt.ontology);
  const tick = await runConsoleTick(
    targets.map((targetId) => ({
      targetId,
      adapter: rt.adapters[targetId]!,
      dep: depsFile.deployments[targetId]!,
      nbaContext,
    })),
    { ontology: rt.ontology },
  );

  ctx.write(`console tick @ ${tick.polledAt}`);
  for (const p of tick.proposals) {
    ctx.write(`  [${p.kind}] ${p.summary}`);
    if (p.nba?.primary) {
      ctx.write(
        `    nba: ${p.nba.primary.id} → ${p.nba.primary.action} (${p.nba.primary.urgency})`,
      );
    }
    ctx.write(`    path: ${p.path.join(" → ")}`);
  }
  ctx.write(`path: ${tick.path.join(" → ")}`);

  // Persist non-none proposals for human follow-up
  const persisted = await appendProposalsFromTick(rt.workspace, name, tick.proposals);
  if (persisted.added.length > 0) {
    ctx.write(`persisted ${persisted.added.length} proposal(s) (skipped ${persisted.skipped} dupes)`);
    for (const p of persisted.added) {
      ctx.write(`  + ${p.id} [${p.kind}] ${p.summary}`);
      ctx.write(`  next: cox cx apply ${name} ${p.id}`);
      await appendAuditEvent(rt.workspace, {
        kind: "proposal_persisted",
        specName: name,
        message: p.summary,
        ref: p.id,
        path: p.path,
      });
    }
  } else {
    ctx.write("(no new proposals to persist)");
  }
  ctx.write("(proposals are human-gated - no mutations applied)");
  return 0;
}

export async function runCxWatch(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
  opts?: { intervalMs?: number; maxTicks?: number },
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  printWiring(ctx, rt);
  const record = await loadCxWorkspace(rt.workspace, name);
  if (!record) {
    ctx.write(`CX spec "${name}" not found`);
    return 1;
  }
  const depsFile = await loadDeployments(rt.workspace, name);
  const deployedKeys = Object.keys(depsFile.deployments) as import("@cox/cx-core").CxTargetId[];
  if (deployedKeys.length === 0) {
    ctx.write("no deployments — run cox cx build first");
    return 1;
  }
  const targets = parseTargets(
    targetsRaw ?? deployedKeys.join(","),
  ).filter((t) => depsFile.deployments[t]);

  const intervalMs = opts?.intervalMs ?? 2_000;
  const maxTicks = opts?.maxTicks ?? 3;
  ctx.write(`watching ${name} ticks=${maxTicks} intervalMs=${intervalMs}`);

  const nbaContext = resolveNbaContextFromSpec(record.spec, rt.ontology);
  const result = await runWatchLoop(
    name,
    targets.map((targetId) => ({
      targetId,
      adapter: rt.adapters[targetId]!,
      dep: depsFile.deployments[targetId]!,
      nbaContext,
    })),
    {
      ...rt.workspace,
      ontology: rt.ontology,
      intervalMs,
      maxTicks,
      onTick: (info) => {
        ctx.write(
          `tick ${info.tick}: proposals=${info.proposals.length} added=${info.added.length}`,
        );
        for (const a of info.added) {
          ctx.write(`  + ${a.id} [${a.kind}] ${a.nbaRuleId ?? "-"}`);
        }
        void recordDaemonLastTick(rt.workspace.cxRoot, name, info.tick);
      },
    },
  );

  ctx.write(`done ticks=${result.ticks} totalAdded=${result.totalAdded}`);
  ctx.write(`path: ${result.path.join(" → ")}`);
  return 0;
}

export async function runCxProposals(
  ctx: CxCommandContext,
  name: string,
  opts: { all?: boolean; status?: ProposalStatus } = {},
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const all = await loadProposals(rt.workspace, name);
  let list = all;
  if (opts.status) {
    list = all.filter((p) => p.status === opts.status);
  } else if (!opts.all) {
    list = all.filter((p) => p.status === "open" || p.status === "claimed");
  }
  const label = opts.status ?? (opts.all ? "all" : "open");
  if (list.length === 0) {
    ctx.write(`(no ${label} proposals for ${name})`);
    return 0;
  }
  const nowMs = Date.now();
  for (const p of list) {
    const next = suggestedProposalNext(p.status);
    const created = Date.parse(p.createdAt || "");
    const ageH = Number.isFinite(created) ? Math.floor(Math.max(0, nowMs - created) / 3_600_000) : 0;
    const urg = p.kind === "remediate" ? "high" : p.kind === "investigate" ? "med" : "low";
    ctx.write(
      `${p.id}  [${p.status}/${p.kind}] ${p.targetId}  age=${ageH}h urg=${urg}  ${p.nbaRuleId ?? "-"}  next=${next}  ${p.summary}`,
    );
    if (next === "apply") {
      ctx.write(`  → cox cx apply ${name} ${p.id}  (or: cox cx claim ${name} ${p.id})`);
    } else if (next === "resolve") {
      ctx.write(`  → cox cx proposal ${name} ${p.id} resolved`);
    } else if (next === "dismiss") {
      ctx.write(`  → cox cx proposal ${name} ${p.id} dismissed`);
    } else if (next === "reopen") {
      ctx.write(`  → cox cx proposal ${name} ${p.id} open`);
    }
  }
  ctx.write(`path: load_proposals → emit`);
  return 0;
}

export async function runCxProposalTransition(
  ctx: CxCommandContext,
  name: string,
  id: string,
  status: ProposalStatus,
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  try {
    const next = await transitionProposal(rt.workspace, name, id, status);
    if (!next) {
      ctx.write(`proposal ${id} not found`);
      return 1;
    }
    ctx.write(`${next.id} → ${next.status}`);
    ctx.write(`path: load_proposals → transition:${status} → emit`);
    return 0;
  } catch (e) {
    ctx.write(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

export async function runCxDaemonStart(
  ctx: CxCommandContext,
  name: string,
  opts?: { intervalMs?: number; maxTicks?: number; live?: boolean; baseUrl?: string },
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const record = await loadCxWorkspace(rt.workspace, name);
  if (!record) {
    ctx.write(`CX spec "${name}" not found`);
    return 1;
  }
  if (await isDaemonRunning(rt.workspace.cxRoot, name)) {
    ctx.write(`daemon already running for ${name}`);
    return 1;
  }

  // Resolve monorepo CLI entry + repo root (for tsx + pnpm layout)
  const { fileURLToPath } = await import("node:url");
  const { dirname, join, resolve } = await import("node:path");
  const mainTs = resolve(dirname(fileURLToPath(import.meta.url)), "..", "main.ts");

  const extra: string[] = [];
  if (opts?.live || ctx.mode === "live" || ctx.mode === "hybrid") {
    extra.push("--live");
  }
  if (opts?.baseUrl || ctx.localBaseUrl) {
    extra.push("--base-url", opts?.baseUrl ?? ctx.localBaseUrl!);
  }

  try {
    const meta = await spawnWatchDaemon({
      cwd: ctx.cwd,
      specName: name,
      coxEntry: mainTs,
      cxRoot: rt.workspace.cxRoot,
      intervalMs: opts?.intervalMs ?? 30_000,
      maxTicks: opts?.maxTicks ?? 120,
      extraArgs: extra,
    });
    ctx.write(`daemon started pid=${meta.pid} spec=${name}`);
    ctx.write(`intervalMs=${meta.intervalMs} maxTicks=${meta.maxTicks}`);
    ctx.write(`path: ${meta.path.join(" → ")}`);
    return 0;
  } catch (e) {
    ctx.write(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

export async function runCxDaemonStop(ctx: CxCommandContext, name: string): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const result = await stopDaemon(rt.workspace.cxRoot, name);
  ctx.write(`daemon stop stopped=${result.stopped}${result.pid ? ` pid=${result.pid}` : ""}`);
  ctx.write(`path: ${result.path.join(" → ")}`);
  return 0;
}

export async function runCxDaemonStatus(ctx: CxCommandContext, name: string): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const running = await isDaemonRunning(rt.workspace.cxRoot, name);
  const meta = await readDaemonMeta(rt.workspace.cxRoot, name);
  const paths = {
    log: join(rt.workspace.cxRoot, name, "daemon.log"),
  };
  let logPresent = false;
  try {
    await access(paths.log);
    logPresent = true;
  } catch {
    /* log not created yet */
  }
  const openProps = await listOpenProposals(rt.workspace, name);
  const ticks =
    meta != null
      ? `${meta.lastTick ?? 0}/${meta.maxTicks}`
      : "-/-";
  const pid = meta?.pid ?? "-";
  const last = meta?.lastTickAt ?? "-";

  // One scannable health line for operators
  ctx.write(
    `daemon ${name}: ${running ? "running" : "stopped"} pid=${pid} ticks=${ticks} last=${last} proposals_open=${openProps.length}${logPresent ? ` log=${paths.log}` : ""}`,
  );
  if (meta) {
    ctx.write(
      `detail: startedAt=${meta.startedAt} intervalMs=${meta.intervalMs} targets=${meta.targets.join(",")}`,
    );
  }
  if (!running) {
    ctx.write(`next: cox cx daemon start ${name}`);
  }
  ctx.write(`path: daemon_status → emit`);
  return running ? 0 : 1;
}

export async function runCxApply(
  ctx: CxCommandContext,
  name: string,
  proposalId: string,
  opts?: { resolve?: boolean },
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const proposals = await loadProposals(rt.workspace, name);
  const prop = proposals.find((p) => p.id === proposalId);
  if (!prop) {
    ctx.write(`proposal ${proposalId} not found`);
    return 1;
  }
  if (prop.status === "resolved" || prop.status === "dismissed") {
    ctx.write(`proposal ${proposalId} is ${prop.status} - nothing to apply`);
    return 1;
  }
  try {
    const result = await applyProposal(rt.workspace, name, prop, {
      resolve: Boolean(opts?.resolve),
    });
    await appendAuditEvent(rt.workspace, {
      kind: "proposal_applied",
      specName: name,
      message: `task=${result.task.id} resolve=${Boolean(opts?.resolve)}`,
      ref: proposalId,
      path: result.path,
    });
    ctx.write(
      `applied ${proposalId} → task ${result.task.id} (proposal → ${opts?.resolve ? "resolved" : "claimed"})`,
    );
    ctx.write(`remediation: ${result.remediationPath}`);
    ctx.write(`path: ${result.path.join(" → ")}`);
    ctx.write(`next: cox cx task ${name} ${result.task.id} in_progress`);
    if (!opts?.resolve) {
      ctx.write(`next: cox cx task ${name} ${result.task.id} done  # auto-resolves proposal`);
      ctx.write(`next: cox cx proposal ${name} ${proposalId} resolved`);
    }
    return 0;
  } catch (e) {
    ctx.write(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

export async function runCxTasks(
  ctx: CxCommandContext,
  name: string,
  opts: { all?: boolean; status?: "pending" | "in_progress" | "done" | "cancelled" } = {},
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const tasks = await loadCxTasks(rt.workspace, name);
  const rollup = summarizeTasks(tasks);
  ctx.write(
    `tasks ${name}: open=${rollup.open} pending=${rollup.pending} in_progress=${rollup.in_progress} done=${rollup.done} cancelled=${rollup.cancelled} total=${rollup.total}`,
  );

  let list = tasks;
  if (opts.status) {
    list = tasks.filter((t) => t.status === opts.status);
  } else if (!opts.all) {
    list = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  }
  const label = opts.status ?? (opts.all ? "all" : "open");
  if (list.length === 0) {
    ctx.write(`(no ${label} tasks for ${name})`);
    return 0;
  }
  for (const t of list) {
    ctx.write(
      `${t.id}  [${t.status}] ${t.targetId ?? "-"}  ${t.nbaAction ?? "-"}  ${t.title}`,
    );
    if (t.sourceProposalId) {
      const rem = remediationFilePath(rt.workspace, name, t.sourceProposalId);
      ctx.write(`  proposal=${t.sourceProposalId} remediation=${rem}`);
    }
  }
  ctx.write(`path: load_tasks → emit`);
  return 0;
}

export async function runCxTaskTransition(
  ctx: CxCommandContext,
  name: string,
  taskId: string,
  status: "pending" | "in_progress" | "done" | "cancelled",
  opts?: { resolveSource?: boolean },
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const next = await transitionTask(rt.workspace, name, taskId, status, {
    resolveSource: opts?.resolveSource,
  });
  if (!next) {
    ctx.write(`task ${taskId} not found`);
    return 1;
  }
  ctx.write(`${next.id} → ${next.status}`);
  if (status === "done" && next.sourceProposalId && opts?.resolveSource !== false) {
    ctx.write(`source proposal ${next.sourceProposalId} → resolved (default)`);
  }
  await appendAuditEvent(rt.workspace, {
    kind: "task_transition",
    specName: name,
    message: `${taskId} → ${status}`,
    ref: taskId,
    path: ["load_tasks", `transition:${status}`, "emit"],
  });
  ctx.write(`path: load_tasks → transition:${status} → emit`);
  return 0;
}

export async function runCxBoard(ctx: CxCommandContext): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const board = await buildOpsBoard(rt.workspace);
  ctx.write(
    `CXOS board  specs=${board.totals.specs} deployed=${board.totals.deployedSpecs} proposals_open=${board.totals.proposalsOpen} tasks_open=${board.totals.tasksOpen} daemons=${board.totals.daemonsRunning}`,
  );
  if (board.rows.length === 0) {
    ctx.write("(no CX specs — cox cx new <name> or cox cx init)");
    return 0;
  }
  for (const r of board.rows) {
    const ph = `R=${r.phases.requirements[0]} D=${r.phases.design[0]} T=${r.phases.tasks[0]}`;
    ctx.write(
      `${r.name}  [${ph}] deps=${r.deployments.join(",") || "-"} prop=${r.proposalsOpen}+${r.proposalsClaimed}c tasks_open=${r.tasksOpen} done=${r.tasksDone} daemon=${r.daemonRunning ? "up" : "off"}`,
    );
    ctx.write(`  idea: ${r.idea.slice(0, 80)}`);
  }
  ctx.write(`path: ${board.path.join(" → ")}`);
  return 0;
}

export async function runCxBrief(
  ctx: CxCommandContext,
  name: string,
  outFile?: string,
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const record = await loadCxWorkspace(rt.workspace, name);
  if (!record) {
    ctx.write(`CX spec "${name}" not found`);
    return 1;
  }
  const depsFile = await loadDeployments(rt.workspace, name);
  const proposals = await loadProposals(rt.workspace, name);
  const tasks = await loadCxTasks(rt.workspace, name);
  const md = renderExecBrief({
    name,
    record,
    deployments: depsFile.deployments,
    proposals,
    tasks,
    generatedAt: rt.workspace.now(),
  });
  if (outFile) {
    const dest = resolve(ctx.cwd, outFile);
    await writeFile(dest, md, "utf8");
    ctx.write(`wrote brief ${dest}`);
  } else {
    for (const line of md.split("\n")) ctx.write(line);
  }
  ctx.write(`path: load_workspace → render_brief → emit`);
  return 0;
}

export async function runCxCabExport(
  ctx: CxCommandContext,
  name: string,
  outDirRaw?: string,
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const out = outDirRaw?.trim() || join("cx-cab", name);
  try {
    const result = await exportCabPackage(rt.workspace, name, out, ctx.cwd);
    await appendAuditEvent(rt.workspace, {
      kind: "cab_export",
      specName: name,
      message: result.outDir,
      path: result.path,
    });
    ctx.write(`CAB package for "${name}"`);
    ctx.write(`out: ${result.outDir}`);
    ctx.write(`files: ${result.files.join(", ")}`);
    ctx.write(`path: ${result.path.join(" → ")}`);
    ctx.write(`next: review MANIFEST.md + aws/APPLY.md (human CFN only)`);
    return 0;
  } catch (e) {
    ctx.write(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

export async function runCxAudit(
  ctx: CxCommandContext,
  name: string,
  limitRaw?: string,
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const limit = Math.max(1, Number(limitRaw ?? 30) || 30);
  const events = await loadAuditEvents(rt.workspace, name, limit);
  if (events.length === 0) {
    ctx.write(`(no audit events for ${name})`);
    return 0;
  }
  ctx.write(`audit ${name} (last ${events.length})`);
  for (const e of events) {
    ctx.write(`${e.at}  ${e.kind}  ${e.ref ?? "-"}  ${e.message}`);
  }
  ctx.write(`path: load_audit → emit`);
  return 0;
}

export async function runCxJourneys(ctx: CxCommandContext, packRaw?: string): Promise<number> {
  const pack = packOf(packRaw === "default" ? "default" : packRaw ?? "local");
  const inv = listJourneys(pack);
  ctx.write(`CXOS journeys  pack=${inv.pack}  count=${inv.journeys.length}`);
  for (const j of inv.journeys) {
    ctx.write(
      `${j.id}  stages=${j.stages.length}  terminal=${j.terminalStages.join(",") || "-"}  triggers=${j.triggerIntents.slice(0, 4).join(",")}`,
    );
  }
  ctx.write(`path: ${inv.path.join(" → ")}`);
  return 0;
}

export async function runCxInit(ctx: CxCommandContext): Promise<number> {
  const rt = await runtimeFrom(ctx);
  await mkdir(rt.workspace.cxRoot, { recursive: true });
  const names = await listCxSpecs(rt.workspace);
  ctx.write(`CXOS workspace ready: ${rt.workspace.cxRoot}`);
  if (names.length === 0) {
    const rec = await createCxSpec(
      rt.workspace,
      "starter",
      "starter CX program — replace idea and run build",
    );
    ctx.write(`seeded sample spec "starter" (${rec.spec.requirements.length} requirements)`);
    ctx.write(`next: cox cx approve starter && cox cx build starter`);
    ctx.write(`next: cox cx run starter "your idea"`);
  } else {
    ctx.write(`existing specs: ${names.join(", ")}`);
    ctx.write(`next: cox cx board`);
  }
  ctx.write(`path: ensure_cx_root → seed_optional → emit`);
  return 0;
}

/** Alias for apply — claim language for ops leads. */
export async function runCxClaim(
  ctx: CxCommandContext,
  name: string,
  proposalId: string,
  opts?: { resolve?: boolean },
): Promise<number> {
  return runCxApply(ctx, name, proposalId, opts);
}

/**
 * One-shot operate: doctor-ish wiring print + console tick + board line for this spec.
 */
export async function runCxOperate(
  ctx: CxCommandContext,
  name: string,
  targetsRaw?: string,
): Promise<number> {
  ctx.write(`CXOS operate ${name}`);
  const code = await runCxConsole(ctx, name, targetsRaw);
  const rt = await runtimeFrom(ctx);
  const board = await buildOpsBoard(rt.workspace);
  const row = board.rows.find((r) => r.name === name);
  if (row) {
    ctx.write(
      `board ${name}: prop_open=${row.proposalsOpen} claimed=${row.proposalsClaimed} tasks_open=${row.tasksOpen} daemon=${row.daemonRunning ? "up" : "off"}`,
    );
  }
  ctx.write(`next: cox cx proposals ${name}`);
  ctx.write(`next: cox cx claim ${name} <proposalId>`);
  return code;
}

export async function runCxCatalog(
  ctx: CxCommandContext,
  section: "all" | "domains" | "intents" | "kpis" | "nba" | "channels" = "all",
  packRaw?: string,
): Promise<number> {
  const pack = packOf(packRaw === "default" ? "default" : packRaw ?? "local");
  const inv = inventoryCatalog(pack);
  ctx.write(`CXOS catalog  pack=${inv.pack} v=${inv.version} source=${inv.source}`);
  if (section === "all" || section === "domains" || section === "intents") {
    for (const d of inv.domains) {
      ctx.write(`domain ${d.id}  ${d.name}  intents=${d.intentCount}`);
      if (section === "intents" || section === "all") {
        for (const i of d.intents.slice(0, section === "intents" ? 50 : 6)) {
          ctx.write(`  intent ${i.id}  ${i.name}`);
        }
      }
    }
  }
  if (section === "all" || section === "kpis") {
    ctx.write(`kpis (${inv.kpis.length}):`);
    for (const k of inv.kpis) {
      ctx.write(`  ${k.id}  ${k.name}  unit=${k.unit}`);
    }
  }
  if (section === "all" || section === "nba") {
    ctx.write(`nbaRules (${inv.nbaRules.length}):`);
    for (const r of inv.nbaRules.slice(0, 40)) {
      ctx.write(
        `  [${r.priority}] ${r.id} → ${r.action} (${r.actionType}/${r.urgency})`,
      );
    }
  }
  if (section === "all" || section === "channels") {
    ctx.write(`channels: ${inv.channels.join(", ")}`);
    ctx.write(`sentiments: ${inv.sentiments.join(", ")}`);
    ctx.write(`urgencies: ${inv.urgencies.join(", ")}`);
  }
  ctx.write(`path: ${inv.path.join(" → ")}`);
  return 0;
}

export async function runCxArchive(ctx: CxCommandContext, name: string): Promise<number> {
  const rt = await runtimeFrom(ctx);
  try {
    const r = await archiveCxSpec(rt.workspace, name);
    await appendAuditEvent(rt.workspace, {
      kind: "archive",
      specName: name,
      message: r.to,
      path: r.path,
    }).catch(() => {
      /* audit under old path may fail after rename — write to archived path via direct */
    });
    ctx.write(`archived ${name} → ${r.to}`);
    ctx.write(`path: ${r.path.join(" → ")}`);
    ctx.write(`next: cox cx restore ${name}`);
    return 0;
  } catch (e) {
    ctx.write(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

export async function runCxRestore(ctx: CxCommandContext, name: string): Promise<number> {
  const rt = await runtimeFrom(ctx);
  try {
    const r = await restoreCxSpec(rt.workspace, name);
    ctx.write(`restored ${name} ← ${r.from}`);
    ctx.write(`path: ${r.path.join(" → ")}`);
    return 0;
  } catch (e) {
    ctx.write(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

export async function runCxSnapshot(
  ctx: CxCommandContext,
  name: string,
  outDirRaw?: string,
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const out = outDirRaw?.trim() || join("cx-snapshot", name);
  try {
    const result = await snapshotCxSpec(rt.workspace, name, out, ctx.cwd);
    await appendAuditEvent(rt.workspace, {
      kind: "snapshot",
      specName: name,
      message: result.outDir,
      path: result.path,
    });
    ctx.write(`snapshot "${name}"`);
    ctx.write(`out: ${result.outDir}`);
    ctx.write(`files: ${result.files.join(", ")}`);
    ctx.write(`path: ${result.path.join(" → ")}`);
    return 0;
  } catch (e) {
    ctx.write(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

export async function runCxHealthHistory(
  ctx: CxCommandContext,
  name: string,
  limitRaw?: string,
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const limit = Math.max(1, Number(limitRaw ?? 20) || 20);
  const samples = await loadHealthHistory(rt.workspace, name, limit);
  if (samples.length === 0) {
    ctx.write(`(no health history for ${name} — run cox cx status ${name} first)`);
    return 0;
  }
  ctx.write(`health history ${name} (last ${samples.length})`);
  for (const s of samples) {
    ctx.write(
      `${s.at}  score=${s.score} healthy=${s.healthy} degraded=${s.degraded} down=${s.down} errors=${s.errors}`,
    );
  }
  ctx.write(`path: load_health_history → emit`);
  return 0;
}

/**
 * Fleet status: board rollup + optional status poll for each deployed spec (local-first).
 */
export async function runCxFleetStatus(
  ctx: CxCommandContext,
  opts?: { live?: boolean },
): Promise<number> {
  const rt = await runtimeFrom(ctx);
  const board = await buildOpsBoard(rt.workspace);
  ctx.write(
    `CXOS fleet  specs=${board.totals.specs} deployed=${board.totals.deployedSpecs} proposals_open=${board.totals.proposalsOpen} tasks_open=${board.totals.tasksOpen} daemons=${board.totals.daemonsRunning}`,
  );
  let worst = 100;
  for (const row of board.rows) {
    if (row.deployments.length === 0) {
      ctx.write(`${row.name}  (no deployments) prop=${row.proposalsOpen} tasks_open=${row.tasksOpen}`);
      continue;
    }
    // Poll health via runCxStatus silently by reusing orchestrate — call status for score
    const code = await runCxStatus(ctx, row.name, "all");
    if (code !== 0) worst = Math.min(worst, 0);
  }
  if (board.rows.length === 0) {
    ctx.write("(empty fleet — cox cx init)");
  }
  ctx.write(`path: fleet_board → status_each → emit`);
  void opts;
  return 0;
}

const EXPORT_AWS_FILES = [
  "template.yaml",
  "APPLY.md",
  "architectureDoc.json",
] as const;

/**
 * Copy plan-only AWS artifacts out of the workspace for human CFN apply.
 * Copies template.yaml, APPLY.md, and architectureDoc.json when present.
 * Default outDir: ./cx-export/<name>-aws under cwd. Never mutates AWS.
 */
export async function runCxExportAws(
  ctx: CxCommandContext,
  name: string,
  outDirRaw?: string,
): Promise<number> {
  if (!name || name.includes("/") || name.includes("..") || name.includes("\\")) {
    ctx.write(`invalid CX spec name "${name}"`);
    return 2;
  }
  const rt = await runtimeFrom(ctx);
  const awsDir = join(rt.workspace.cxRoot, name, "aws");
  const templateSrc = join(awsDir, "template.yaml");
  try {
    await access(templateSrc);
  } catch {
    ctx.write(
      `aws artifacts not found for "${name}" (run: cox cx build ${name} --target aws)`,
    );
    return 1;
  }

  const outDir = resolve(ctx.cwd, outDirRaw?.trim() || join("cx-export", `${name}-aws`));
  await mkdir(outDir, { recursive: true });

  const copied: string[] = [];
  for (const file of EXPORT_AWS_FILES) {
    const src = join(awsDir, file);
    try {
      await access(src);
      await cp(src, join(outDir, file));
      copied.push(file);
    } catch {
      // APPLY.md / architectureDoc.json may be absent; template.yaml is required above
    }
  }
  if (!copied.includes("template.yaml")) {
    ctx.write(`no template.yaml under ${awsDir}`);
    return 1;
  }

  const yaml = await readFile(join(outDir, "template.yaml"), "utf8");
  const templateOk = yaml.includes("AWSTemplateFormatVersion");

  ctx.write(`exported AWS plan-only for "${name}"`);
  ctx.write(`out: ${outDir}`);
  ctx.write(`files: ${copied.join(", ")}`);
  ctx.write(`template AWSTemplateFormatVersion: ${templateOk ? "ok" : "missing"}`);
  ctx.write(`path: load_aws_dir → copy → emit`);
  ctx.write(`next: review APPLY.md then aws cloudformation deploy (human credentials)`);
  return templateOk ? 0 : 1;
}
