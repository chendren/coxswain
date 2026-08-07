# SuperHeavy CXOS - mass-parallel expansion summary

**Date:** 2026-08-07  
**Branch:** `main`  
**Focus:** Mass-parallel SuperHeavy lanes that add fleet work queue, offline HTML
ops dashboard, strong-graph find, urgency scoring, monorepo scripts, and
operator run path for the full CXOS surface.  
**Workflow:** [`.grok/workflows/cxos-superheavy.rhai`](../.grok/workflows/cxos-superheavy.rhai)  
**Result:** Product surfaces landed in `@cox/cx-ops` + `@cox/cli`. No push.

Prior waves: [`WAVE4-SUMMARY.md`](./WAVE4-SUMMARY.md) (operate loop),
[`COMPLETE-CXOS-SUMMARY.md`](./COMPLETE-CXOS-SUMMARY.md) (fleet/govern),
[`REAL-CXOS-SUMMARY.md`](./REAL-CXOS-SUMMARY.md) (catalog/archive/snapshot).
Full map: [`CXOS-COMPLETE.md`](./CXOS-COMPLETE.md).

---

## What SuperHeavy adds

| Surface | Package API | CLI (`packages/cli/src/main.ts`) | Behavior |
|---|---|---|---|
| **Work queue** | `buildWorkQueue` (`fleet-queue.ts`) | `cox cx queue` | Cross-spec open/claimed proposals + pending/in_progress tasks; urgency + age sort; claim/task next lines |
| **HTML dashboard** | `renderOpsDashboardHtml` (`dashboard-html.ts`) | `cox cx dashboard [outFile]` | Self-contained dark HTML (board cards + fleet table + queue tables); default `cxos-dashboard.html` |
| **Graph find** | `lookupStrongNode` (`graph-query.ts`) | `cox cx graph-find <query> [--pack local\|default]` | Strong-graph node search by id/uid/name/kind/hubKey; top 20; zero models |
| **Urgency score** | `proposalUrgencyScore` (`proposals.ts`) | used by `queue` | Pure 0-100: remediate base 70, investigate 45, else 25; +1/hour cap +30 |

Root scripts:

| Script | Maps to |
|---|---|
| `pnpm cx:queue` | `cox cx queue` |
| `pnpm cx:dashboard` | `cox cx dashboard` |
| `pnpm cx:graph-find` | `cox cx graph-find` |

---

## CLI registration (`main.ts`)

Composition root imports and registers three handlers next to other fleet
commands:

```text
imports: runCxQueue, runCxDashboard, runCxGraphFind

cx queue
  description: cross-spec work queue (open proposals + tasks)
  handler: runCxQueue(cxCtx)

cx dashboard [outFile]
  description: write self-contained HTML ops dashboard (default cxos-dashboard.html)
  handler: runCxDashboard(cxCtx, outFile)

cx graph-find <query>
  description: search strong ontology graph nodes by id/name/kind
  option: --pack <name>  default|local  (default: local)
  handler: runCxGraphFind(cxCtx, query, pack)
```

Handlers live in `packages/cli/src/commands/cx.ts`:

| Handler | Control path (printed) |
|---|---|
| `runCxQueue` | `list_specs → load_proposals_tasks → sort → emit` |
| `runCxDashboard` | `board → queue → render_html → emit` |
| `runCxGraphFind` | `load_strong → materialize_graph → search → emit` |

### Queue output shape

```text
CXOS queue  proposals=N tasks=M specs_with_work=K
## proposals
  <spec>  <prop_id>  [status/kind] urg=high|med|low score=N age=Nh next=apply|…
    → cox cx claim <spec> <prop_id>     # when next=apply
## tasks
  <spec>  <task_id>  [status] age=Nh  <title>
    → cox cx task <spec> <task_id> done
```

Empty queue hints: `cox cx operate <name>` or `console` to generate work.

### Dashboard

- Builds `buildOpsBoard` + `buildWorkQueue`, then `renderOpsDashboardHtml`.
- Writes under `cwd` (default `cxos-dashboard.html`).
- Offline-safe: no external CSS/JS CDNs; cards for specs / deployed /
  proposals / tasks / daemons; fleet table; optional proposal/task tables
  (capped at 40 rows each in HTML).

### Graph-find

- Pack default **local** (CLI); searches case-insensitive substring on
  uid, id, name, kind, hubKey.
- Prints `uid kind= name= hub=` per hit; empty → try domain/journey/intent
  fragment.

---

## Concurrent SuperHeavy workflow

File: `.grok/workflows/cxos-superheavy.rhai`

Phases:

1. **Map** (read-only): gap inventory of `main.ts` `cx` surface vs
   `cx-ops` modules and `CXOS-COMPLETE.md`.
2. **Build** (mass parallel): ten partitioned lanes via `parallel(jobs)` so
   agents avoid file thrash:

| Lane label | Scope | Deliverable |
|---|---|---|
| `build:fleet-queue` | `cx-ops` only | `fleet-queue.ts` + tests |
| `build:dashboard-html` | `cx-ops` only | `dashboard-html.ts` + tests |
| `build:graph-query` | `cx-ops` only | `graph-query.ts` + tests |
| `build:cli-queue-dash` | `cli` only | wire `queue` / `dashboard` / `graph-find` in `main.ts` + `commands/cx.ts` |
| `build:e2e-surface` | `cli/test` | offline OS surface e2e (optional follow-on) |
| `build:runbook` | `docs` | operator runbook (optional follow-on) |
| `build:multi-demo` | `examples/cx-demo` | multi-program demo (optional follow-on) |
| `build:brief-health` | `cx-ops` brief | optional health history line |
| `build:urgency-score` | `proposals.ts` | `proposalUrgencyScore` |
| `build:pkg-scripts` | root `package.json` | `cx:queue`, `cx:dashboard`, `cx:graph-find` |

