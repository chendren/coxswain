# cx-artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@cox/cx-artifacts` — the CXOS artifacts adapter, the first `CxTargetAdapter` implementation, generating and persisting the 6 target-neutral CX design artifacts.

**Architecture:** `plan.ts` (pure, deterministic step table), `generate.ts` (prompt building + JSON parsing/validation), `disk.ts` (deploy/status/teardown file I/O against an injectable root dir), `adapter.ts` (wires the three into `CxTargetAdapter`). Model calls are dependency-injected (`deps.generate`), never a direct import of `@cox/agent`.

**Contract-driven correction to the approved design:** the frozen `CxTargetAdapter.build(plan: CxBuildPlan)` signature receives only the plan, not the original `CxSpec` — so it has no direct access to `spec.requirements`. `plan()` (which *does* see the full `CxSpec`) renders the requirements into `CxBuildStep.description`, and `build()` reads that field instead of holding onto the spec. Tier-per-kind is not carried on the plan either; `build()` re-derives it from `ARTIFACT_STEP_SPECS` by `producesArtifactKind`, the same table `plan()` used — both stay in lockstep because they're the same constant.

**Tech Stack:** TypeScript 5.6+ (strict, `noUncheckedIndexedAccess`), pnpm workspace package, vitest, `node:fs/promises` for disk I/O.

## Global Constraints

- Node >= 20, pnpm workspaces, TypeScript 5.6+, vitest, ESM, no build step — packages export TS source directly.
- New code omits relative-import file extensions.
- Strict TypeScript mode with `noUncheckedIndexedAccess` — index access yields `T | undefined`.
- `cx-artifacts` depends only on `@cox/core` and `@cox/cx-core` (workspace:*) — no other `@cox/*` package, no third-party deps beyond `@types/node`.
- No classes, no default exports, no custom error class hierarchies — errors are `createCxAdapterError(...)` from `@cox/cx-core`, matching every phase's `CxAdapterErrorPhase` value (`"plan" | "build" | "deploy" | "status" | "simulate" | "teardown"`).
- No floating promises.
- Filesystem: `node:fs/promises`, all paths built via `node:path`'s `join`. Timestamps come from an injected `now: () => string` clock, never `new Date()` directly, for deterministic tests (per `docs/04-CONVENTIONS.md`).
- Tests: `pnpm --filter @cox/cx-artifacts test` (vitest), zero network, zero real `~/.cox`/`.cox` writes — disk tests use `fs.mkdtemp`. Test files under `packages/cx-artifacts/test/*.test.ts`.
- Every task must pass `pnpm --filter @cox/cx-artifacts typecheck && pnpm --filter @cox/cx-artifacts test` before commit.
- Commit message prefix: `cx-artifacts: task N — <summary>`.

---

### Task 1: Scaffold `@cox/cx-artifacts` package

**Files:**
- Create: `packages/cx-artifacts/package.json`
- Create: `packages/cx-artifacts/tsconfig.json`
- Create: `packages/cx-artifacts/src/index.ts`
- Create: `packages/cx-artifacts/NOTES.md`
- Test: `packages/cx-artifacts/test/placeholder.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: an installable, typechecked, testable empty package other tasks fill in.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@cox/cx-artifacts",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@cox/core": "workspace:*",
    "@cox/cx-core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create an empty `src/index.ts` barrel**

```ts
export {};
```

- [ ] **Step 4: Create a placeholder test**

```ts
import { describe, expect, it } from "vitest";

