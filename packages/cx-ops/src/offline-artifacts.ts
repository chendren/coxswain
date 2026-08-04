/**
 * Deterministic offline artifacts adapter — closed-world design pack without LLM.
 * When `generate` is provided, prefers model JSON then absorbs via strong graph.
 */
import type { Tier } from "@cox/core";
import type {
  CxArchitectureDoc,
  CxArtifact,
  CxBuildPlan,
  CxDeployment,
  CxHealth,
  CxOntology,
  CxSimReport,
  CxSpec,
  CxTargetAdapter,
  IntentTaxonomy,
  JourneyMap,
  KpiFrame,
  NbaRuleSet,
  Persona,
} from "@cox/cx-core";
import {
  DEFAULT_ONTOLOGY,
  createCxAdapterError,
  listIntentIds,
  listKpiIds,
  runClosedWorldPass,
} from "@cox/cx-core";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface OfflineArtifactsDeps {
  cxRoot: string;
  now: () => string;
  generate?: (prompt: string, tier: Tier) => Promise<string>;
  ontology?: CxOntology;
}

function dir(deps: OfflineArtifactsDeps, specName: string): string {
  return join(deps.cxRoot, specName, "artifacts");
}

function seedArtifacts(spec: CxSpec, ontology: CxOntology): CxArtifact[] {
  const prov = {
    specName: spec.state.name,
    phase: "design" as const,
    targetId: "artifacts" as const,
  };
  const idea = spec.requirements[0]?.text ?? spec.state.name;

  const journeyMap: JourneyMap = {
    kind: "journeyMap",
    id: "billing_dispute",
    provenance: prov,
    name: idea.includes("dispute") ? "Billing Dispute Resolution" : "Primary CX Journey",
    stages: [
      {
        id: "initiated",
        name: "Initiated",
        description: "Customer raises the issue",
        touchpoints: ["chat", "phone"],
      },
      {
        id: "under_review",
        name: "Under Review",
        description: "Investigation in progress",
        touchpoints: ["agent"],
      },
      {
        id: "resolved",
        name: "Resolved",
        description: "Issue closed",
        touchpoints: ["chat"],
      },
    ],
  };

  const persona: Persona = {
    kind: "persona",
    id: "persona",
    provenance: prov,
    name: "Frustrated account holder",
    goals: ["Fast resolution", "Clear explanation"],
    painPoints: ["Repeat contacts", "Opaque billing"],
  };

  const billingIntents = listIntentIds(ontology).filter((i) => i.startsWith("billing."));
  const intentTaxonomy: IntentTaxonomy = {
    kind: "intentTaxonomy",
    id: "intentTaxonomy",
    provenance: prov,
    domains: [
      {
        id: "billing",
        name: "Billing",
        intents: (billingIntents.length
          ? billingIntents
          : ["billing.payment_issue", "billing.billing_inquiry"]
        ).map((full) => {
          const local = full.includes(".") ? full.slice(full.indexOf(".") + 1) : full;
          return { id: local, name: local };
        }),
      },
    ],
  };

  const nbaRuleSet: NbaRuleSet = {
    kind: "nbaRuleSet",
    id: "nbaRuleSet",
    provenance: prov,
    rules: ontology.nbaRules.slice(0, 5).map((r) => ({
      id: r.id,
      condition: r.conditions.map((c) => `${c.field} ${c.op} ${JSON.stringify(c.value)}`).join(` ${r.logic} `),
      action: r.action,
      priority: r.priority,
    })),
  };

  const kpiFrame: KpiFrame = {
    kind: "kpiFrame",
    id: "kpiFrame",
    provenance: prov,
    metrics: listKpiIds(ontology)
      .slice(0, 4)
      .map((id, i) => {
        const def = ontology.kpis.find((k) => k.id === id)!;
        return {
          name: id,
          target: id.includes("rate") || id === "csat" ? 92 - i : 120 + i * 5,
          unit: String(def.unit),
        };
      }),
  };

  const architectureDoc: CxArchitectureDoc = {
    kind: "architectureDoc",
    id: "architectureDoc",
    provenance: prov,
    title: `CX architecture for ${spec.state.name}`,
    markdown: [
      `# ${spec.state.name}`,
      ``,
      idea,
      ``,
      `Closed-world ontology ${ontology.version}.`,
      `Intents: ${listIntentIds(ontology).length}; journeys: ${ontology.journeys.length}.`,
    ].join("\n"),
  };

  return [journeyMap, persona, intentTaxonomy, nbaRuleSet, kpiFrame, architectureDoc];
}

