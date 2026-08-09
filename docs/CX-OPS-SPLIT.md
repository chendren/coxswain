# CX-OPS God Module Split — Design Doc

> Split `@cox/cx-ops` (≈37 files, 5,078 lines) into three focused packages:
> `cx-fleet` · `cx-govern` · `cx-obs`.
> Status: **proposed** · Author: release engineering · Date: 2026-02-13

## 1. Goals / non-goals

### Goals
- Reduce `cx-ops` blast radius: each fleet/govern/observe change touches one package.
- Make import law enforceable per package (each imports only `@cox/core` + `@cox/cx-core`).
- Preserve CLI (`@cox/cli`) as sole composition root; no adapter cross-imports.
- Keep typecheck green at every migration step; no flag-day.
- Unblock independent versioning via changesets for fleet vs govern vs obs.

### Non-goals
- No runtime behavior change (same `cox cx …` surface, same files on disk).
- No new external deps (still `node:*` + workspace deps only).
- No change to AWS human-gated apply (plan-only stays).
- No auth for hosted dashboard in this phase (protected network assumption).

## 2. Current inventory (37 files)

| # | Module | Lines | Role | Proposed owner |
|---|---:|---|---:|---|
| 1 | `workspace` | 273 | Disk layout, phase gates, target parse | **shared kernel** → `cx-obs` initially, re-exported |
| 2 | `telco-design-pack` | 508 | Synthetic design pack (closed-world) | `cx-obs` |
| 3 | `offline-adapters` | 434 | Deterministic local+aws offline adapters | `cx-obs` (or keep in `cx-ops` compat shim) |
| 4 | `offline-artifacts` | 317 | Offline artifacts adapter | `cx-obs` |
| 5 | `orchestrate` | 324 | Multi-target graph (artifacts→local/aws) | `cx-obs` (build) |
| 6 | `daemon` | 285 | Detached watch (pid/log/json) | `cx-fleet` |
| 7 | `cfn-skeleton` | 116 | CFN plan-only skeleton | `cx-govern` |
| 8 | `proposals` | 206 | proposals.json store + legal transitions | `cx-fleet` |
| 9 | `tasks` | 223 | Task apply bridge + remediation | `cx-fleet` |
| 10 | `console` | 118 | One tick: poll→route→NBA→propose | `cx-fleet` |
| 11 | `watch` | 117 | Bounded console loop | `cx-fleet` |
| 12 | `board` | ~100 | Fleet board rollup | `cx-fleet` |
| 13 | `fleet-queue` | 117 | Cross-spec work queue | `cx-fleet` |
| 14 | `board-sync` | ~140 | Fleet JSON export/import | `cx-fleet` |
| 15 | `dashboard-html` | 115 | Pure HTML renderer | `cx-fleet` |
| 16 | `cab-export` | 140 | CAB package | `cx-govern` |
| 17 | `snapshot` | ~110 | Snapshot (CAB+spec+health) | `cx-govern` |
| 18 | `brief` | 117 | Exec markdown brief | `cx-govern` |
| 19 | `audit` | ~80 | Append-only audit.jsonl | `cx-govern` |
| 20 | `archive` | ~60 | Soft-archive rename | `cx-govern` |
| 21 | `aws-drift` | 123 | Drift check (read-only) | `cx-govern` |
| 22 | `deploy-history` | ~70 | Deploy history jsonl | `cx-govern` |
| 23 | `status` | ~60 | Adapter status/sim/teardown passthrough | `cx-obs` |
| 24 | `report` | 107 | Cross-target report + scout summary | `cx-obs` |
| 25 | `nba` | 106 | Pure graph NBA recommend | `cx-obs` |
| 26 | `stack-health` | 126 | Ollama + platform probes | `cx-obs` |
| 27 | `metrics-summary` | ~50 | Health rollup score | `cx-obs` |
| 28 | `health-history` | ~80 | health-history.jsonl | `cx-obs` |
| 29 | `catalog` | ~90 | Catalog browser | `cx-obs` |
| 30 | `journeys` | ~70 | Journey inventory | `cx-obs` |
| 31 | `ontology` | ~80 | Pack resolve + graph stats | `cx-obs` |
| 32 | `graph-query` | ~70 | Strong-graph lookup | `cx-obs` |
| 33 | `notify` | ~60 | Webhook fire-and-forget | `cx-fleet` |
| 34 | `seed-operate` | ~70 | Seed drill proposals | `cx-fleet` |
| 35 | `env-root` | ~25 | CX_ENV root resolver | shared → `cx-obs` |
| 36 | `path-audit` | ~40 | Path collapse helpers | shared → `cx-obs` |
| 37 | `json-extract` | ~40 | Fence-strip JSON | shared → `cx-obs` |
| | **total** | **5,078** | | |

Counts from `wc -l packages/cx-ops/src/*.ts` (2026-02-13).

## 3. Proposed packages

### 3.1 `@cox/cx-fleet` — operate loop + fleet rollup