describe("@cox/cx-artifacts", () => {
  it("package scaffold loads", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 5: Install and verify**

Run: `pnpm install && pnpm --filter @cox/cx-artifacts typecheck && pnpm --filter @cox/cx-artifacts test`
Expected: PASS — 1 test passes, 0 type errors.

- [ ] **Step 6: Create `NOTES.md`**

```markdown
# cx-artifacts NOTES

Decisions and deviations for the integrator.

- `build(plan: CxBuildPlan)` has no access to the original `CxSpec` (the
  frozen contract only passes the plan). `plan()` renders
  `spec.requirements` into each `CxBuildStep.description`; `build()` reads
  that field instead. Tier-per-kind is re-derived from the same
  `ARTIFACT_STEP_SPECS` table `plan()` used, keyed by
  `producesArtifactKind` — not carried on the plan itself.
- `deps.generate` is the only way this package reaches a model — never
  import `@cox/agent`/`@cox/router`/`@cox/providers` directly. The real
  implementation is wired in by `@cox/cli` (a future lane); tests inject a
  scripted stub.
- `AgentDefinition` is deliberately not generated here — left to
  `cx-local`/`cx-aws`, which tailor an agent config to their own runtime.
- `simulate()` throws — a document factory has no traffic to run against.
  `capabilities()` omits it.
```

- [ ] **Step 7: Commit**

```bash
git add packages/cx-artifacts
git commit -m "cx-artifacts: task 1 — scaffold @cox/cx-artifacts package"
```

---

### Task 2: `plan.ts` — the standard 6-artifact build plan

**Files:**
- Create: `packages/cx-artifacts/src/plan.ts`
- Modify: `packages/cx-artifacts/src/index.ts`
- Test: `packages/cx-artifacts/test/plan.test.ts`

**Interfaces:**
- Consumes: `CxArtifact`, `CxBuildPlan`, `CxSpec` from `@cox/cx-core`; `Tier` from `@cox/core`.
- Produces: `ARTIFACT_STEP_SPECS: readonly { kind: CxArtifact["kind"]; tier: Tier }[]` and `buildPlan(spec: CxSpec): CxBuildPlan` — consumed by task 5's `adapter.ts` for both `plan()` and tier lookup inside `build()`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ARTIFACT_STEP_SPECS, buildPlan } from "../src/plan";
import type { CxSpec } from "@cox/cx-core";

const spec: CxSpec = {
  state: {
    name: "billing-dispute",
    createdAt: "2026-07-22T00:00:00Z",
    phases: { requirements: "approved", design: "approved", tasks: "approved" },
    tasks: [],
    approvals: [],
  },
  requirements: [
    { id: "R1.1", text: "WHEN a customer disputes a charge, THE SYSTEM SHALL resolve in <= 1 contact" },
  ],
};

describe("buildPlan", () => {
  it("returns the 6 standard artifact steps in order", () => {
    const plan = buildPlan(spec);
    expect(plan.targetId).toBe("artifacts");
    expect(plan.specName).toBe("billing-dispute");
    expect(plan.steps.map((s) => s.producesArtifactKind)).toEqual([
      "journeyMap",
      "persona",
      "intentTaxonomy",
      "nbaRuleSet",
      "kpiFrame",
      "architectureDoc",
    ]);
  });

  it("renders spec.requirements into every step's description", () => {
    const plan = buildPlan(spec);
    for (const step of plan.steps) {
      expect(step.description).toContain("R1.1: WHEN a customer disputes a charge, THE SYSTEM SHALL resolve in <= 1 contact");
    }
  });

  it("falls back to a placeholder description when there are no requirements", () => {
    const emptySpec: CxSpec = { ...spec, requirements: [] };
    const plan = buildPlan(emptySpec);
    expect(plan.steps[0]?.description).toBe("No requirements recorded.");
  });

  it("ARTIFACT_STEP_SPECS assigns architect tier to design artifacts and builder tier to rendering artifacts", () => {
    const byKind = Object.fromEntries(ARTIFACT_STEP_SPECS.map((s) => [s.kind, s.tier]));
    expect(byKind.journeyMap).toBe("architect");
    expect(byKind.persona).toBe("architect");
    expect(byKind.intentTaxonomy).toBe("architect");
    expect(byKind.nbaRuleSet).toBe("architect");
    expect(byKind.kpiFrame).toBe("builder");
    expect(byKind.architectureDoc).toBe("builder");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cox/cx-artifacts test`
Expected: FAIL — `Cannot find module '../src/plan'`.

- [ ] **Step 3: Create `src/plan.ts`**

```ts
import type { CxArtifact, CxBuildPlan, CxSpec } from "@cox/cx-core";
import type { Tier } from "@cox/core";

export interface ArtifactStepSpec {
  kind: CxArtifact["kind"];
  tier: Tier;
}

/** The 6 target-neutral artifact kinds this adapter generates.
 * `agentDefinition` is deliberately excluded — see NOTES.md. */
export const ARTIFACT_STEP_SPECS: readonly ArtifactStepSpec[] = [
  { kind: "journeyMap", tier: "architect" },
  { kind: "persona", tier: "architect" },
  { kind: "intentTaxonomy", tier: "architect" },
  { kind: "nbaRuleSet", tier: "architect" },
  { kind: "kpiFrame", tier: "builder" },
  { kind: "architectureDoc", tier: "builder" },
];

function requirementsSummary(spec: CxSpec): string {
  if (spec.requirements.length === 0) return "No requirements recorded.";
  return spec.requirements.map((r) => `${r.id}: ${r.text}`).join("\n");
}

export function buildPlan(spec: CxSpec): CxBuildPlan {
  const description = requirementsSummary(spec);
  return {
    targetId: "artifacts",
    specName: spec.state.name,
    steps: ARTIFACT_STEP_SPECS.map((s) => ({
      id: s.kind,
      description,
      producesArtifactKind: s.kind,
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cox/cx-artifacts test`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Export from the barrel**

Replace `packages/cx-artifacts/src/index.ts`'s content:

```ts
export * from "./plan";
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @cox/cx-artifacts typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cx-artifacts/src/plan.ts packages/cx-artifacts/src/index.ts packages/cx-artifacts/test/plan.test.ts
git commit -m "cx-artifacts: task 2 — plan.ts standard 6-artifact build plan"
```

---

### Task 3: `generate.ts` — prompt building and JSON parsing

**Files:**
- Create: `packages/cx-artifacts/src/generate.ts`
- Modify: `packages/cx-artifacts/src/index.ts`
- Test: `packages/cx-artifacts/test/generate.test.ts`

**Interfaces:**
- Consumes: `CxArtifact`, `JourneyMap`, `Persona`, `IntentTaxonomy`, `NbaRuleSet`, `KpiFrame`, `CxArchitectureDoc`, `CxTargetId`, `createCxAdapterError`, `isCxAdapterError` from `@cox/cx-core`.
- Produces: `promptFor(kind: CxArtifact["kind"], specName: string, requirementsText: string): string` and `parseArtifact(kind: CxArtifact["kind"], raw: string, ctx: { specName: string; targetId: CxTargetId }): CxArtifact` — both consumed by task 5's `adapter.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseArtifact, promptFor } from "../src/generate";
import { isCxAdapterError } from "@cox/cx-core";

const ctx = { specName: "billing-dispute", targetId: "artifacts" as const };

describe("promptFor", () => {
  it("includes the spec name, requirements text, and a JSON-only instruction", () => {
    const prompt = promptFor("journeyMap", "billing-dispute", "R1.1: some requirement");
    expect(prompt).toContain("billing-dispute");
    expect(prompt).toContain("R1.1: some requirement");
    expect(prompt).toContain("JSON only");
  });

  it("throws for agentDefinition — this adapter does not generate it", () => {
    expect(() => promptFor("agentDefinition", "billing-dispute", "")).toThrow(/does not generate/);
  });
});

describe("parseArtifact", () => {
  it("parses a valid journeyMap response and stamps id/provenance", () => {
    const raw = JSON.stringify({
      name: "Dispute resolution",
      stages: [{ id: "s1", name: "Report", description: "Customer reports the charge", touchpoints: ["phone"] }],
    });
    const artifact = parseArtifact("journeyMap", raw, ctx);
    expect(artifact.kind).toBe("journeyMap");
    expect(artifact.id).toBe("journeyMap");
    expect(artifact.provenance).toEqual({ specName: "billing-dispute", phase: "design", targetId: "artifacts" });
    if (artifact.kind === "journeyMap") {
      expect(artifact.name).toBe("Dispute resolution");
      expect(artifact.stages).toHaveLength(1);
    }
  });

  it("parses a valid kpiFrame response", () => {
    const raw = JSON.stringify({ metrics: [{ name: "handle-time", target: 300, unit: "seconds" }] });
    const artifact = parseArtifact("kpiFrame", raw, ctx);
    expect(artifact.kind).toBe("kpiFrame");
    if (artifact.kind === "kpiFrame") {
      expect(artifact.metrics).toEqual([{ name: "handle-time", target: 300, unit: "seconds" }]);
    }
  });

  it("throws a CxAdapterError on unparseable JSON", () => {
    expect(() => parseArtifact("journeyMap", "not json", ctx)).toThrow();
    try {
      parseArtifact("journeyMap", "not json", ctx);
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.phase).toBe("build");
        expect(e.retryable).toBe(false);
      }
    }
  });

  it("throws a CxAdapterError when required fields are missing", () => {
    const raw = JSON.stringify({ name: "Dispute resolution" }); // missing "stages"
    expect(() => parseArtifact("journeyMap", raw, ctx)).toThrow(/missing required fields/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cox/cx-artifacts test`
Expected: FAIL — `Cannot find module '../src/generate'`.

- [ ] **Step 3: Create `src/generate.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cox/cx-artifacts test`
Expected: PASS — all 6 new tests green.

- [ ] **Step 5: Export from the barrel**

Append to `packages/cx-artifacts/src/index.ts`:

```ts
export * from "./generate";
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @cox/cx-artifacts typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cx-artifacts/src/generate.ts packages/cx-artifacts/src/index.ts packages/cx-artifacts/test/generate.test.ts
git commit -m "cx-artifacts: task 3 — generate.ts prompt building and JSON parsing"
```

---

### Task 4: `disk.ts` — deploy/status/teardown file I/O

**Files:**
- Create: `packages/cx-artifacts/src/disk.ts`
- Modify: `packages/cx-artifacts/src/index.ts`
- Test: `packages/cx-artifacts/test/disk.test.ts`

**Interfaces:**
- Consumes: `CxArtifact`, `CxDeployment`, `CxDeploymentResource`, `CxHealth`, `CxTargetId`, `createCxAdapterError` from `@cox/cx-core`.
- Produces: `DiskDeps` (`{ cxRoot: string; now: () => string }`), `deployArtifacts(deps, targetId, specName, artifacts): Promise<CxDeployment>`, `statusFromDisk(deps, dep): Promise<CxHealth>`, `teardownFromDisk(deps, dep): Promise<void>` — all consumed by task 5's `adapter.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deployArtifacts, statusFromDisk, teardownFromDisk, type DiskDeps } from "../src/disk";
import type { CxArtifact } from "@cox/cx-core";

const artifacts: CxArtifact[] = [
  {
    kind: "kpiFrame",
    id: "kpiFrame",
    provenance: { specName: "billing-dispute", phase: "design", targetId: "artifacts" },
    metrics: [{ name: "handle-time", target: 300, unit: "seconds" }],
  },
];

describe("disk", () => {
  let cxRoot: string;
  let deps: DiskDeps;

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-cx-artifacts-"));
    deps = { cxRoot, now: () => "2026-07-22T00:00:00Z" };
  });

  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("deploy() writes one JSON file per artifact and returns matching resources", async () => {
    const dep = await deployArtifacts(deps, "artifacts", "billing-dispute", artifacts);
    expect(dep.resources).toEqual([{ id: "kpiFrame", kind: "artifact-file", createdAt: "2026-07-22T00:00:00Z" }]);
    const written = await readFile(join(cxRoot, "billing-dispute", "artifacts", "kpiFrame.json"), "utf8");
    expect(JSON.parse(written)).toEqual(artifacts[0]);
  });

  it("status() reports healthy when every deployed file is present", async () => {
    const dep = await deployArtifacts(deps, "artifacts", "billing-dispute", artifacts);
    const health = await statusFromDisk(deps, dep);
    expect(health.level).toBe("healthy");
    expect(health.metrics).toEqual([
      { name: "artifactCount", value: 1, unit: "count" },
      { name: "missingCount", value: 0, unit: "count" },
    ]);
  });

  it("status() reports down when a deployed file is deleted", async () => {
    const dep = await deployArtifacts(deps, "artifacts", "billing-dispute", artifacts);
    await rm(join(cxRoot, "billing-dispute", "artifacts", "kpiFrame.json"));
    const health = await statusFromDisk(deps, dep);
    expect(health.level).toBe("down");
  });

  it("teardown() removes the spec's artifacts directory", async () => {
    const dep = await deployArtifacts(deps, "artifacts", "billing-dispute", artifacts);
    await teardownFromDisk(deps, dep);
    await expect(readFile(join(cxRoot, "billing-dispute", "artifacts", "kpiFrame.json"), "utf8")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cox/cx-artifacts test`
Expected: FAIL — `Cannot find module '../src/disk'`.

- [ ] **Step 3: Create `src/disk.ts`**

```ts
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CxArtifact, CxDeployment, CxDeploymentResource, CxHealth, CxTargetId } from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

export interface DiskDeps {
  /** Root directory artifacts are written under. Tests inject an `fs.mkdtemp` dir. */
  cxRoot: string;
  now: () => string;
}

function artifactsDir(deps: DiskDeps, specName: string): string {
  return join(deps.cxRoot, specName, "artifacts");
}

function artifactPath(deps: DiskDeps, specName: string, artifactId: string): string {
  return join(artifactsDir(deps, specName), `${artifactId}.json`);
}

export async function deployArtifacts(
  deps: DiskDeps,
  targetId: CxTargetId,
  specName: string,
  artifacts: CxArtifact[],
): Promise<CxDeployment> {
  try {
    await mkdir(artifactsDir(deps, specName), { recursive: true });
    const resources: CxDeploymentResource[] = [];
    for (const artifact of artifacts) {
      await writeFile(artifactPath(deps, specName, artifact.id), JSON.stringify(artifact, null, 2), "utf8");
      resources.push({ id: artifact.id, kind: "artifact-file", createdAt: deps.now() });
    }
    return { targetId, specName, deployedAt: deps.now(), resources };
  } catch (err) {
    throw createCxAdapterError({
      message: `cx-artifacts: failed to write artifacts for spec "${specName}": ${(err as Error).message}`,
      targetId,
      phase: "deploy",
      retryable: true,
    });
  }
}

export async function statusFromDisk(deps: DiskDeps, dep: CxDeployment): Promise<CxHealth> {
  let missing = 0;
  for (const resource of dep.resources) {
    try {
      await readFile(artifactPath(deps, dep.specName, resource.id), "utf8");
    } catch {
      missing++;
    }
  }
  const total = dep.resources.length;
  const level = missing === 0 ? "healthy" : missing === total ? "down" : "degraded";
  return {
    targetId: dep.targetId,
    level,
    metrics: [
      { name: "artifactCount", value: total - missing, unit: "count" },
      { name: "missingCount", value: missing, unit: "count" },
    ],
    checkedAt: deps.now(),
  };
}

export async function teardownFromDisk(deps: DiskDeps, dep: CxDeployment): Promise<void> {
  try {
    await rm(artifactsDir(deps, dep.specName), { recursive: true, force: true });
  } catch (err) {
    throw createCxAdapterError({
      message: `cx-artifacts: failed to tear down artifacts for spec "${dep.specName}": ${(err as Error).message}`,
      targetId: dep.targetId,
      phase: "teardown",
      retryable: true,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cox/cx-artifacts test`
Expected: PASS — all 4 new tests green.

- [ ] **Step 5: Export from the barrel**

Append to `packages/cx-artifacts/src/index.ts`:

```ts
export * from "./disk";
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @cox/cx-artifacts typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cx-artifacts/src/disk.ts packages/cx-artifacts/src/index.ts packages/cx-artifacts/test/disk.test.ts
git commit -m "cx-artifacts: task 4 — disk.ts deploy/status/teardown file I/O"
```

---

### Task 5: `adapter.ts` — `createArtifactsAdapter()`

**Files:**
- Create: `packages/cx-artifacts/src/adapter.ts`
- Modify: `packages/cx-artifacts/src/index.ts`
- Test: `packages/cx-artifacts/test/adapter.test.ts`

**Interfaces:**
- Consumes: `ARTIFACT_STEP_SPECS`, `buildPlan` from `./plan`; `promptFor`, `parseArtifact` from `./generate`; `deployArtifacts`, `statusFromDisk`, `teardownFromDisk`, `DiskDeps` from `./disk`; `CxTargetAdapter`, `CxArtifact`, `CxBuildPlan`, `CxDeployment`, `CxHealth`, `CxSimReport`, `CxSpec`, `CxTrafficProfile`, `createCxAdapterError` from `@cox/cx-core`; `Tier` from `@cox/core`.
- Produces: `ArtifactsAdapterDeps` (`DiskDeps & { generate: (prompt: string, tier: Tier) => Promise<string> }`) and `createArtifactsAdapter(deps: ArtifactsAdapterDeps): CxTargetAdapter` — this is the package's main deliverable, consumed by whatever composition root wires it in later (not yet built).

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArtifactsAdapter, type ArtifactsAdapterDeps } from "../src/adapter";
import type { CxSpec } from "@cox/cx-core";
import { isCxAdapterError } from "@cox/cx-core";

const spec: CxSpec = {
  state: {
    name: "billing-dispute",
    createdAt: "2026-07-22T00:00:00Z",
    phases: { requirements: "approved", design: "approved", tasks: "approved" },
    tasks: [],
    approvals: [],
  },
  requirements: [{ id: "R1.1", text: "resolve disputes fast" }],
};

const RESPONSES: Record<string, string> = {
  journeyMap: JSON.stringify({ name: "Dispute journey", stages: [] }),
  persona: JSON.stringify({ name: "Alex", goals: [], painPoints: [] }),
  intentTaxonomy: JSON.stringify({ domains: [] }),
  nbaRuleSet: JSON.stringify({ rules: [] }),
  kpiFrame: JSON.stringify({ metrics: [{ name: "handle-time", target: 300, unit: "seconds" }] }),
  architectureDoc: JSON.stringify({ title: "Dispute architecture", markdown: "# Design" }),
};

function makeDeps(cxRoot: string): ArtifactsAdapterDeps {
  const calls: { prompt: string; tier: string }[] = [];
  return {
    cxRoot,
    now: () => "2026-07-22T00:00:00Z",
    generate: async (prompt, tier) => {
      calls.push({ prompt, tier });
      // Determine which artifact kind this prompt is for by which shape
      // phrase promptFor() embedded in it.
      for (const k of Object.keys(RESPONSES)) {
        if (prompt.toLowerCase().includes(k.toLowerCase())) return RESPONSES[k]!;
      }
      throw new Error(`test stub: no scripted response matches prompt: ${prompt}`);
    },
  };
}

describe("createArtifactsAdapter", () => {
  let cxRoot: string;

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-cx-artifacts-adapter-"));
  });

  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("has id 'artifacts' and capabilities excluding simulate", () => {
    const adapter = createArtifactsAdapter(makeDeps(cxRoot));
    expect(adapter.id).toBe("artifacts");
    expect(adapter.capabilities()).toEqual(["build", "deploy", "status", "teardown"]);
  });

  it("plan() -> build() -> deploy() -> status() round-trips all 6 artifacts", async () => {
    const adapter = createArtifactsAdapter(makeDeps(cxRoot));
    const plan = await adapter.plan(spec);
    expect(plan.steps).toHaveLength(6);
    const artifacts = await adapter.build(plan);
    expect(artifacts).toHaveLength(6);
    const dep = await adapter.deploy(artifacts);
    expect(dep.resources).toHaveLength(6);
    const health = await adapter.status(dep);
    expect(health.level).toBe("healthy");
  });

  it("teardown() removes what deploy() created", async () => {
    const adapter = createArtifactsAdapter(makeDeps(cxRoot));
    const plan = await adapter.plan(spec);
    const artifacts = await adapter.build(plan);
    const dep = await adapter.deploy(artifacts);
    await adapter.teardown(dep);
    const health = await adapter.status(dep);
    expect(health.level).toBe("down");
  });

  it("simulate() throws a non-retryable CxAdapterError", async () => {
    const adapter = createArtifactsAdapter(makeDeps(cxRoot));
    try {
      await adapter.simulate(
        { targetId: "artifacts", specName: "x", deployedAt: "2026-07-22T00:00:00Z", resources: [] },
        { name: "peak", volumePerMinute: 10, personaWeights: {}, durationMinutes: 5 },
      );
      throw new Error("expected simulate() to throw");
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.phase).toBe("simulate");
        expect(e.retryable).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cox/cx-artifacts test`
Expected: FAIL — `Cannot find module '../src/adapter'`.

- [ ] **Step 3: Create `src/adapter.ts`**

```ts
import type { Tier } from "@cox/core";
import type {
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
import { deployArtifacts, statusFromDisk, teardownFromDisk, type DiskDeps } from "./disk";
import { parseArtifact, promptFor } from "./generate";
import { ARTIFACT_STEP_SPECS, buildPlan } from "./plan";

export interface ArtifactsAdapterDeps extends DiskDeps {
  generate: (prompt: string, tier: Tier) => Promise<string>;
}

export function createArtifactsAdapter(deps: ArtifactsAdapterDeps): CxTargetAdapter {
  return {
    id: "artifacts",

    capabilities: () => ["build", "deploy", "status", "teardown"],

    async plan(spec: CxSpec): Promise<CxBuildPlan> {
      return buildPlan(spec);
    },

    async build(plan: CxBuildPlan): Promise<CxArtifact[]> {
      const artifacts: CxArtifact[] = [];
      for (const step of plan.steps) {
        const stepSpec = ARTIFACT_STEP_SPECS.find((s) => s.kind === step.producesArtifactKind);
        if (!stepSpec) {
          throw createCxAdapterError({
            message: `cx-artifacts: no generator registered for artifact kind "${step.producesArtifactKind}"`,
            targetId: "artifacts",
            phase: "build",
            retryable: false,
          });
        }
        const prompt = promptFor(step.producesArtifactKind, plan.specName, step.description);
        const raw = await deps.generate(prompt, stepSpec.tier);
        artifacts.push(parseArtifact(step.producesArtifactKind, raw, { specName: plan.specName, targetId: "artifacts" }));
      }
      return artifacts;
    },

    async deploy(artifacts: CxArtifact[]): Promise<CxDeployment> {
      const specName = artifacts[0]?.provenance.specName;
      if (!specName) {
        throw createCxAdapterError({
          message: "cx-artifacts: deploy() called with no artifacts",
          targetId: "artifacts",
          phase: "deploy",
          retryable: false,
        });
      }
      return deployArtifacts(deps, "artifacts", specName, artifacts);
    },

    async status(dep: CxDeployment): Promise<CxHealth> {
      return statusFromDisk(deps, dep);
    },

    async simulate(_dep: CxDeployment, _traffic: CxTrafficProfile): Promise<CxSimReport> {
      throw createCxAdapterError({
        message: "cx-artifacts: simulate() is not supported — a document factory has no traffic to run against",
        targetId: "artifacts",
        phase: "simulate",
        retryable: false,
      });
    },

    async teardown(dep: CxDeployment): Promise<void> {
      return teardownFromDisk(deps, dep);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cox/cx-artifacts test`
Expected: PASS — all 4 new tests green.

- [ ] **Step 5: Export from the barrel**

Append to `packages/cx-artifacts/src/index.ts`:

```ts
export * from "./adapter";
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @cox/cx-artifacts typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cx-artifacts/src/adapter.ts packages/cx-artifacts/src/index.ts packages/cx-artifacts/test/adapter.test.ts
git commit -m "cx-artifacts: task 5 — adapter.ts createArtifactsAdapter"
```

---

### Task 6: Remove the scaffold placeholder, final barrel review, whole-workspace verification

**Files:**
- Modify: `packages/cx-artifacts/src/index.ts`
- Delete: `packages/cx-artifacts/test/placeholder.test.ts`

**Interfaces:**
- Consumes: everything from tasks 2-5.
- Produces: the final `@cox/cx-artifacts` public surface.

- [ ] **Step 1: Confirm the barrel re-exports every module**

Read `packages/cx-artifacts/src/index.ts` and confirm it contains exactly these 4 lines, in this order:

```ts
export * from "./plan";
export * from "./generate";
export * from "./disk";
export * from "./adapter";
```

If any line is missing, add it.

- [ ] **Step 2: Delete the now-redundant placeholder test**

Run: `rm packages/cx-artifacts/test/placeholder.test.ts`

- [ ] **Step 3: Run the full workspace typecheck and test suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — 0 type errors across all 13 packages (12 pre-existing plus the now-complete `@cox/cx-artifacts`); every package's test suite green, including `@cox/cx-artifacts`'s 18 tests (4 plan + 6 generate + 4 disk + 4 adapter, the removed placeholder no longer counted) and all prior packages' tests unaffected.

- [ ] **Step 4: Commit**

```bash
git add packages/cx-artifacts/src/index.ts
git rm packages/cx-artifacts/test/placeholder.test.ts
git commit -m "cx-artifacts: task 6 — finalize barrel, remove scaffold placeholder"
```

---

## What this unblocks

With this plan complete, `@cox/cx-artifacts` is a real, tested, typechecked `CxTargetAdapter` implementation. It generates the 6 target-neutral CX artifacts via an injected model-call dependency, persists them to `.cox/cx/<spec>/artifacts/`, and reports their presence as health. `cx-local` and `cx-aws` can now be planned with a concrete example of what "consume the artifacts adapter's output as build context" looks like in practice — though each still needs its own brainstorm, design doc, and plan before work starts, same as this one did.
