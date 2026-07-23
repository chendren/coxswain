# cx-local: the CXOS local-omnichannel-platform adapter

Date: 2026-07-22
Status: Approved (design), pending implementation plan

## Summary

`@cox/cx-local` is the second of three `CxTargetAdapter` implementations
CXOS ships, targeting the real local omnichannel CX platform at
`/Users/chadhendren/Projects/cx-platform/omnichannel-cx-platform`
(Express + WebSocket, default port 3143, `CX_PORT` overrides). Unlike
`cx-artifacts` (a pure document factory that writes fresh JSON to disk),
`cx-local` targets a platform that already has 13 fixed journey types,
real NBA rules, and a live event-ingestion pipeline — with **no write API
for journey/NBA-rule definitions** (`JOURNEY_DEFINITIONS` in
`src/journey/definitions.js` and `RULES` in `src/nba/rules.js` are
static, code-defined config loaded at process start). This adapter binds
a CXOS spec's neutral design to the closest matching existing journey
type, records that binding, and operates by observing real platform
metrics and injecting real synthetic traffic — it never mutates the
platform's live configuration.

## Goals

- Implement `CxTargetAdapter` (`id: "local"`) fully, against the frozen
  `@cox/cx-core` contracts.
- Match a CXOS `JourneyMap` to one of the platform's 13 real journey
  types via a model call (scout tier), not a fictional config-push.
- Persist the binding (an `AgentDefinition` plus the matched
  `JourneyMap`/`KpiFrame`) to disk so a later `simulate()` call — which
  the frozen contract gives no other way to reach the original artifacts
  — can recover real KPI target values.
- Exercise the platform's real `POST /api/events/batch` ingestion API for
  `simulate()`, and its read APIs (`/api/health/ready`,
  `/api/journeys/definitions`, `/api/dashboard/kpis`) for `status()` and
  `deploy()`'s validation step.
- Stay offline-testable against a local `node:http` stub server, matching
  every other package in this monorepo.

## Non-goals (v1)

- No mutation of the platform's live `JOURNEY_DEFINITIONS`/`RULES` — the
  platform exposes no API for this, and generating a config bundle for a
  human to manually merge into another repo's source was explicitly
  rejected in favor of the binding model.
- No undo for `simulate()`'s injected events — `teardown()` only removes
  local disk artifacts; synthetic events already ingested into the
  platform's live SQLite store are not retracted. This is a documented,
  inherent limitation.
- No autonomous remediation — `capabilities()` omits it; there is no safe
  mutation path to remediate with.
- Wiring the real `AgentRunner` into `deps.generate` — `@cox/cli`'s job,
  same as `cx-artifacts`.

## Architecture

```
packages/cx-local/
  src/
    client.ts   thin fetch wrapper for the platform's HTTP API
    match.ts    model-based journey-type matching (deps.generate)
    disk.ts     deploy()/simulate()/teardown() file I/O
    adapter.ts  createLocalAdapter(deps): CxTargetAdapter
    index.ts
```

Imports only `@cox/core` and `@cox/cx-core`, matching the import law
every `cx-*` package follows. No HTTP client dependency — Node 20's
native `fetch` covers the platform's REST API.

### Configuration

`deps.baseUrl` (e.g. `http://localhost:3143`), sourced from
`cox.config.json`'s existing `cx.targets.local.baseUrl` field (added to
`@cox/core`'s config schema during `cx-core`'s Task 1) — injected, so
tests point it at a stub server instead of a real process.

### `plan()`

Sees the full `CxSpec`. Embeds the neutral `JourneyMap` and `KpiFrame`
from `spec.design` as JSON into a single `CxBuildStep.description`
(reusing the requirements-survival trick `cx-artifacts` established for
the plan→build handoff — the frozen `build(plan: CxBuildPlan)` signature
never receives the original `CxSpec`), plus the fixed list of the
platform's 13 journey-type keys as match candidates.

### `build()`

