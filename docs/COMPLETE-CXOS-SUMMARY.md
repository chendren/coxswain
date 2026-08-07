# Complete CXOS — summary

**Date:** 2026-08-07  
**Branch:** `main`  
**Scope:** Complete OS surfaces (fleet / govern / catalog lifecycle) plus real-OS
program management (catalog browser, archive/restore, snapshot, health history,
fleet-status, claim/operate shortcuts).

Product map: [`CXOS-COMPLETE.md`](./CXOS-COMPLETE.md).  
Personas: [`CXOS-PERSONAS-USE-CASES.md`](./CXOS-PERSONAS-USE-CASES.md).  
Cheat sheet: [`CXOS.md`](./CXOS.md).  
Operate API: [`packages/cx-ops/README.md`](../packages/cx-ops/README.md).

---

## Verification (this pass)

| Check | Result |
|---|---|
| `OPENAI_API_KEY= pnpm --filter @cox/cx-ops test` | **51/51** green |
| `pnpm --filter @cox/cli typecheck` | green |
| `pnpm --filter @cox/cli exec vitest run test/cx-e2e.test.ts test/cx-runtime.test.ts` | **9/9** green |

No push. Commit only when the above is green (this commit).

---

## New CLI commands (`cox cx …`)

Commands added or completed across **complete-cxos** and **real-cxos** (beyond
wave4 operate loop). All are offline-safe unless noted.

### Design / catalog

| Command | Purpose |
|---|---|
| `journeys [--pack default\|local]` | Closed-world journey inventory (stages, terminals, triggers) |
| `init` | Ensure `.cox/cx`; seed `starter` if empty |
| `catalog [section] [--pack …]` | Catalog browser: `all` \| `domains` \| `intents` \| `kpis` \| `nba` \| `channels` |

### Fleet / one-shot ops

| Command | Purpose |
|---|---|
| `board` | Multi-spec ops board (phases, proposals, tasks, daemons) |
| `fleet-status` | Board + status poll for each deployed spec |
| `operate <name>` | One-shot: console tick + board line for one program |
| `claim <name> <proposalId>` | Alias for `apply` (ops claim language) |

### Govern / evidence

| Command | Purpose |
|---|---|
| `brief <name> [outFile]` | Executive markdown brief (no model) |
| `audit <name> [--limit N]` | Read append-only `audit.jsonl` trail |
| `cab-export <name> [outDir]` | CAB package: AWS plan, remediations, proposals/tasks, BRIEF, MANIFEST |

### Program lifecycle (real OS)

| Command | Purpose |
|---|---|
| `archive <name>` | Soft-archive → `.cox/cx/.archived-<name>` (hidden from list) |
| `restore <name>` | Restore soft-archived program |
| `snapshot <name> [outDir]` | Full snapshot (CAB base + spec + health/audit + SNAPSHOT.md); default `cx-snapshot/<name>` |
| `health-history <name> [--limit N]` | Recent health score samples (written by `status`) |

### Pre-existing surface (still core)

Design: `ontology show|validate|graph`, `nba`, `new`, `approve`, `list`  
Build: `plan`, `build`, `deploy`, `run`, `teardown`  
Observe: `doctor`, `status`, `simulate`, `report`  
Propose: `console`, `watch`, `daemon start|status|stop`  
Close-out: `proposals`, `proposal`, `apply`, `tasks`, `task`  
Govern also: `export-aws`

---

## Monorepo scripts (`package.json`)

| Script | Maps to |
|---|---|
| `pnpm cx:init` | `cox cx init` |
| `pnpm cx:board` | `cox cx board` |
| `pnpm cx:fleet` | `cox cx fleet-status` |
| `pnpm cx:catalog` | `cox cx catalog` |
| `pnpm cx:operate` | `cox cx operate` |
| `pnpm cx:journeys` | `cox cx journeys` |
| `pnpm cx:run` | `cox cx run` |
| `pnpm cx:doctor` | `cox cx doctor` |
| `pnpm cx:golden` / `cx:golden:live` | demo golden path |
| `pnpm cx:stack-up` | Ollama + Nexus fabric |

---

## New / changed files

### `@cox/cx-ops` modules (new)

