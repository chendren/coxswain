# CXOS Foundation (`@cox/cx-core`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `@cox/cx-core` — the frozen contract package for CXOS — plus the one small, additive extension to `@cox/core` it needs, so the four parallel CXOS lanes (`cx-artifacts`, `cx-local`, `cx-aws`, `cx-ops`) all have a stable contract, artifact model, and scripted mock adapter to build and test against.

**Architecture:** Mirrors `@cox/core`'s own shape exactly: named exports, no classes, no runtime deps beyond types. `CxSpec` composes over `@cox/core`'s existing `SpecState` (imported, not modified) rather than widening the frozen `SpecEngine` contract — the fourth spec kind ("cx") reuses the same phase state machine at runtime; `cx-core` only adds the CX-flavored view on top. `CxTargetAdapter` is the one new interface every adapter package implements. `CxOpsEvent` rides the existing `AgentEvent` stream through a single new generic `cx_event` variant (a domain-neutral escape hatch in `@cox/core`, not CX vocabulary leaking into core) plus a `toAgentEvent()` translator in `cx-core`. `createMockTargetAdapter()` is `cx-core`'s scripted-mock equivalent of `@cox/providers`'s `createMockModel()` — every downstream package tests against it, offline.

**Tech Stack:** TypeScript 5.6+ (strict, `noUncheckedIndexedAccess`), pnpm workspace package, vitest, zero runtime deps beyond `@cox/core`.

## Global Constraints

- Node >= 20, pnpm workspaces, TypeScript 5.6+, vitest, ESM (`"type": "module"`), no build step — packages export TS source directly (`"main": "src/index.ts"`).
- `moduleResolution: "bundler"` — this is new code, so relative imports **omit** file extensions (`from "./types"`, not `"./types.js"`).
- Strict mode with `noUncheckedIndexedAccess` — index access yields `T | undefined`.
- `cx-core`'s only runtime dependency is `@cox/core` (workspace:*). No other `@cox/*` package may be imported (per repo import law: only `@cox/cli` is the composition root).
- No classes where a closure/factory does. No default exports. No custom error class hierarchies — typed errors are plain `Error` instances with extra properties attached, matching `@cox/providers`'s `providerError()` pattern.
- No floating promises (`void x()` banned — await or return).
- Tests: `pnpm --filter @cox/cx-core test` (vitest), zero network, zero API keys, zero `~/.cox` writes. Test files under `packages/cx-core/test/*.test.ts`, matching `packages/router/test/`.
- Pure type/interface declarations are **not** given a red/green TDD cycle — `@cox/core/src/types.ts` itself has zero dedicated tests for its interfaces (only schema defaults and helper functions are runtime-tested, per `packages/core/test/core.test.ts`). Tasks below follow that precedent: type-only tasks are verified by `pnpm --filter @cox/cx-core typecheck`; tasks that add a runtime function or schema default get a real failing-then-passing test.
- Every new/changed package must pass `pnpm --filter @cox/<pkg> typecheck && pnpm --filter @cox/<pkg> test` before commit (per `docs/04-CONVENTIONS.md`).
- Commit message prefix per workstream convention: `cx-core: task N — <summary>`.

---

### Task 1: Extend `@cox/core` — `cx` config block + `cx_event` escape hatch

