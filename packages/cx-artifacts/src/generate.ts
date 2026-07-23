import type {
  CxArchitectureDoc,
  CxArtifact,
  CxTargetId,
  IntentTaxonomy,
  JourneyMap,
  KpiFrame,
  NbaRuleSet,
  Persona,
} from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

function unsupportedKind(kind: CxArtifact["kind"], targetId: CxTargetId): never {
  throw createCxAdapterError({
    message: `cx-artifacts does not generate "${kind}" artifacts`,
    targetId,
    phase: "build",
    retryable: false,
  });
}

export function promptFor(kind: CxArtifact["kind"], specName: string, requirementsText: string): string {
  const base = `Spec: ${specName}\nRequirements:\n${requirementsText}\n\n`;
  switch (kind) {
    case "journeyMap":
      return `${base}Produce a JSON object with fields "name" (string) and "stages" (array of {id, name, description, touchpoints: string[]}) describing the customer journey for this spec. Respond with JSON only.`;
    case "persona":
      return `${base}Produce a JSON object with fields "name" (string), "goals" (string[]), and "painPoints" (string[]) describing the primary customer persona for this spec. Respond with JSON only.`;
    case "intentTaxonomy":
      return `${base}Produce a JSON object with field "domains" (array of {name, intents: string[]}) describing the intent taxonomy for this spec. Respond with JSON only.`;
    case "nbaRuleSet":
      return `${base}Produce a JSON object with field "rules" (array of {id, condition, action, priority: number}) describing the next-best-action rules for this spec. Respond with JSON only.`;
    case "kpiFrame":
      return `${base}Produce a JSON object with field "metrics" (array of {name, target: number, unit}) describing the KPI frame for this spec. Respond with JSON only.`;
    case "architectureDoc":
      return `${base}Produce a JSON object with fields "title" (string) and "markdown" (string) describing the CX architecture for this spec. Respond with JSON only.`;
    case "agentDefinition":
      return unsupportedKind(kind, "artifacts");
  }
}

function shapeError(kind: CxArtifact["kind"], targetId: CxTargetId): never {
  throw createCxAdapterError({
    message: `cx-artifacts: response for "${kind}" is missing required fields`,
    targetId,
    phase: "build",
    retryable: false,
  });
}

export function parseArtifact(
  kind: CxArtifact["kind"],
  raw: string,
  ctx: { specName: string; targetId: CxTargetId },
): CxArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw createCxAdapterError({
      message: `cx-artifacts: malformed JSON generating "${kind}": ${raw.slice(0, 200)}`,
      targetId: ctx.targetId,
      phase: "build",
      retryable: false,
    });
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw createCxAdapterError({
      message: `cx-artifacts: expected a JSON object generating "${kind}", got ${typeof parsed}`,
      targetId: ctx.targetId,
      phase: "build",
      retryable: false,
    });
  }
  const p = parsed as Record<string, unknown>;
  const provenance = { specName: ctx.specName, phase: "design" as const, targetId: ctx.targetId };

  switch (kind) {
    case "journeyMap": {
      if (typeof p.name !== "string" || !Array.isArray(p.stages)) shapeError(kind, ctx.targetId);
      const artifact: JourneyMap = {
        kind,
        id: kind,
        provenance,
        name: p.name as string,
        stages: p.stages as JourneyMap["stages"],
      };
      return artifact;
    }
    case "persona": {
      if (typeof p.name !== "string" || !Array.isArray(p.goals) || !Array.isArray(p.painPoints)) {
        shapeError(kind, ctx.targetId);
      }
      const artifact: Persona = {
        kind,
        id: kind,
        provenance,
        name: p.name as string,
        goals: p.goals as string[],
        painPoints: p.painPoints as string[],
      };
      return artifact;
    }
    case "intentTaxonomy": {
      if (!Array.isArray(p.domains)) shapeError(kind, ctx.targetId);
      const artifact: IntentTaxonomy = {
        kind,
        id: kind,
        provenance,
        domains: p.domains as IntentTaxonomy["domains"],
      };
      return artifact;
    }
    case "nbaRuleSet": {
      if (!Array.isArray(p.rules)) shapeError(kind, ctx.targetId);
      const artifact: NbaRuleSet = {
        kind,
        id: kind,
        provenance,
        rules: p.rules as NbaRuleSet["rules"],
      };
      return artifact;
    }
    case "kpiFrame": {
      if (!Array.isArray(p.metrics)) shapeError(kind, ctx.targetId);
      const artifact: KpiFrame = {
        kind,
        id: kind,
        provenance,
        metrics: p.metrics as KpiFrame["metrics"],
      };
      return artifact;
    }
    case "architectureDoc": {
      if (typeof p.title !== "string" || typeof p.markdown !== "string") shapeError(kind, ctx.targetId);
      const artifact: CxArchitectureDoc = {
        kind,
        id: kind,
        provenance,
        title: p.title as string,
        markdown: p.markdown as string,
      };
      return artifact;
    }
    case "agentDefinition":
      return unsupportedKind(kind, ctx.targetId);
  }
}
