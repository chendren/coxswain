/**
 * Deterministic offline adapters — full CXOS loop without live platform/AWS.
 * Strong-graph matching only; optional generate hook for weak extraction.
 */
import type { Tier } from "@cox/core";
import type {
  AgentDefinition,
  CxArtifact,
  CxBuildPlan,
  CxDeployment,
  CxHealth,
  CxOntology,
  CxSimReport,
  CxSpec,
  CxTargetAdapter,
  CxTrafficProfile,
  JourneyMap,
  KpiFrame,
} from "@cox/cx-core";
import {
  DEFAULT_ONTOLOGY,
  LOCAL_PLATFORM_ONTOLOGY,
  buildStrongGraph,
  createCxAdapterError,
  hasJourney,
  hubKey,
  listJourneyIds,
  listKpiIds,
  resolveLabel,
} from "@cox/cx-core";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface OfflineDiskDeps {
  cxRoot: string;
  now: () => string;
  generate?: (prompt: string, tier: Tier) => Promise<string>;
  ontology?: CxOntology;
}

async function writeJson(dir: string, file: string, data: unknown): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), JSON.stringify(data, null, 2), "utf8");
}

function matchJourneyOffline(map: JourneyMap, ontology: CxOntology): string {
  const graph = buildStrongGraph(ontology);
  const byId = resolveLabel(graph, "journey", map.id);
  if (byId) return byId.id;
  const byName = resolveLabel(graph, "journey", map.name);
  if (byName) return byName.id;

  // hub-key scan
  const key = hubKey(map.name);
  for (const id of listJourneyIds(ontology)) {
    const j = ontology.journeys.find((x) => x.id === id);
    if (j && hubKey(j.name) === key) return id;
  }

  // commercial defaults present on local platform pack
  for (const preferred of [
    "billing_dispute",
    "technical_troubleshooting",
    "new_account_setup",
    "churn_prevention",
    "service_upgrade",
  ]) {
    if (hasJourney(ontology, preferred)) return preferred;
  }
  const first = listJourneyIds(ontology)[0];
  if (!first) {
    throw createCxAdapterError({
      message: "offline local: ontology has no journeys",
      targetId: "local",
      phase: "build",
      retryable: false,
    });
  }
  return first;
}

function defaultKpis(specName: string, ontology: CxOntology): KpiFrame {
  const ids = listKpiIds(ontology).slice(0, 4);
  return {
    kind: "kpiFrame",
    id: "kpiFrame",
    provenance: { specName, phase: "design", targetId: "local" },
    metrics: ids.map((id, i) => {
      const def = ontology.kpis.find((k) => k.id === id)!;
      return {
        name: id,
        target: id.includes("rate") || id === "csat" ? 90 - i : 100 + i * 10,
        unit: String(def.unit),
      };
    }),
  };
}