This is the one edit to frozen `@cox/core` contracts that CXOS needs, done once, up front, before any parallel lane starts (per the approved design's build plan: "Freeze `@cox/cx-core`... before the lanes start"). It adds an optional, fully-defaulted `cx` config section and one new generic `AgentEvent` variant. Both are additive — no existing field changes shape, so no other package's typecheck breaks except the two `AgentEvent` exhaustiveness switches in `@cox/tui`, which this task also fixes.

**Files:**
- Modify: `packages/core/src/config.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/tui/src/app.tsx`
- Modify: `packages/tui/src/plain.ts`
- Test: `packages/core/test/core.test.ts`

**Interfaces:**
- Produces: `CoxConfig["cx"]` with shape `{ targets: { local?: { baseUrl: string }, aws?: { profile?: string, region?: string } }, budgets: { cxOpsUsd?: number }, defaultOpsMode: "commands" | "console" | "autonomous", watcherPollIntervalMs: number }`. Produces `AgentEvent` variant `{ type: "cx_event"; targetId: string; summary: string; data: Record<string, unknown> }`.

- [ ] **Step 1: Write the failing config test**

Add to `packages/core/test/core.test.ts`, inside the existing `describe("@cox/core", ...)` block (after the `"parses default config with anthropic tier map"` test):

```ts
  it("parses default cx config block", () => {
    const cfg = configSchema.parse({});
    expect(cfg.cx.defaultOpsMode).toBe("console");
    expect(cfg.cx.watcherPollIntervalMs).toBe(60_000);
    expect(cfg.cx.targets).toEqual({});
    expect(cfg.cx.budgets).toEqual({});
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cox/core test`
Expected: FAIL — `cfg.cx` is `undefined` (`Cannot read properties of undefined (reading 'defaultOpsMode')`).

- [ ] **Step 3: Add the `cx` block to the config schema**

In `packages/core/src/config.ts`, add a new top-level key to `configSchema` (insert after the `hooks` key, before the closing `});` of `configSchema`):

```ts
  cx: z
    .object({
      targets: z
        .object({
          local: z.object({ baseUrl: z.string() }).optional(),
          aws: z.object({ profile: z.string().optional(), region: z.string().optional() }).optional(),
        })
        .default({}),
      budgets: z
        .object({
          cxOpsUsd: z.number().optional(),
        })
        .default({}),
      defaultOpsMode: z.enum(["commands", "console", "autonomous"]).default("console"),
      watcherPollIntervalMs: z.number().int().default(60_000),
    })
    .default({}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cox/core test`
Expected: PASS — all tests in `core.test.ts` green.

- [ ] **Step 5: Add the `cx_event` variant to `AgentEvent`**

In `packages/core/src/types.ts`, in the `AgentEvent` union (find the `turn_done` arm, the last one before the closing `;` of the type), add a new arm after it:

```ts
  | {
      type: "turn_done";
      usage: TokenUsage;
      costUsd: number;
      stopReason?: AgentRunResult["stopReason"];
    }
  | {
      /** CXOS escape hatch — core stays domain-neutral; @cox/cx-core's
       * CxOpsEvent carries the typed payload and renders it into `summary`
       * and `data` via toAgentEvent(). */
      type: "cx_event";
      targetId: string;
      summary: string;
      data: Record<string, unknown>;
    };
```

- [ ] **Step 6: Run root typecheck to see the two TUI exhaustiveness failures**

Run: `pnpm typecheck`
Expected: FAIL in `packages/tui` — `packages/tui/src/app.tsx` and `packages/tui/src/plain.ts` both error with "Type '{ type: "cx_event"; ... }' is not assignable to type 'never'" at their `default:` blocks. All other packages typecheck clean.

- [ ] **Step 7: Add the `cx_event` case to `app.tsx`**

In `packages/tui/src/app.tsx`, inside the `switch (e.type)` in the `useLayoutEffect` handler, insert a new case immediately before the `default: {` block (after the `"turn_done"` case's closing `}`):

```tsx
        case "cx_event": {
          pushEntry(<Text dimColor>{`▤ cx ${e.targetId} · ${e.summary}`}</Text>);
          break;
        }
```

- [ ] **Step 8: Add the `cx_event` case to `plain.ts`**

In `packages/tui/src/plain.ts`, inside the returned event listener's `switch (e.type)`, insert a new case immediately before the `default: {` block (after the `"turn_done"` case's closing `}`):

```ts
      case "cx_event": {
        write(`▤ cx ${e.targetId} · ${e.summary}`);
        break;
      }
```

- [ ] **Step 9: Run full workspace typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS across all packages, 0 type errors.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/config.ts packages/core/src/types.ts packages/core/test/core.test.ts packages/tui/src/app.tsx packages/tui/src/plain.ts
git commit -m "cx-core: task 1 — extend @cox/core with cx config block and cx_event"
```

---

### Task 2: Scaffold `@cox/cx-core` package

**Files:**
- Create: `packages/cx-core/package.json`
- Create: `packages/cx-core/tsconfig.json`
- Create: `packages/cx-core/src/index.ts`
- Create: `packages/cx-core/NOTES.md`
- Test: `packages/cx-core/test/placeholder.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: an installable, typechecked, testable empty package other tasks fill in.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@cox/cx-core",
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
    "@cox/core": "workspace:*"
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

describe("@cox/cx-core", () => {
  it("package scaffold loads", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 5: Install and verify**

Run: `pnpm install && pnpm --filter @cox/cx-core typecheck && pnpm --filter @cox/cx-core test`
Expected: PASS — 1 test passes, 0 type errors.

- [ ] **Step 6: Create `NOTES.md`**

```markdown
# cx-core NOTES

Decisions and deviations for the integrator.

- `CxSpec` composes over `@cox/core`'s existing `SpecState`/`SpecEngine`
  rather than widening those frozen contracts — the "cx" spec kind reuses
  the same phase state machine at runtime. See design.md.
- `CxOpsEvent` is a cx-core-owned typed union; `@cox/core`'s `AgentEvent`
  only knows about the generic `cx_event` escape hatch (task 1). Use
  `toAgentEvent()` to bridge.
- `CxAdapterError` follows `@cox/providers`'s `providerError()` pattern:
  a plain `Error` with extra properties, no class hierarchy.
```

- [ ] **Step 7: Commit**

```bash
git add packages/cx-core
git commit -m "cx-core: task 2 — scaffold @cox/cx-core package"
```

---

### Task 3: Target ids, capabilities, ops modes, and `CxAdapterError`

**Files:**
- Create: `packages/cx-core/src/target.ts`
- Create: `packages/cx-core/src/errors.ts`
- Modify: `packages/cx-core/src/index.ts`
- Test: `packages/cx-core/test/errors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CxTargetId`, `CxCapability`, `CxOpsMode`, `CxAdapterError`, `createCxAdapterError()`, `isCxAdapterError()` — used by every later task.

- [ ] **Step 1: Create `src/target.ts`**

```ts
/** The three CXOS build/operate targets. */
export type CxTargetId = "artifacts" | "local" | "aws";

export const CX_TARGET_IDS: readonly CxTargetId[] = ["artifacts", "local", "aws"];

/** What an adapter can do — declared by `CxTargetAdapter.capabilities()`. */
export type CxCapability =
  | "build"
  | "deploy"
  | "status"
  | "simulate"
  | "teardown"
  | "autonomousRemediate";

/** Per-target operate mode, switchable at any time via `/cx mode`. */
export type CxOpsMode = "commands" | "console" | "autonomous";
```

- [ ] **Step 2: Write the failing error test**

```ts
import { describe, expect, it } from "vitest";
import { createCxAdapterError, isCxAdapterError } from "../src/errors";

describe("CxAdapterError", () => {
  it("carries targetId, phase, and retryable on a real Error", () => {
    const err = createCxAdapterError({
      message: "local platform unreachable at http://localhost:3142",
      targetId: "local",
      phase: "deploy",
      retryable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("local platform unreachable at http://localhost:3142");
    expect(err.targetId).toBe("local");
    expect(err.phase).toBe("deploy");
    expect(err.retryable).toBe(true);
  });

  it("isCxAdapterError distinguishes it from a plain Error", () => {
    const err = createCxAdapterError({
      message: "boom",
      targetId: "aws",
      phase: "build",
      retryable: false,
    });
    expect(isCxAdapterError(err)).toBe(true);
    expect(isCxAdapterError(new Error("plain"))).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @cox/cx-core test`
Expected: FAIL — `Cannot find module '../src/errors'`.

- [ ] **Step 4: Create `src/errors.ts`**

```ts
import type { CxTargetId } from "./target";

export type CxAdapterErrorPhase = "plan" | "build" | "deploy" | "status" | "simulate" | "teardown";

/** A typed adapter error: a plain Error with CXOS fields attached — no
 * custom class hierarchy, matching @cox/providers's providerError(). */
export interface CxAdapterError extends Error {
  targetId: CxTargetId;
  phase: CxAdapterErrorPhase;
  retryable: boolean;
}

export function createCxAdapterError(init: {
  message: string;
  targetId: CxTargetId;
  phase: CxAdapterErrorPhase;
  retryable: boolean;
}): CxAdapterError {
  const err = new Error(init.message) as CxAdapterError;
  err.targetId = init.targetId;
  err.phase = init.phase;
  err.retryable = init.retryable;
  return err;
}

export function isCxAdapterError(e: unknown): e is CxAdapterError {
  return (
    e instanceof Error &&
    "targetId" in e &&
    "phase" in e &&
    "retryable" in e
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @cox/cx-core test`
Expected: PASS.

- [ ] **Step 6: Export from the barrel**

In `packages/cx-core/src/index.ts`, replace `export {};` with:

```ts
export * from "./target";
export * from "./errors";
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @cox/cx-core typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/cx-core/src/target.ts packages/cx-core/src/errors.ts packages/cx-core/src/index.ts packages/cx-core/test/errors.test.ts
git commit -m "cx-core: task 3 — target ids, capabilities, ops modes, CxAdapterError"
```

---

### Task 4: CX artifact model

Type-only task (no schema defaults or runtime logic to test) — verified by typecheck, per Global Constraints.

**Files:**
- Create: `packages/cx-core/src/artifacts.ts`
- Modify: `packages/cx-core/src/index.ts`

**Interfaces:**
- Consumes: `CxTargetId` from `./target`.
- Produces: `CxArtifact` (discriminated union of the 7 kinds below) and `CxArtifactProvenance`, consumed by tasks 5, 6, 7, 8.

- [ ] **Step 1: Create `src/artifacts.ts`**

```ts
import type { CxTargetId } from "./target";

/** Where an artifact came from — which spec, phase, target, and (if any)
 * the ledger entry that paid for the model call that produced it. */
export interface CxArtifactProvenance {
  specName: string;
  phase: "requirements" | "design" | "tasks" | "execution";
  targetId: CxTargetId;
  ledgerEntryTs?: string;
}

interface CxArtifactBase {
  id: string;
  provenance: CxArtifactProvenance;
}

export interface JourneyMap extends CxArtifactBase {
  kind: "journeyMap";
  name: string;
  stages: { id: string; name: string; description: string; touchpoints: string[] }[];
}

export interface Persona extends CxArtifactBase {
  kind: "persona";
  name: string;
  goals: string[];
  painPoints: string[];
}

export interface AgentDefinition extends CxArtifactBase {
  kind: "agentDefinition";
  name: string;
  systemPrompt: string;
  tools: string[];
}

export interface IntentTaxonomy extends CxArtifactBase {
  kind: "intentTaxonomy";
  domains: { name: string; intents: string[] }[];
}

export interface NbaRuleSet extends CxArtifactBase {
  kind: "nbaRuleSet";
  rules: { id: string; condition: string; action: string; priority: number }[];
}

export interface KpiFrame extends CxArtifactBase {
  kind: "kpiFrame";
  metrics: { name: string; target: number; unit: string }[];
}

export interface CxArchitectureDoc extends CxArtifactBase {
  kind: "architectureDoc";
  title: string;
  markdown: string;
}

export type CxArtifact =
  | JourneyMap
  | Persona
  | AgentDefinition
  | IntentTaxonomy
  | NbaRuleSet
  | KpiFrame
  | CxArchitectureDoc;
```

- [ ] **Step 2: Export from the barrel**

In `packages/cx-core/src/index.ts`, add:

```ts
export * from "./artifacts";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @cox/cx-core typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cx-core/src/artifacts.ts packages/cx-core/src/index.ts
git commit -m "cx-core: task 4 — CX artifact model"
```

---

### Task 5: `CxSpec` — composes over `@cox/core`'s `SpecState`

Type-only task — verified by typecheck.

**Files:**
- Create: `packages/cx-core/src/spec.ts`
- Modify: `packages/cx-core/src/index.ts`

**Interfaces:**
- Consumes: `SpecState` from `@cox/core`; `JourneyMap`, `Persona`, `IntentTaxonomy`, `NbaRuleSet` from `./artifacts`.
- Produces: `CxRequirement`, `CxDesignDoc`, `CxSpec` — consumed by task 7 (`CxTargetAdapter.plan`/`build` take a `CxSpec`).

- [ ] **Step 1: Create `src/spec.ts`**

```ts
import type { SpecState } from "@cox/core";
import type { IntentTaxonomy, JourneyMap, NbaRuleSet, Persona } from "./artifacts";

/** CX-EARS acceptance criterion, e.g. "R2.1: WHEN a customer disputes a
 * charge, THE SYSTEM SHALL resolve in <= 1 contact". */
export interface CxRequirement {
  id: string;
  text: string;
}

/** The design-phase output: target-neutral, built by the `artifacts`
 * adapter first and handed to `local`/`aws` as build context. */
export interface CxDesignDoc {
  journeyMaps: JourneyMap[];
  personas: Persona[];
  intentTaxonomy?: IntentTaxonomy;
  nbaRuleSet?: NbaRuleSet;
}

/** A CX spec reuses @cox/core's phase state machine (`SpecState`) as-is —
 * `state` carries requirements/design/tasks/execution status and approval
 * gates exactly like a coding spec. `requirements`/`design` are the parsed,
 * CX-typed views of that same spec's generated markdown. */
export interface CxSpec {
  state: SpecState;
  requirements: CxRequirement[];
  design?: CxDesignDoc;
}
```

- [ ] **Step 2: Export from the barrel**

In `packages/cx-core/src/index.ts`, add:

```ts
export * from "./spec";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @cox/cx-core typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cx-core/src/spec.ts packages/cx-core/src/index.ts
git commit -m "cx-core: task 5 — CxSpec composed over @cox/core SpecState"
```

---

### Task 6: Build/deploy/operate result types

Type-only task — verified by typecheck.

**Files:**
- Create: `packages/cx-core/src/build.ts`
- Create: `packages/cx-core/src/operate.ts`
- Modify: `packages/cx-core/src/index.ts`

**Interfaces:**
- Consumes: `CxTargetId` from `./target`; `CxArtifact` from `./artifacts`; `CxSpec` from `./spec`.
- Produces: `CxBuildPlan`, `CxDeployment`, `CxHealth`, `CxTrafficProfile`, `CxSimReport` — the return types of every `CxTargetAdapter` method (task 7).

- [ ] **Step 1: Create `src/build.ts`**

```ts
import type { CxArtifact } from "./artifacts";
import type { CxTargetId } from "./target";

export interface CxBuildStep {
  id: string;
  description: string;
  producesArtifactKind: CxArtifact["kind"];
}

export interface CxBuildPlan {
  targetId: CxTargetId;
  specName: string;
  steps: CxBuildStep[];
}

export interface CxDeploymentResource {
  id: string;
  /** Adapter-defined resource kind, e.g. "connect-flow", "platform-journey". */
  kind: string;
  createdAt: string;
}

/** Ordered record of what deploy() created — teardown() consumes it in
 * reverse, per the design's transactional-deploy rule. */
export interface CxDeployment {
  targetId: CxTargetId;
  specName: string;
  deployedAt: string;
  resources: CxDeploymentResource[];
}
```

- [ ] **Step 2: Create `src/operate.ts`**

```ts
import type { CxTargetId } from "./target";

export type CxHealthLevel = "healthy" | "degraded" | "down";

export interface CxHealthMetric {
  name: string;
  value: number;
  unit: string;
}

export interface CxHealth {
  targetId: CxTargetId;
  level: CxHealthLevel;
  metrics: CxHealthMetric[];
  checkedAt: string;
}

export interface CxTrafficProfile {
  name: string;
  volumePerMinute: number;
  /** Persona id -> traffic share; entries should sum to 1. */
  personaWeights: Record<string, number>;
  durationMinutes: number;
}

export interface CxSimOutcome {
  kpiName: string;
  achieved: number;
  target: number;
}

export interface CxSimReport {
  targetId: CxTargetId;
  profile: CxTrafficProfile;
  outcomes: CxSimOutcome[];
  ranAt: string;
}
```

- [ ] **Step 3: Export from the barrel**

In `packages/cx-core/src/index.ts`, add:

```ts
export * from "./build";
export * from "./operate";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @cox/cx-core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cx-core/src/build.ts packages/cx-core/src/operate.ts packages/cx-core/src/index.ts
git commit -m "cx-core: task 6 — build/deploy/operate result types"
```

---

### Task 7: `CxTargetAdapter`, `CxOpsEvent`, and `toAgentEvent()`

**Files:**
- Create: `packages/cx-core/src/adapter.ts`
- Create: `packages/cx-core/src/events.ts`
- Modify: `packages/cx-core/src/index.ts`
- Test: `packages/cx-core/test/events.test.ts`

**Interfaces:**
- Consumes: `AgentEvent` from `@cox/core`; `CxCapability`, `CxOpsMode`, `CxTargetId` from `./target`; `CxSpec` from `./spec`; `CxArtifact` from `./artifacts`; `CxBuildPlan`, `CxDeployment` from `./build`; `CxHealth`, `CxTrafficProfile`, `CxSimReport` from `./operate`.
- Produces: `CxTargetAdapter` (implemented by every adapter package), `CxOpsEvent`, `toAgentEvent()` — consumed by task 8 and by `cx-ops` later.

- [ ] **Step 1: Create `src/adapter.ts`**

```ts
import type { CxArtifact } from "./artifacts";
import type { CxBuildPlan, CxDeployment } from "./build";
import type { CxHealth, CxSimReport, CxTrafficProfile } from "./operate";
import type { CxSpec } from "./spec";
import type { CxCapability, CxTargetId } from "./target";

/** Implemented by each build/operate target: cx-artifacts, cx-local, cx-aws. */
export interface CxTargetAdapter {
  readonly id: CxTargetId;
  capabilities(): CxCapability[];
  plan(spec: CxSpec): Promise<CxBuildPlan>;
  build(plan: CxBuildPlan): Promise<CxArtifact[]>;
  deploy(artifacts: CxArtifact[]): Promise<CxDeployment>;
  status(dep: CxDeployment): Promise<CxHealth>;
  simulate(dep: CxDeployment, traffic: CxTrafficProfile): Promise<CxSimReport>;
  teardown(dep: CxDeployment): Promise<void>;
}
```

- [ ] **Step 2: Write the failing events test**

```ts
import { describe, expect, it } from "vitest";
import { toAgentEvent, type CxOpsEvent } from "../src/events";

describe("toAgentEvent", () => {
  it("bridges cx_watch_triggered into a cx_event with a readable summary", () => {
    const e: CxOpsEvent = {
      type: "cx_watch_triggered",
      targetId: "local",
      metric: "abandonment",
      value: 0.07,
      threshold: 0.05,
    };
    const out = toAgentEvent(e);
    expect(out.type).toBe("cx_event");
    if (out.type !== "cx_event") throw new Error("unreachable");
    expect(out.targetId).toBe("local");
    expect(out.summary).toBe("cx watch: local abandonment=0.07 crossed 0.05");
    expect(out.data).toEqual(e);
  });

  it("bridges cx_mode_changed into a readable summary", () => {
    const e: CxOpsEvent = {
      type: "cx_mode_changed",
      targetId: "aws",
      from: "console",
      to: "autonomous",
    };
    const out = toAgentEvent(e);
    if (out.type !== "cx_event") throw new Error("unreachable");
    expect(out.summary).toBe("cx mode: aws console -> autonomous");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @cox/cx-core test`
Expected: FAIL — `Cannot find module '../src/events'`.

- [ ] **Step 4: Create `src/events.ts`**

```ts
import type { AgentEvent } from "@cox/core";
import type { CxOpsMode, CxTargetId } from "./target";

export type CxOpsEvent =
  | { type: "cx_watch_triggered"; targetId: CxTargetId; metric: string; value: number; threshold: number }
  | { type: "cx_diagnosis_proposed"; targetId: CxTargetId; specName: string; taskTitle: string }
  | { type: "cx_remediation_applied"; targetId: CxTargetId; description: string }
  | { type: "cx_mode_changed"; targetId: CxTargetId; from: CxOpsMode; to: CxOpsMode };

function summarize(e: CxOpsEvent): string {
  switch (e.type) {
    case "cx_watch_triggered":
      return `cx watch: ${e.targetId} ${e.metric}=${e.value} crossed ${e.threshold}`;
    case "cx_diagnosis_proposed":
      return `cx diagnosis: ${e.targetId} proposed "${e.taskTitle}" on spec ${e.specName}`;
    case "cx_remediation_applied":
      return `cx remediation: ${e.targetId} ${e.description}`;
    case "cx_mode_changed":
      return `cx mode: ${e.targetId} ${e.from} -> ${e.to}`;
  }
}

/** Bridges a typed CxOpsEvent onto @cox/core's generic `cx_event`
 * AgentEvent variant, so the TUI and ledger subscriber need no CXOS
 * knowledge to render/record it. */
export function toAgentEvent(e: CxOpsEvent): AgentEvent {
  return {
    type: "cx_event",
    targetId: e.targetId,
    summary: summarize(e),
    data: e as unknown as Record<string, unknown>,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @cox/cx-core test`
Expected: PASS.

- [ ] **Step 6: Export from the barrel**

In `packages/cx-core/src/index.ts`, add:

```ts
export * from "./adapter";
export * from "./events";
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @cox/cx-core typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/cx-core/src/adapter.ts packages/cx-core/src/events.ts packages/cx-core/src/index.ts packages/cx-core/test/events.test.ts
git commit -m "cx-core: task 7 — CxTargetAdapter, CxOpsEvent, toAgentEvent"
```

---

### Task 8: `createMockTargetAdapter()` — the scripted mock every downstream package tests against

**Files:**
- Create: `packages/cx-core/src/mock-adapter.ts`
- Modify: `packages/cx-core/src/index.ts`
- Test: `packages/cx-core/test/mock-adapter.test.ts`

**Interfaces:**
- Consumes: `CxTargetAdapter` from `./adapter`; `createCxAdapterError` from `./errors`; artifact/build/operate types.
- Produces: `MockAdapterScript`, `createMockTargetAdapter(id, script)` — the `@cox/cx-core`-equivalent of `@cox/providers`'s `createMockModel()`. `cx-ops` and every adapter's own test suite import this for zero-network tests.

- [ ] **Step 1: Write the failing mock-adapter test**

```ts
import { describe, expect, it } from "vitest";
import { createMockTargetAdapter } from "../src/mock-adapter";
import { isCxAdapterError } from "../src/errors";
import type { CxBuildPlan, CxDeployment } from "../src/build";
import type { CxSpec } from "../src/spec";

const spec: CxSpec = {
  state: {
    name: "billing-dispute",
    createdAt: "2026-07-22T00:00:00Z",
    phases: { requirements: "approved", design: "approved", tasks: "approved" },
    tasks: [],
    approvals: [],
  },
  requirements: [],
};

describe("createMockTargetAdapter", () => {
  it("returns the configured plan() result", async () => {
    const plan: CxBuildPlan = { targetId: "local", specName: "billing-dispute", steps: [] };
    const adapter = createMockTargetAdapter("local", { plan });
    await expect(adapter.plan(spec)).resolves.toEqual(plan);
  });

  it("supports a function script for build()", async () => {
    const adapter = createMockTargetAdapter("local", {
      build: (p) => [
        {
          kind: "kpiFrame",
          id: "kpi-1",
          metrics: [],
          provenance: { specName: p.specName, phase: "tasks", targetId: p.targetId },
        },
      ],
    });
    const plan: CxBuildPlan = { targetId: "local", specName: "billing-dispute", steps: [] };
    const result = await adapter.build(plan);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("kpiFrame");
  });

  it("throws a CxAdapterError when a method has no script configured", async () => {
    const adapter = createMockTargetAdapter("aws", {});
    await expect(adapter.plan(spec)).rejects.toSatisfy((e: unknown) => {
      return isCxAdapterError(e) && e.targetId === "aws" && e.phase === "plan" && !e.retryable;
    });
  });

  it("teardown is a no-op by default and capabilities() defaults to the full set", async () => {
    const adapter = createMockTargetAdapter("artifacts", {});
    const dep: CxDeployment = {
      targetId: "artifacts",
      specName: "billing-dispute",
      deployedAt: "2026-07-22T00:00:00Z",
      resources: [],
    };
    await expect(adapter.teardown(dep)).resolves.toBeUndefined();
    expect(adapter.capabilities()).toEqual(["build", "deploy", "status", "simulate", "teardown"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cox/cx-core test`
Expected: FAIL — `Cannot find module '../src/mock-adapter'`.

- [ ] **Step 3: Create `src/mock-adapter.ts`**

```ts
import type { CxArtifact } from "./artifacts";
import type { CxTargetAdapter } from "./adapter";
import type { CxBuildPlan, CxDeployment } from "./build";
import { createCxAdapterError } from "./errors";
import type { CxHealth, CxSimReport, CxTrafficProfile } from "./operate";
import type { CxSpec } from "./spec";
import type { CxCapability, CxTargetId } from "./target";

/** Each field is either a fixed result or a function of its inputs — mirrors
 * @cox/providers's createMockModel() scripting style. Omitted methods throw
 * a CxAdapterError naming the phase, so a test's intent (which methods it
 * actually exercises) stays visible in the script it configures. */
export interface MockAdapterScript {
  capabilities?: CxCapability[];
  plan?: CxBuildPlan | ((spec: CxSpec) => CxBuildPlan);
  build?: CxArtifact[] | ((plan: CxBuildPlan) => CxArtifact[]);
  deploy?: CxDeployment | ((artifacts: CxArtifact[]) => CxDeployment);
  status?: CxHealth | ((dep: CxDeployment) => CxHealth);
  simulate?: CxSimReport | ((dep: CxDeployment, traffic: CxTrafficProfile) => CxSimReport);
}

const DEFAULT_CAPABILITIES: CxCapability[] = ["build", "deploy", "status", "simulate", "teardown"];

function resolveOrThrow<TIn extends unknown[], TOut>(
  id: CxTargetId,
  phase: "plan" | "build" | "deploy" | "status" | "simulate",
  scripted: TOut | ((...args: TIn) => TOut) | undefined,
  args: TIn,
): TOut {
  if (scripted === undefined) {
    throw createCxAdapterError({
      message: `mock adapter "${id}": no ${phase}() script configured`,
      targetId: id,
      phase,
      retryable: false,
    });
  }
  return typeof scripted === "function" ? (scripted as (...a: TIn) => TOut)(...args) : scripted;
}

export function createMockTargetAdapter(id: CxTargetId, script: MockAdapterScript): CxTargetAdapter {
  return {
    id,
    capabilities: () => script.capabilities ?? DEFAULT_CAPABILITIES,
    async plan(spec) {
      return resolveOrThrow(id, "plan", script.plan, [spec]);
    },
    async build(plan) {
      return resolveOrThrow(id, "build", script.build, [plan]);
    },
    async deploy(artifacts) {
      return resolveOrThrow(id, "deploy", script.deploy, [artifacts]);
    },
    async status(dep) {
      return resolveOrThrow(id, "status", script.status, [dep]);
    },
    async simulate(dep, traffic) {
      return resolveOrThrow(id, "simulate", script.simulate, [dep, traffic]);
    },
    async teardown(_dep) {
      // No-op by default. Tests that need to assert teardown behavior wrap
      // the adapter returned here with their own spy.
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cox/cx-core test`
Expected: PASS — all 4 new tests plus prior tests green.

- [ ] **Step 5: Export from the barrel**

In `packages/cx-core/src/index.ts`, add:

```ts
export * from "./mock-adapter";
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @cox/cx-core typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cx-core/src/mock-adapter.ts packages/cx-core/src/index.ts packages/cx-core/test/mock-adapter.test.ts
git commit -m "cx-core: task 8 — createMockTargetAdapter scripted mock"
```

---

### Task 9: Remove the scaffold placeholder, final barrel review, whole-workspace verification

**Files:**
- Modify: `packages/cx-core/src/index.ts`
- Delete: `packages/cx-core/test/placeholder.test.ts`

**Interfaces:**
- Consumes: everything from tasks 3–8.
- Produces: the final `@cox/cx-core` public surface that `cx-artifacts`, `cx-local`, `cx-aws`, and `cx-ops` build against.

- [ ] **Step 1: Confirm the barrel re-exports every module**

Read `packages/cx-core/src/index.ts` and confirm it contains exactly these seven lines (order matches dependency order, task 2's original `export {};` should already be gone since task 3 replaced it):

```ts
export * from "./target";
export * from "./errors";
export * from "./artifacts";
export * from "./spec";
export * from "./build";
export * from "./operate";
export * from "./adapter";
export * from "./events";
export * from "./mock-adapter";
```

If any line is missing, add it.

- [ ] **Step 2: Delete the now-redundant placeholder test**

Run: `rm packages/cx-core/test/placeholder.test.ts`

- [ ] **Step 3: Run the full workspace typecheck and test suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — 0 type errors across all 12 packages; every package's test suite green, including the new `@cox/cx-core` tests (9 tests: 1 config test added in task 1's file, 2 error tests, 2 events tests, 4 mock-adapter tests) and the existing 895+ tests unaffected.

- [ ] **Step 4: Commit**

```bash
git add packages/cx-core/src/index.ts
git rm packages/cx-core/test/placeholder.test.ts
git commit -m "cx-core: task 9 — finalize barrel, remove scaffold placeholder"
```

---

## What this unblocks

With this plan complete, `@cox/cx-core` is a real, tested, typechecked package providing: `CxTargetId`/`CxCapability`/`CxOpsMode`, `CxAdapterError`, the 7-kind `CxArtifact` model, `CxSpec`/`CxRequirement`/`CxDesignDoc`, `CxBuildPlan`/`CxDeployment`, `CxHealth`/`CxTrafficProfile`/`CxSimReport`, the `CxTargetAdapter` interface, `CxOpsEvent`/`toAgentEvent()`, and `createMockTargetAdapter()`. The four remaining CXOS lanes (`cx-artifacts`, `cx-local`, `cx-aws`, `cx-ops`) can now proceed in parallel worktrees, each importing only `@cox/core` and `@cox/cx-core`, each testable offline against `createMockTargetAdapter()` — exactly as the approved design's build plan specifies. Each lane still needs its own spec pack (`docs/specs/cx-artifacts/`, `docs/specs/cx-local/`, `docs/specs/cx-aws/`, `docs/specs/cx-ops/`) and its own implementation plan before work starts.