3. **Verify**: `OPENAI_API_KEY=` cx-ops tests, CLI typecheck / e2e, fix merge
   fallout, write this summary, commit (do not push).

Lane ownership is intentional: ops modules, CLI wiring, and scripts can land
concurrently without competing on the same files.

---

## Files (SuperHeavy)

| Path | Role |
|---|---|
| `packages/cx-ops/src/fleet-queue.ts` | `buildWorkQueue`, queue types |
| `packages/cx-ops/src/dashboard-html.ts` | `renderOpsDashboardHtml` |
| `packages/cx-ops/src/graph-query.ts` | `lookupStrongNode` |
| `packages/cx-ops/src/proposals.ts` | `proposalUrgencyScore` |
| `packages/cx-ops/src/index.ts` | re-exports fleet-queue, dashboard-html, graph-query |
| `packages/cx-ops/test/superheavy-surface.test.ts` | urgency, lookup, queue aggregate, HTML |
| `packages/cli/src/commands/cx.ts` | `runCxQueue`, `runCxDashboard`, `runCxGraphFind` |
| `packages/cli/src/main.ts` | Commander registration for the three commands |
| `package.json` | `cx:queue`, `cx:dashboard`, `cx:graph-find` |
| `.grok/workflows/cxos-superheavy.rhai` | Map / parallel build / verify workflow |
| `docs/SUPERHEAVY-SUMMARY.md` | This file |

---

## How to run the full OS

Offline-first. Clear or omit live keys unless you intentionally run hybrid/live.

### 0. Install and smoke

```bash
pnpm install
pnpm --filter @cox/cx-ops test
pnpm --filter @cox/cli typecheck
```

### 1. Design + stand up a program

```bash
pnpm cx:init
pnpm cox cx catalog --pack local
pnpm cox cx graph-find billing --pack local
pnpm cox cx run billing "reduce dispute handle time"
# golden demo:
pnpm cx:golden
```

### 2. Day-2 operate (propose → claim → task → done)

```bash
pnpm cox cx status billing
pnpm cox cx operate billing          # console tick + board line
pnpm cox cx console billing
pnpm cox cx proposals billing
pnpm cox cx claim billing prop_…     # or: apply
pnpm cox cx tasks billing
pnpm cox cx task billing task_… done
```

### 3. SuperHeavy fleet views

```bash
pnpm cx:board
pnpm cx:fleet
pnpm cx:queue                        # cross-spec work queue
pnpm cx:dashboard                    # writes cxos-dashboard.html
pnpm cx:dashboard -- ./ops.html      # custom path
pnpm cx:graph-find -- billing
pnpm cox cx graph-find journey --pack default
```

### 4. Govern + evidence

```bash
pnpm cox cx brief billing
pnpm cox cx audit billing
pnpm cox cx cab-export billing
pnpm cox cx snapshot billing
pnpm cox cx health-history billing
pnpm cox cx export-aws billing
```

### 5. Lifecycle

```bash
pnpm cox cx archive billing
pnpm cox cx restore billing
pnpm cox cx list
```

### 6. Live / hybrid (optional fabric)

```bash
pnpm cx:stack-up                     # Ollama + Nexus platform
pnpm cox cx doctor --live
pnpm cox cx status billing --live
pnpm cox cx fleet-status --live
pnpm cox cx daemon start billing --live
pnpm cox cx daemon status billing
pnpm cox cx daemon stop billing
# or: pnpm cx:golden:live
```

LaunchAgents (macOS always-on): `./scripts/macos/install-launchagents.sh`.

---

## Control paths (SuperHeavy)

```text
queue:      list_specs → load_proposals_tasks → sort → emit
dashboard:  board → queue → render_html → emit
graph-find: load_strong → materialize_graph → search → emit
urgency:    pure score(kind, ageHours) → queue score= field
```

---

## Kernel rules (unchanged)

1. Console / watch / daemon **propose** only; no silent prod mutation.
2. AWS remains plan-only (`template.yaml` + `APPLY.md`); never CreateStack.
3. Offline-first; live/hybrid when stack and optional keys are ready.
4. Strong graph first; queue, dashboard, and graph-find are zero-model.
5. Import law: `cx-*` → `@cox/core` + `@cox/cx-core` only; CLI is composition root.

---

## Docs map

| Doc | Role |
|---|---|
| **This file** | SuperHeavy verify + queue/dashboard/graph-find + full OS run |
| [`CXOS-COMPLETE.md`](./CXOS-COMPLETE.md) | Full OS map (layers, inventory, gates) |
| [`COMPLETE-CXOS-SUMMARY.md`](./COMPLETE-CXOS-SUMMARY.md) | Complete OS wave |
| [`REAL-CXOS-SUMMARY.md`](./REAL-CXOS-SUMMARY.md) | Catalog / archive / snapshot wave |
| [`WAVE4-SUMMARY.md`](./WAVE4-SUMMARY.md) | Claim / apply / task loop |
| [`CXOS.md`](./CXOS.md) | Technical cheat sheet |
| [`CXOS-OPERATOR-RUNBOOK.md`](./CXOS-OPERATOR-RUNBOOK.md) | Day-1 / day-2 procedures (SuperHeavy runbook lane) |
| [`packages/cx-ops/README.md`](../packages/cx-ops/README.md) | Module + CLI mapping (includes fleet-queue, dashboard-html, graph-query) |

---

## Note

This summary matches `main.ts` command descriptions and the `runCx*` handlers
as of SuperHeavy land. Core product delta: queue / dashboard / graph-find /
scripts / urgency / superheavy tests; runbook and CXOS-COMPLETE inventory
updates landed in sibling lanes. Commit only; do not push.