export function createOfflineArtifactsAdapter(deps: OfflineArtifactsDeps): CxTargetAdapter {
  const ontology = deps.ontology ?? DEFAULT_ONTOLOGY;

  return {
    id: "artifacts",
    capabilities: () => ["build", "deploy", "status", "teardown"],

    async plan(spec: CxSpec): Promise<CxBuildPlan> {
      return {
        targetId: "artifacts",
        specName: spec.state.name,
        steps: [
          "journeyMap",
          "persona",
          "intentTaxonomy",
          "nbaRuleSet",
          "kpiFrame",
          "architectureDoc",
        ].map((kind) => ({
          id: kind,
          description: "offline deterministic seed",
          producesArtifactKind: kind as CxArtifact["kind"],
        })),
      };
    },

    async build(plan: CxBuildPlan): Promise<CxArtifact[]> {
      // Seed always; optional generate ignored for full determinism in offline path.
      // Spec name recovered from plan.
      const fakeSpec: CxSpec = {
        state: {
          name: plan.specName,
          createdAt: deps.now(),
          phases: { requirements: "approved", design: "draft", tasks: "missing" },
          tasks: [],
          approvals: [],
        },
        requirements: [{ id: "R1.1", text: plan.steps[0]?.description ?? plan.specName }],
      };
      const seeded = seedArtifacts(fakeSpec, ontology);
      const out: CxArtifact[] = [];
      for (const a of seeded) {
        if (a.kind === "kpiFrame" || a.kind === "intentTaxonomy") {
          const pass = runClosedWorldPass(ontology, a, { absorb: true });
          if (!pass.state.ok || !pass.artifact) {
            throw createCxAdapterError({
              message: `offline artifacts: closed-world fail for ${a.kind}: ${pass.state.errors.join("; ")}`,
              targetId: "artifacts",
              phase: "build",
              retryable: false,
            });
          }
          out.push(pass.artifact);
        } else {
          out.push(a);
        }
      }
      return out;
    },

    async deploy(artifacts: CxArtifact[]): Promise<CxDeployment> {
      const specName = artifacts[0]?.provenance.specName;
      if (!specName) {
        throw createCxAdapterError({
          message: "offline artifacts: empty deploy",
          targetId: "artifacts",
          phase: "deploy",
          retryable: false,
        });
      }
      const d = dir(deps, specName);
      await mkdir(d, { recursive: true });
      const resources = [];
      for (const a of artifacts) {
        await writeFile(join(d, `${a.id}.json`), JSON.stringify(a, null, 2), "utf8");
        resources.push({ id: a.id, kind: "artifact-file", createdAt: deps.now() });
      }
      return { targetId: "artifacts", specName, deployedAt: deps.now(), resources };
    },

    async status(dep: CxDeployment): Promise<CxHealth> {
      let missing = 0;
      for (const r of dep.resources) {
        try {
          await readFile(join(dir(deps, dep.specName), `${r.id}.json`), "utf8");
        } catch {
          missing++;
        }
      }
      const total = dep.resources.length;
      return {
        targetId: "artifacts",
        level: missing === 0 ? "healthy" : missing === total ? "down" : "degraded",
        metrics: [
          { name: "artifactCount", value: total - missing, unit: "count" },
          { name: "missingCount", value: missing, unit: "count" },
        ],
        checkedAt: deps.now(),
      };
    },

    async simulate(): Promise<CxSimReport> {
      throw createCxAdapterError({
        message: "offline artifacts: simulate unsupported",
        targetId: "artifacts",
        phase: "simulate",
        retryable: false,
      });
    },

    async teardown(dep: CxDeployment): Promise<void> {
      await rm(dir(deps, dep.specName), { recursive: true, force: true });
    },
  };
}