| File | Role |
|---|---|
| `packages/cx-ops/src/board.ts` | Multi-spec fleet rollup |
| `packages/cx-ops/src/brief.ts` | Executive markdown (pure) |
| `packages/cx-ops/src/cab-export.ts` | CAB filesystem package |
| `packages/cx-ops/src/audit.ts` | Append-only `audit.jsonl` |
| `packages/cx-ops/src/journeys.ts` | Journey inventory from ontology pack |
| `packages/cx-ops/src/catalog.ts` | Closed catalog inventory (domains/KPIs/NBA/channels) |
| `packages/cx-ops/src/health-history.ts` | `health-history.jsonl` samples from status |
| `packages/cx-ops/src/archive.ts` | Soft archive / restore rename |
| `packages/cx-ops/src/snapshot.ts` | Full program snapshot dir |

Also touched: `index.ts` (re-exports), `workspace.ts`, `path-audit.ts`,
`proposals.ts` / `tasks.ts` (wave4 edges), `README.md` (module + CLI tables).

### `@cox/cx-ops` tests (new)

| File | Covers |
|---|---|
| `packages/cx-ops/test/board-brief-cab.test.ts` | board, brief, CAB, audit, journeys |
| `packages/cx-ops/test/catalog-health-archive.test.ts` | catalog, health-history, archive, snapshot |
| `packages/cx-ops/test/tasks-summary.test.ts` | task rollup / resolveSource (wave4) |

### `@cox/cli` (composition root)

| File | Role |
|---|---|
| `packages/cli/src/commands/cx.ts` | Handlers for all new `cx` surfaces |
| `packages/cli/src/main.ts` | Commander registration |
| `packages/cli/test/cx-e2e.test.ts` | Offline golden e2e (existing) |
| `packages/cli/test/cx-runtime.test.ts` | Runtime wiring (existing) |

### Docs and workflows

| File | Role |
|---|---|
| `docs/CXOS-COMPLETE.md` | Full OS map (layers, inventory, gates, packages) |
| `docs/CXOS-PERSONAS-USE-CASES.md` | Personas, JTBD, playbooks |
| `docs/CXOS.md` | Technical cheat sheet (updated) |
| `docs/WAVE4-SUMMARY.md` | Operate-loop wave summary |
| `docs/COMPLETE-CXOS-SUMMARY.md` | This file |
| `examples/cx-demo/README.md` | Demo tracks updated |
| `.grok/workflows/complete-cxos.rhai` | Complete-OS build workflow |
| `.grok/workflows/real-cxos.rhai` | Catalog/archive/snapshot workflow |
| `.grok/workflows/enhance-cxos-wave4.rhai` | Wave4 operate edges |

---

## Operator cheat path

```bash
# Design + build
pnpm cx:init
pnpm cox cx catalog --pack local
pnpm cox cx run billing "reduce dispute handle time"

# Day-2 operate
pnpm cox cx status billing
pnpm cox cx health-history billing
pnpm cox cx console billing
pnpm cox cx claim billing prop_…          # or: apply
pnpm cox cx tasks billing
pnpm cox cx task billing task_… done

# Fleet + govern
pnpm cx:board
pnpm cx:fleet
pnpm cox cx brief billing
pnpm cox cx audit billing
pnpm cox cx cab-export billing
pnpm cox cx snapshot billing

# Lifecycle
pnpm cox cx archive billing
pnpm cox cx restore billing
```

---

## Hard rules (unchanged)

1. No silent prod mutation (console/watch/daemon propose only).
2. AWS is plan-only (template + APPLY.md; human CFN).
3. Offline-first; live only when stack/keys ready.
4. Strong graph for NBA/console routing; weak models optional for generate.
5. Import law: `cx-*` packages import only `@cox/core` and `@cox/cx-core`;
   CLI is sole composition root.

---

## Related commits (recent)

| Commit | Summary |
|---|---|
| `29afc7f` | complete OS surfaces: board, brief, CAB, audit, journeys, init |
| `e9bb599` | real OS: catalog, health-history, archive, snapshot + tests |
| `74cf69b` | archive audit-before-rename; expand REAL OS docs |
| `a14887d` | cx-ops README module table for real-OS modules |
| `13ea850` | package scripts: `cx:catalog`, `cx:fleet`, `cx:operate` |
| `a3394f6` | wave4: proposal edges, apply --resolve, task board |