/** Offline local: bind journey via strong graph, disk deploy, synthetic sim. */
export function createOfflineLocalAdapter(deps: OfflineDiskDeps): CxTargetAdapter {
  const ontology = deps.ontology ?? LOCAL_PLATFORM_ONTOLOGY;
  const root = (specName: string) => join(deps.cxRoot, specName, "local");

  return {
    id: "local",
    capabilities: () => ["build", "deploy", "status", "simulate", "teardown"],

    async plan(spec: CxSpec): Promise<CxBuildPlan> {
      const journeyMap = spec.design?.journeyMaps[0];
      if (!journeyMap) {
        throw createCxAdapterError({
          message: `offline local: spec "${spec.state.name}" has no design.journeyMaps — build artifacts first`,
          targetId: "local",
          phase: "plan",
          retryable: false,
        });
      }
      return {
        targetId: "local",
        specName: spec.state.name,
        steps: [
          {
            id: "bind",
            description: JSON.stringify({ journeyMap }),
            producesArtifactKind: "agentDefinition",
          },
        ],
      };
    },

    async build(plan: CxBuildPlan): Promise<CxArtifact[]> {
      const step = plan.steps[0];
      if (!step) {
        throw createCxAdapterError({
          message: "offline local: empty plan",
          targetId: "local",
          phase: "build",
          retryable: false,
        });
      }
      const { journeyMap } = JSON.parse(step.description) as { journeyMap: JourneyMap };
      const journeyType = matchJourneyOffline(journeyMap, ontology);

      let kpiFrame = defaultKpis(plan.specName, ontology);
      if (deps.generate) {
        try {
          const raw = await deps.generate(
            `Produce JSON {"metrics":[{"name","target","unit"}]} using ONLY names: ${listKpiIds(ontology).join(", ")}. Journey: ${journeyType}. JSON only.`,
            "builder",
          );
          const parsed = JSON.parse(raw) as { metrics?: KpiFrame["metrics"] };
          if (Array.isArray(parsed.metrics) && parsed.metrics.length > 0) {
            const allowed = new Set(listKpiIds(ontology));
            const metrics = parsed.metrics.filter((m) => allowed.has(m.name));
            if (metrics.length > 0) {
              kpiFrame = {
                kind: "kpiFrame",
                id: "kpiFrame",
                provenance: { specName: plan.specName, phase: "design", targetId: "local" },
                metrics,
              };
            }
          }
        } catch {
          // keep defaults
        }
      }

      const agentDefinition: AgentDefinition = {
        kind: "agentDefinition",
        id: "agentDefinition",
        provenance: { specName: plan.specName, phase: "design", targetId: "local" },
        name: `${journeyType} agent`,
        systemPrompt: `You handle the ${journeyType} journey (offline CXOS bind via strong graph).`,
        tools: ["classify", "nba-lookup"],
      };

      const localJourney: JourneyMap = {
        ...journeyMap,
        id: journeyType,
        provenance: { specName: plan.specName, phase: "design", targetId: "local" },
      };

      return [agentDefinition, localJourney, kpiFrame];
    },

    async deploy(artifacts: CxArtifact[]): Promise<CxDeployment> {
      const specName = artifacts[0]?.provenance.specName;
      if (!specName) {
        throw createCxAdapterError({
          message: "offline local: deploy with no artifacts",
          targetId: "local",
          phase: "deploy",
          retryable: false,
        });
      }
      const dir = root(specName);
      const resources = [];
      for (const a of artifacts) {
        await writeJson(dir, `${a.id}.json`, a);
        resources.push({ id: a.id, kind: "offline-local-file", createdAt: deps.now() });
      }
      return {
        targetId: "local",
        specName,
        deployedAt: deps.now(),
        resources,
      };
    },

    async status(dep: CxDeployment): Promise<CxHealth> {
      let missing = 0;
      for (const r of dep.resources) {
        try {
          await readFile(join(root(dep.specName), `${r.id}.json`), "utf8");
        } catch {
          missing++;
        }
      }
      const total = dep.resources.length;
      return {
        targetId: "local",
        level: missing === 0 ? "healthy" : missing === total ? "down" : "degraded",
        metrics: [
          { name: "artifactCount", value: total - missing, unit: "count" },
          { name: "missingCount", value: missing, unit: "count" },
          { name: "activeJourneys", value: missing === 0 ? 1 : 0, unit: "count" },
        ],
        checkedAt: deps.now(),
      };
    },

    async simulate(dep: CxDeployment, traffic: CxTrafficProfile): Promise<CxSimReport> {
      let metrics: KpiFrame["metrics"] = [];
      try {
        const raw = JSON.parse(
          await readFile(join(root(dep.specName), "kpiFrame.json"), "utf8"),
        ) as KpiFrame;
        metrics = raw.metrics ?? [];
      } catch {
        metrics = defaultKpis(dep.specName, ontology).metrics;
      }
      const outcomes = metrics.map((m) => ({
        kpiName: m.name,
        achieved: m.target * (0.85 + traffic.volumePerMinute * 0.001),
        target: m.target,
      }));
      return {
        targetId: "local",
        profile: traffic,
        outcomes,
        ranAt: deps.now(),
      };
    },

    async teardown(dep: CxDeployment): Promise<void> {
      await rm(root(dep.specName), { recursive: true, force: true });
    },
  };
}

