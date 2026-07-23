import type { Tier } from "@cox/core";
import type {
  AgentDefinition,
  CxArtifact,
  CxBuildPlan,
  CxDeployment,
  CxHealth,
  CxSimReport,
  CxSpec,
  CxTargetAdapter,
  CxTrafficProfile,
} from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";
import { getJson, postJson, type LocalPlatformClientDeps } from "./client";
import { readArtifacts, removeArtifacts, writeArtifacts, type DiskDeps } from "./disk";
import { kpiPrompt, parseKpiFrame } from "./kpi";
import { matchPrompt, parseMatch } from "./match";
import { buildPlan } from "./plan";
import { generateSyntheticEvents } from "./simulate-traffic";

export interface LocalAdapterDeps extends DiskDeps, LocalPlatformClientDeps {
  generate: (prompt: string, tier: Tier) => Promise<string>;
  randomFn: () => number;
}

interface BindStepPayload {
  journeyMap: Extract<CxArtifact, { kind: "journeyMap" }>;
}

export function createLocalAdapter(deps: LocalAdapterDeps): CxTargetAdapter {
  return {
    id: "local",

    capabilities: () => ["build", "deploy", "status", "simulate", "teardown"],

    async plan(spec: CxSpec): Promise<CxBuildPlan> {
      return buildPlan(spec);
    },

    async build(plan: CxBuildPlan): Promise<CxArtifact[]> {
      const step = plan.steps[0];
      if (!step) {
        throw createCxAdapterError({
          message: "cx-local: build() called with an empty plan",
          targetId: "local",
          phase: "build",
          retryable: false,
        });
      }
      const { journeyMap } = JSON.parse(step.description) as BindStepPayload;

      const matchRaw = await deps.generate(matchPrompt(journeyMap), "scout");
      const journeyType = parseMatch(matchRaw, "local");

      const kpiRaw = await deps.generate(kpiPrompt(journeyType), "builder");
      const kpiFrame = parseKpiFrame(kpiRaw, plan.specName, "local");

      const agentDefinition: AgentDefinition = {
        kind: "agentDefinition",
        id: "agentDefinition",
        provenance: { specName: plan.specName, phase: "design", targetId: "local" },
        name: `${journeyType} agent`,
        systemPrompt: `You handle the ${journeyType} journey for the local omnichannel platform.`,
        tools: ["classify", "nba-lookup"],
      };

      const localJourneyMap: CxArtifact = {
        ...journeyMap,
        provenance: { specName: plan.specName, phase: "design", targetId: "local" },
      };

      return [agentDefinition, localJourneyMap, kpiFrame];
    },

    async deploy(artifacts: CxArtifact[]): Promise<CxDeployment> {
      const specName = artifacts[0]?.provenance.specName;
      if (!specName) {
        throw createCxAdapterError({
          message: "cx-local: deploy() called with no artifacts",
          targetId: "local",
          phase: "deploy",
          retryable: false,
        });
      }
      const agentDef = artifacts.find((a): a is AgentDefinition => a.kind === "agentDefinition");
      const journeyType = agentDef?.name.split(" ")[0];
      const definitions = (await getJson(deps, "/api/journeys/definitions", "deploy")) as Record<string, unknown>;
      if (!journeyType || !(journeyType in definitions)) {
        throw createCxAdapterError({
          message: `cx-local: matched journey type "${String(journeyType)}" no longer exists in the platform's live definitions`,
          targetId: "local",
          phase: "deploy",
          retryable: false,
        });
      }
      return writeArtifacts(deps, "local", specName, artifacts);
    },

    async status(dep: CxDeployment): Promise<CxHealth> {
      // Deployment state is disk-backed (see writeArtifacts/removeArtifacts);
      // confirm the deployment's artifacts still exist before reporting
      // health, so status() on a torn-down deployment rejects instead of
      // silently reporting the platform's general health.
      try {
        await readArtifacts(deps, dep);
      } catch {
        throw createCxAdapterError({
          message: `cx-local: deployment for spec "${dep.specName}" was not found on disk (has it been torn down?)`,
          targetId: "local",
          phase: "status",
          retryable: false,
        });
      }

      await getJson(deps, "/api/health/ready", "status");
      const journeys = (await getJson(deps, "/api/journeys", "status")) as { stats?: Record<string, { active?: number }> };
      const active = journeys.stats
        ? Object.values(journeys.stats).reduce((sum, s) => sum + (s.active ?? 0), 0)
        : 0;
      return {
        targetId: "local",
        level: "healthy",
        metrics: [{ name: "activeJourneys", value: active, unit: "count" }],
        checkedAt: deps.now(),
      };
    },

    async simulate(dep: CxDeployment, traffic: CxTrafficProfile): Promise<CxSimReport> {
      const artifacts = await readArtifacts(deps, dep);
      const kpiFrame = artifacts.find((a): a is Extract<CxArtifact, { kind: "kpiFrame" }> => a.kind === "kpiFrame");
      const agentDef = artifacts.find((a): a is AgentDefinition => a.kind === "agentDefinition");
      const journeyType = agentDef?.name.split(" ")[0] ?? "unknown";

      const events = generateSyntheticEvents(traffic, journeyType, deps.randomFn);
      await postJson(deps, "/api/events/batch", { events }, "simulate");

      const kpis = (await getJson(deps, "/api/dashboard/kpis", "simulate")) as Record<string, unknown>;
      const outcomes = (kpiFrame?.metrics ?? []).map((m) => {
        const value = kpis[m.name];
        return {
          kpiName: m.name,
          achieved: typeof value === "number" ? value : 0,
          target: m.target,
        };
      });

      return { targetId: "local", profile: traffic, outcomes, ranAt: deps.now() };
    },

    async teardown(dep: CxDeployment): Promise<void> {
      return removeArtifacts(deps, dep);
    },
  };
}