Calls `deps.generate()` at **scout tier** — this is classification
(pick the best-matching key from a fixed 13-item list), not creative
generation, so it's cheaper than `cx-artifacts`'s architect-tier design
calls. The response is parsed as JSON naming the matched journey-type
key; an unknown/malformed response throws `CxAdapterError(phase:
"build", retryable: false)`. Produces three artifacts, all re-stamped
with `provenance.targetId: "local"`:

1. A new `AgentDefinition` (`systemPrompt` references the bound journey
   type and its real trigger intents).
2. A pass-through copy of the `JourneyMap` from the plan step.
3. A pass-through copy of the `KpiFrame` from the plan step.

### `deploy()`

Calls `GET /api/journeys/definitions` to confirm the matched journey
type still exists in the live platform — throws `CxAdapterError(phase:
"deploy", retryable: false)` if not (a stale/invalid binding, not a
transient failure). Writes the 3 artifacts to
`.cox/cx/<specName>/local/artifacts/*.json` (mirroring `cx-artifacts`'s
`disk.ts` pattern), one `CxDeploymentResource` per file. This is the
entirety of `deploy()`'s job — validate and record, never mutate the
platform.

### `status()`

`GET /api/health/ready` (platform reachable?) plus `GET /api/journeys`
filtered to the bound journey type. `healthy` if reachable and the
journey type reports activity; `degraded`/`down` otherwise.

### `simulate()`

Re-reads the 3 artifacts off disk via `dep.specName` — this is the *only*
way this method recovers the real `KpiFrame` target values and the bound
journey type, since the frozen `simulate(dep: CxDeployment, traffic:
CxTrafficProfile)` signature gives no other path back to them. Generates
synthetic events from `traffic.personaWeights`/`volumePerMinute`, sized
to `traffic.durationMinutes`, and `POST`s them via
`/api/events/batch` — genuine traffic against the platform's real
event-ingestion pipeline, with a genuine side effect on its live SQLite
state. Afterward, reads `GET /api/dashboard/kpis` and builds
`CxSimReport.outcomes` (`achieved` from the live platform's response,
`target` from the recovered `KpiFrame`).

### `teardown()`

Deletes the local disk artifacts only. Cannot retract synthetic events
already ingested into the platform's live store.

### Capabilities

`["build", "deploy", "status", "simulate", "teardown"]` — no
`"autonomousRemediate"`.

## Error handling

- Network errors from `client.ts`'s fetch calls → `CxAdapterError(retryable:
  true)`.
- HTTP 5xx responses → `retryable: true`; HTTP 4xx → `retryable: false`.
- Journey-type match failure (malformed JSON, unknown key) →
  `CxAdapterError(phase: "build", retryable: false)`.
- `deploy()`'s stale-binding check → `CxAdapterError(phase: "deploy",
  retryable: false)`.
- Disk I/O failures wrap with `retryable: true`, `phase` matching
  whichever method failed (`"deploy"`, `"simulate"`, `"teardown"`).

## Testing (offline)

- `test/client.test.ts`: the fetch wrapper against a real `node:http`
  server bound to an ephemeral `127.0.0.1` port for the test's lifetime —
  standard technique for testing HTTP clients without any real network
  access, not a violation of the house "zero network" rule (which targets
  external services).
- `test/match.test.ts`: scripted `deps.generate` stub — the prompt
  embeds the `JourneyMap` fields and all 13 candidate keys; a valid
  response parses to the matched key; an unknown/malformed response
  throws `CxAdapterError`.
- `test/disk.test.ts`: `fs.mkdtemp`-based, mirrors `cx-artifacts`'s
  `disk.ts` tests — write/read round-trip for the 3 artifacts.
- `test/adapter.test.ts`: full `plan()→build()→deploy()→status()→
  simulate()→teardown()` round trip against the stub HTTP server +
  scripted `generate` + a temp disk dir, including asserting
  `simulate()`'s `POST /api/events/batch` call shape and that
  `outcomes[].target` values match what `deploy()` persisted (not
  hardcoded in the test).
