# cx-artifacts: the CXOS artifacts adapter

Date: 2026-07-22
Status: Approved (design), pending implementation plan

## Summary

`@cox/cx-artifacts` is the first of three `CxTargetAdapter` implementations
CXOS ships. It is the platform-neutral CX document factory: given an
approved `CxSpec`, it generates the target-neutral design artifacts
(journey maps, personas, intent taxonomy, NBA rules, KPI frame,
architecture doc) and persists them to disk. Per the approved CXOS design
(`docs/superpowers/specs/2026-07-22-cxos-design.md`), this adapter builds
first in the fan-out order — its output becomes build context for
`cx-local` and `cx-aws`.

## Goals

- Implement `CxTargetAdapter` (`id: "artifacts"`) fully, against the frozen
  `@cox/cx-core` contracts.
- Generate 6 of the 7 `CxArtifact` kinds from a `CxSpec`, via an injected
  model-call dependency (no direct import of `@cox/agent`/`@cox/router`,
  per the import law).
- Persist artifacts to disk as the adapter's notion of "deploy," and verify
  their presence as its notion of "operate."
- Stay offline-testable, matching every other package in this monorepo.

## Non-goals (v1)

- `AgentDefinition` generation — left to `cx-local`/`cx-aws`, which tailor
  an agent config to their own runtime using this adapter's 6 artifacts as
  context.
- `simulate()` — a document factory has no traffic to run against;
  `capabilities()` omits it.
- Autonomous remediation — `capabilities()` omits it; this adapter has no
  live system to remediate.
- Wiring the real `AgentRunner` into `deps.generate` — that's
  `@cox/cli`'s job (a future cli-integration lane), not this package's.

## Architecture

```
packages/cx-artifacts/
  src/
    adapter.ts   createArtifactsAdapter(deps): CxTargetAdapter
    generate.ts  per-artifact-kind prompt building + JSON parsing
    disk.ts      deploy()/status()/teardown() file I/O
    index.ts
```

Imports only `@cox/core` and `@cox/cx-core`, matching the import law every
`cx-*` package follows.

### Generation boundary

`createArtifactsAdapter(deps: { generate: (prompt: string, tier: Tier) =>
Promise<string> })` — dependency injection, mirroring `@cox/router`'s
existing `classifyModel: () => ChatModel` pattern. The real
`AgentRunner`-backed implementation is wired in by `@cox/cli`; tests inject
a scripted stub. This is what keeps the package importing only
`@cox/core` + `@cox/cx-core`.

### `plan()`

Deterministic, no model call. Given a `CxSpec`, returns a `CxBuildPlan`
with one `CxBuildStep` per artifact kind in the standard neutral set:

| Artifact kind | Tier |
|---|---|
| `journeyMap` | architect |
| `persona` | architect |
| `intentTaxonomy` | architect |
| `nbaRuleSet` | architect |
| `kpiFrame` | builder |
| `architectureDoc` | builder |

Tier split follows the CXOS design's routing language: "journey design
bills architect-tier, artifact rendering builder."

### `build()`

Calls `deps.generate(prompt, tier)` once per step. Each prompt asks for one
artifact as JSON matching its exact `CxArtifact` shape; the response is
`JSON.parse`d directly into the typed object plus a runtime shape check.
A malformed response throws `createCxAdapterError({ phase: "build",
targetId: "artifacts", retryable: false, message })` naming the artifact
kind and what was wrong. `deps.generate()`'s own failures (provider errors,
etc.) propagate unwrapped — retryability there is the caller's call, not
this adapter's.

`build()` is all-or-nothing per plan: a failure on any step aborts the
call rather than returning partial results. Two-failures-then-blocked
handling lives at the spec/task layer above this adapter, not inside it.

### `deploy()` / `status()` / `teardown()`

`deploy()` writes each artifact to `.cox/cx/<specName>/artifacts/<id>.json`
and returns one `CxDeploymentResource` (`kind: "artifact-file"`) per file.
`status()` re-reads `dep.resources` and checks each file still exists:
`healthy` (all present) / `degraded` (some missing) / `down` (none), with
`artifactCount`/`missingCount` metrics. `teardown()` deletes the files.
File I/O failures wrap as `CxAdapterError` with `phase: "deploy"` or
`"teardown"` and `retryable: true` (transient filesystem conditions are
worth a caller retry).

### `simulate()`

Not a declared capability. `capabilities()` returns `["build", "deploy",
"status", "teardown"]` (omits `"simulate"` and `"autonomousRemediate"`).
Calling `simulate()` throws `createCxAdapterError({ phase: "simulate",
retryable: false })`.

## Testing (offline)

- `test/adapter.test.ts`: `createArtifactsAdapter({ generate: scriptedFn })`
  with a sequential-response stub (same scripting shape as
  `@cox/providers`'s `createMockModel` — an array of canned JSON strings
  consumed in call order, throwing a descriptive error if over-called).
  Covers: `plan()` returns the 6 expected steps with correct tiers;
  `build()` parses valid JSON into the right `CxArtifact` kind; `build()`
  throws `CxAdapterError` on malformed JSON; `simulate()` throws;
  `capabilities()` omits `"simulate"`.
- `test/disk.test.ts`: `deploy()`/`status()`/`teardown()` against an
  `fs.mkdtemp` temp directory — no real `.cox/` writes in tests. Covers
  the `healthy`/`degraded`/`down` transitions by deleting a file between
  `deploy()` and `status()`.

## Configuration

None beyond what `@cox/core`'s existing `cx` config block already carries
(the artifacts target needs no extra config — no URL, no credentials,
unlike `cx-local`/`cx-aws`).