/** Offline AWS: plan-only style CFN/architecture docs on disk, no live mutate. */
export function createOfflineAwsAdapter(deps: OfflineDiskDeps): CxTargetAdapter {
  const ontology = deps.ontology ?? DEFAULT_ONTOLOGY;
  const root = (specName: string) => join(deps.cxRoot, specName, "aws");

  return {
    id: "aws",
    capabilities: () => ["build", "deploy", "status", "teardown"],

    async plan(spec: CxSpec): Promise<CxBuildPlan> {
      const journeyMap = spec.design?.journeyMaps[0];
      if (!journeyMap) {
        throw createCxAdapterError({
          message: `offline aws: spec "${spec.state.name}" has no design.journeyMaps — build artifacts first`,
          targetId: "aws",
          phase: "plan",
          retryable: false,
        });
      }
      const description = JSON.stringify({ journeyMap });
      return {
        targetId: "aws",
        specName: spec.state.name,
        steps: [
          { id: "architectureDoc", description, producesArtifactKind: "architectureDoc" },
          { id: "agentDefinition", description, producesArtifactKind: "agentDefinition" },
        ],
      };
    },

    async build(plan: CxBuildPlan): Promise<CxArtifact[]> {
      const step = plan.steps[0];
      if (!step) {
        throw createCxAdapterError({
          message: "offline aws: empty plan",
          targetId: "aws",
          phase: "build",
          retryable: false,
        });
      }
      const { journeyMap } = JSON.parse(step.description) as { journeyMap: JourneyMap };
      const journeyType = matchJourneyOffline(journeyMap, ontology);

      const architectureDoc = {
        kind: "architectureDoc" as const,
        id: "architectureDoc",
        provenance: {
          specName: plan.specName,
          phase: "design" as const,
          targetId: "aws" as const,
        },
        title: `AWS CX stack for ${journeyType}`,
        markdown: [
          `# AWS CX plan-only architecture`,
          ``,
          `Journey: **${journeyType}** (strong-graph bind)`,
          ``,
          `## Resources (plan-only, no live mutation)`,
          `- Amazon Connect contact flow skeleton`,
          `- Lex intent bot mapped to ontology intents`,
          `- Bedrock agent definition (offline)`,
          ``,
          `## Stages`,
          ...journeyMap.stages.map((s) => `- ${s.id}: ${s.name}`),
        ].join("\n"),
      };

      const agentDefinition: AgentDefinition = {
        kind: "agentDefinition",
        id: "agentDefinition",
        provenance: { specName: plan.specName, phase: "design", targetId: "aws" },
        name: `${journeyType}-bedrock-agent`,
        systemPrompt: `AWS offline agent for ${journeyType}. Use closed ontology only.`,
        tools: ["connect-transfer", "lex-fulfill", "knowledge-query"],
      };

      return [architectureDoc, agentDefinition];
    },

    async deploy(artifacts: CxArtifact[]): Promise<CxDeployment> {
      const specName = artifacts[0]?.provenance.specName;
      if (!specName) {
        throw createCxAdapterError({
          message: "offline aws: deploy with no artifacts",
          targetId: "aws",
          phase: "deploy",
          retryable: false,
        });
      }
      const dir = root(specName);
      const resources = [];
      for (const a of artifacts) {
        await writeJson(dir, `${a.id}.json`, a);
        resources.push({ id: a.id, kind: "offline-aws-file", createdAt: deps.now() });
      }
      return { targetId: "aws", specName, deployedAt: deps.now(), resources };
    },

    async status(dep: CxDeployment): Promise<CxHealth> {
      let missing = 0;
      for (const r of dep.resources) {
        try {
          await readFile(join(root(dep.specName), `${r.id}.json`), "utf8");
        } catch {
          missing++;
        }
      }
      const total = dep.resources.length;
      return {
        targetId: "aws",
        level: missing === 0 ? "healthy" : missing === total ? "down" : "degraded",
        metrics: [
          { name: "artifactCount", value: total - missing, unit: "count" },
          { name: "missingCount", value: missing, unit: "count" },
          { name: "liveMutation", value: 0, unit: "flag" },
        ],
        checkedAt: deps.now(),
      };
    },

    async simulate(): Promise<CxSimReport> {
      throw createCxAdapterError({
        message: "offline aws: simulate not supported (plan-only)",
        targetId: "aws",
        phase: "simulate",
        retryable: false,
      });
    },

    async teardown(dep: CxDeployment): Promise<void> {
      await rm(root(dep.specName), { recursive: true, force: true });
    },
  };
}