```
packages/cx-fleet/
  package.json   (imports: @cox/core, @cox/cx-core)
  src/
    index.ts
    board.ts
    fleet-queue.ts
    board-sync.ts
    dashboard-html.ts
    console.ts
    watch.ts
    daemon.ts
    proposals.ts
    tasks.ts
    notify.ts
    seed-operate.ts
```

Public API: `buildOpsBoard`, `buildWorkQueue`, `exportBoardSync`, `importBoardSync`,
`renderOpsDashboardHtml`, `runConsoleTick`, `runWatchLoop`, `spawnWatchDaemon`/`isDaemonRunning`/`readDaemonMeta`/`stopDaemon`, `loadProposals`/`transitionProposal`/`suggestedProposalNext`/`proposalUrgencyScore`, `applyProposal`/`transitionTask`/`loadCxTasks`/`summarizeTasks`, `notifyWebhook`, `seedOperateDrill`.

Rationale: these form the human-gated operate loop and the multi-spec fleet view. They share `proposals.json`/`tasks.json` stores and the `console → watch → daemon` chain.

### 3.2 `@cox/cx-govern` — evidence + change board + AWS handoff

```
packages/cx-govern/
  package.json
  src/
    index.ts
    brief.ts
    cab-export.ts
    snapshot.ts
    audit.ts
    archive.ts
    cfn-skeleton.ts
    aws-drift.ts
    deploy-history.ts
```

Public API: `renderExecBrief`, `exportCabPackage`, `snapshotCxSpec`, `appendAuditEvent`/`loadAuditEvents`, `archiveCxSpec`/`restoreCxSpec`, `buildCfnSkeleton`, `checkAwsDrift`, `appendDeployHistory`/`loadDeployHistory`.

Rationale: all govern is filesystem evidence for humans (BRIEF.md, CAB, snapshot, audit) plus plan-only AWS. No proposal/task mutation.

### 3.3 `@cox/cx-obs` — observe + catalog + shared kernel

```
packages/cx-obs/
  package.json
  src/
    index.ts
    status.ts
    report.ts
    stack-health.ts
    metrics-summary.ts
    health-history.ts
    nba.ts
    catalog.ts
    journeys.ts
    ontology.ts
    graph-query.ts
    orchestrate.ts
    offline-adapters.ts
    offline-artifacts.ts
    telco-design-pack.ts
    workspace.ts
    env-root.ts
    path-audit.ts
    json-extract.ts
```

Public API: `getStatus`/`runSimulate`/`runTeardown`, `generateReport`, `probeStackHealth`/`probeOllama`/`probePlatformReady`, `summarizeDeployments`, `appendHealthSample`/`loadHealthHistory`, `opsRecommendNba`/`parseNbaContext`, `inventoryCatalog`, `listJourneys`, `resolveOntologyPack`/`showOntology`/`validateOntologyPack`/`showStrongGraph`, `lookupStrongNode`, plus build/orchestrate (`orchestrateBuild`/`orchestrateStatus`/`orchestrateSimulate`/`orchestrateReport`/`seedDesignFromIdea`) and workspace/kernel (`createCxSpec`/`loadCxWorkspace`/`listCxSpecs`/`approveCxPhase`/`parseTargets` etc.), offline adapters.

Rationale: observe is read-only health + pure graph catalog. Workspace/env-root/path-audit/json-extract are the shared kernel; placing them in `cx-obs` avoids a fourth `cx-kernel` package for now. `cx-fleet` and `cx-govern` depend on `cx-obs` for `CxWorkspaceDeps` types and constants, never the reverse.

### Dependency DAG

```
cx-obs  (no cx-* deps; imports @cox/core, @cox/cx-core)
  ↑
cx-fleet ─→ cx-obs
cx-govern ─→ cx-obs
  ↑
@cox/cli (composition root; depends on all three + cx-artifacts/cx-local/cx-aws)
```

No cycles. `cx-fleet` and `cx-govern` never import each other.

## 4. Public API & re-export plan

Phase 1 keeps `@cox/cx-ops` as a compat shim: `packages/cx-ops/src/index.ts` re-exports from the three new packages so existing imports (`from "@cox/cx-ops"`) keep typechecking. New code imports directly from `@cox/cx-fleet` etc. We add `deprecated` JSDoc on the shim.

Phase 2 (next minor): CLI switches to direct imports; tests import new packages.

Phase 3 (next major): delete `cx-ops` or leave as barrel of re-exports.

## 5. Migration phases

### Phase 0 — prep (this doc)
- Land docs, hosted dashboard (`packages/cli/src/commands/serve.ts`), changesets + release.yml.
- Keep typecheck green; no file moves.

### Phase 1 — scaffold new packages (1 PR)
- `pnpm --filter @cox/cx-fleet exec tsc --noEmit` scaffolding: copy files verbatim, fix relative imports to `../cx-obs` where kernel is needed.
- Add `packages/cx-fleet/package.json`, `packages/cx-govern/package.json`, `packages/cx-obs/package.json` (each `workspace:*` deps).
- Update `pnpm-workspace.yaml` (already `packages/*`, no change).
- Make `packages/cx-ops/src/index.ts` re-export from new packages; verify `pnpm typecheck` passes.

