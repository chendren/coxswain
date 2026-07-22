# CXOS: Customer Experience Operating / Building System on Coxswain

Date: 2026-07-22
Status: Approved (design), pending implementation plan

## Summary

CXOS extends Coxswain into a system that both **builds** CX solutions
(spec-driven, gated, cost-visible) and **operates** them (console, commands,
or autonomous modes). It ships as five new workspace packages behind a frozen
contract package, reusing the existing spec engine, tier router, ledger,
hooks, and event stream unchanged.

## Goals

- One CX spec (requirements, design, tasks with approval gates) fans out to
  three build targets: platform-neutral artifacts, the local omnichannel
  platform, and the AWS CX stack (Connect, Lex, AgentCore, Bedrock).
- Operate deployed solutions with a per-target ops mode: `commands`,
  `console` (default), or `autonomous`, switchable at any time.
- All model spend routes through the existing tier router and lands in the
  existing ledger. CX ops get their own budget line with the degrade-only
  governor rule.
- All three target adapters are built in parallel from spec packs, the same
  way Coxswain itself was built.

## Non-goals (v1)

- No live production mutation of AWS resources without a human gate,
  regardless of ops mode.
- No new TUI framework: CXOS emits events into the existing stream and the
  existing renderer displays them.
- No packaged binaries or Windows support (inherits the Coxswain roadmap).

## Architecture

### Packages

```
packages/
  cx-core/       CXOS contracts (frozen after design, like core)
  cx-artifacts/  platform-neutral CX document factory
  cx-local/      omnichannel-cx-platform adapter
  cx-aws/        Connect/Lex/AgentCore/Bedrock adapter
  cx-ops/        operate engine: console, watchers, daemon
```

Import law extends the existing rule: every `cx-*` package imports only
`@cox/core` and `@cox/cx-core`. Adapters never import each other or
`cx-ops`. `@cox/cli` remains the sole composition root and wires the
`cox cx` command namespace.

### Contracts (`@cox/cx-core`)

```ts
interface CxTargetAdapter {
  id: 'artifacts' | 'local' | 'aws'
  capabilities(): CxCapability[]            // build, deploy, simulate, observe...
  plan(spec: CxSpec): Promise<CxBuildPlan>          // what would be generated
  build(plan: CxBuildPlan): Promise<CxArtifact[]>   // generate (model calls via tier router)
  deploy(artifacts: CxArtifact[]): Promise<CxDeployment>
  status(dep: CxDeployment): Promise<CxHealth>      // KPIs, journey states
  simulate(dep: CxDeployment, traffic: CxTrafficProfile): Promise<CxSimReport>
  teardown(dep: CxDeployment): Promise<void>
}
```

Artifact model: `JourneyMap`, `Persona`, `AgentDefinition`,
`IntentTaxonomy`, `NbaRuleSet`, `KpiFrame`, `CxArchitectureDoc`. Every
artifact carries stable ids and provenance (spec id, phase, model call,
ledger entry ref).

`CxOpsEvent` is a new event family on the existing `AgentEvent` stream, so
the TUI and ledger subscribe with zero plumbing changes.

`MockTargetAdapter` lives in `cx-core` test exports: the CXOS analog of the
scripted model provider, used by `cx-ops` and integration tests.

### Spec engine reuse

A fourth spec kind (`cx`) reuses the phase state machine. Only the EARS
templates differ: personas, journeys, and KPIs are acceptance criteria
(example: "R2.1: WHEN a customer disputes a charge, THE SYSTEM SHALL resolve
in <= 1 contact"). Task complexity ratings drive tier routing as today:
journey design bills architect, artifact rendering builder, monitoring
classification scout.

## Build flow

```
cox cx new billing-dispute "reduce dispute handle time"
  -> requirements.md (architect, CX-EARS)   -> approve gate
  -> design.md (architect, target-neutral)  -> approve gate
  -> tasks.md (builder, per-target tasks)   -> approve gate
cox cx build billing-dispute --target local,aws,artifacts
cox cx deploy billing-dispute --target local
```

Ordering rule: the `artifacts` adapter builds first; its neutral outputs
(journey maps, intent taxonomies) are passed as build context to `cx-local`
and `cx-aws`, keeping targets consistent and prompt-cache-friendly.

## Operate flow

Ops mode is per-target, switchable anytime
(`/cx mode <target> console|commands|autonomous`), mirroring permission
modes:

- **commands**: `cox cx status|simulate|report|rollback|teardown`.
  Deterministic; the only model calls are scout-tier report summaries.
- **console** (default): commands plus agent-hook watchers. New hook trigger
  types: `metricThreshold` (polls adapter `status()`) and `opsEvent`. A
  firing watcher spawns a scout-tier diagnosis whose output is a proposed
  spec task, human-gated. The closed loop lands as reviewable work, never as
  direct mutation.
- **autonomous**: the watcher daemon may execute low-risk remediations
  itself. Adapter-declared `capabilities()` gate what "low-risk" means per
  target (`cx-local` may retune an NBA rule weight; `cx-aws` never mutates
  prod without a gate). Hard budget envelope (`budgets.cxOpsUsd`), every
  action ledgered, mode drop-back is instant.

Budget governor: CX ops budget follows the degrade-only rule. An over-budget
autonomous watcher degrades to console mode; it never silently continues.

## Error handling

- Typed `CxAdapterError` with `phase`, `targetId`, `retryable`.
- Build failures: two consecutive failures mark the task `blocked` (existing
  spec-engine rule).
- Deploy is transactional per target: `CxDeployment` manifests record what
  was created in order; `teardown()` consumes the manifest in reverse. A
  failed `cx-aws` deploy rolls back its CloudFormation stack; a failed
  `cx-local` deploy restores the prior platform config snapshot.
- Watcher errors never crash the session: log, exponential backoff, and
  after 3 consecutive failures the watcher disables itself with a visible
  transcript notice.
- Partial multi-target builds are valid states: `cox cx status` shows
  per-target build state; re-running `build` skips targets already at the
  current spec revision.

## Testing (offline)

- `cx-core`: contract and state-machine tests.
- `cx-artifacts`: scripted models.
- `cx-local`: stub HTTP server replaying recorded omnichannel-platform
  responses.
- `cx-aws`: recorded AWS SDK interactions (aws-sdk-client-mock).
- `cx-ops`: `MockTargetAdapter`, including budget-degrade and mode-switch
  paths.
- One M2-style integration test drives spec -> build -> deploy -> simulate
  -> report against the mock adapter through the real composition root.
- `examples/cx-demo/`: e2e target; builds against all three adapters (aws in
  plan-only mode offline).

## Configuration

A `cx` block in `cox.config.json`: target registration (local platform URL,
AWS profile/region), `budgets.cxOpsUsd`, per-target default ops mode,
watcher poll intervals.

## Build plan

1. Freeze `@cox/cx-core` (contracts, mock adapter, event types).
2. Five parallel worktree lanes from spec packs in `docs/specs/cx-*/`:
   artifacts, local, aws, ops, cli-integration.
3. Integrator merge. Contract questions append to `INTEGRATION-NOTES.md`;
   no workarounds in shared code.