### Phase 2 — CLI wiring (1 PR)
- `packages/cli/src/commands/cx.ts` + `packages/cli/src/cx/runtime.ts` import from new packages (prefer direct) while keeping `@cox/cx-ops` as fallback.
- Add `cx serve` (already landed) — it depends only on `cx-fleet` + `cx-obs` kernel, proving the split.
- Run `pnpm test --filter @cox/cli` + `pnpm test --filter @cox/cx-fleet` etc.

### Phase 3 — tests & docs (1 PR)
- Move `packages/cx-ops/test` suites into matching packages.
- Update `packages/cx-ops/README.md` module table to point to new packages.
- Update `docs/CXOS-COMPLETE.md` § Fleet/Govern/Observe package map.

### Phase 4 — deprecate shim (major)
- Remove `packages/cx-ops` or keep as thin barrel. Bump major via changeset.

## 6. Import law (per package)

```ts
// allowed in cx-fleet / cx-govern / cx-obs
import { … } from "@cox/core";
import { … } from "@cox/cx-core";
// cx-fleet and cx-govern may also
import { … } from "@cox/cx-obs";

// forbidden everywhere
import { … } from "@cox/cx-artifacts";
import { … } from "@cox/cx-local";
import { … } from "@cox/cx-aws";
import { … } from "@cox/cx-fleet"; // inside cx-govern and cx-obs
```

Enforced by `eslint` `no-restricted-imports` per package (add to root eslint config).

## 7. Hosted dashboard (`cox cx serve`)

Implemented in this wave: `packages/cli/src/commands/serve.ts` serves `renderOpsDashboardHtml(board, queue)` via `node:http` on `--port` (default 3000). Binds `127.0.0.1` only, no auth (protected network assumption), offline wiring. Routes: `GET /` and `GET /dashboard` → HTML, `GET /healthz` → JSON, else 404. Regenerates board+queue per request (no cache). Registered as `cox cx serve --port <n>` in `packages/cli/src/main.ts`.

## 8. Changesets & release

- `.changeset/config.json` (base `main`, changelog `@changesets/changelog-github`, `linked: []`, `access: restricted`).
- Root `package.json` scripts: `changeset:version` (`changeset version`), `changeset:publish` (`changeset publish`), `release` (version + lockfile).
- `.github/workflows/release.yml`: `changesets/action@v1` for version PR / npm publish (needs `NPM_TOKEN`), plus GHCR Docker publish (`docker/build-push-action@v5` with `ghcr.io/<repo>`, tags `latest` + `sha`, platforms `linux/amd64,linux/arm64`). Runs on push to `main` and `workflow_dispatch`; Docker job gated on `main`.

## 9. Risk & mitigations

| Risk | Mitigation |
|---|---|
| Circular deps via `workspace` kernel | Keep kernel in `cx-obs`; fleet/govern depend downward only |
| `offline-adapters` needs both worlds | Keep in `cx-obs`; live adapters stay in `@cox/cli` runtime, not in these packages |
| Typecheck breakage during move | Phase 1 copies verbatim + re-exports shim keeps `cx-ops` consumers green |
| pnpm workspace peer duplication | All new packages `workspace:*` on `@cox/cx-core`; root `pnpm install --frozen-lockfile` |
| Dashboard serve port conflict | Validate 1-65535; bind 127.0.0.1 only; log bound port |

## 10. Alternatives considered

- **Keep God module, add lint rules only**: cheaper but does not reduce review blast radius; rejected.
- **Four packages (+ `cx-kernel`)**: cleaner but over-splits 40-line helpers; deferred until kernel grows.
- **Monorepo codegen to auto-split**: fragile; manual move + re-export shim is explicit and reviewable.

## 11. Open questions

- Should `deploy-history` live in govern (handoff evidence) or obs (status trail)? Proposed govern; can move to obs if reviewers prefer.
- Should `notify` stay in fleet or become a shared `cx-notify` util? Kept in fleet for now (only proposals use it).
- When to delete the `cx-ops` shim? Propose next major; keep at least one minor of deprecation warnings.

## 12. Acceptance criteria

- [x] This doc merged.
- [ ] Phase 1 scaffold PR: `pnpm typecheck` green, `pnpm test` green, `@cox/cx-ops` re-exports preserve API.
- [ ] `cox cx serve --port 3000` serves live dashboard HTML; `curl /healthz` returns 200.
- [ ] `pnpm changeset:version` / `pnpm changeset:publish` scripts present; `.changeset/config.json` valid.
- [ ] `release.yml` pushes to GHCR on `main` (verify via dry-run / metadata action).
- [ ] No `cx-ops` → `cx-artifacts`/`cx-local`/`cx-aws` imports (eslint).
