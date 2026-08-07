# Real CXOS verify summary

**Date:** 2026-08-07  
**Branch:** `main`  
**Focus:** production-shaped OS surfaces beyond complete-cxos (catalog, fleet, health history, archive, snapshot, claim, operate)  
**Result:** All green. No push.

## Verification

| Step | Command | Result |
|---|---|---|
| cx-ops tests | `OPENAI_API_KEY= pnpm --filter @cox/cx-ops test` | 15 files, **51** tests pass |
| cli typecheck | `OPENAI_API_KEY= pnpm --filter @cox/cli typecheck` | `tsc --noEmit` ok |
| cli e2e | `OPENAI_API_KEY= pnpm --filter @cox/cli exec vitest run test/cx-e2e.test.ts` | 4 tests pass |
| Code fixes this pass | failures from real-cxos lanes | None required (tests already green) |

## What "real CXOS" adds

Complete-cxos delivered board, brief, CAB, audit, journeys, init, and the wave4 claim/apply/task loop. Real-cxos deepens into day-2 OS surfaces:

| Surface | Package API | CLI | Behavior |
|---|---|---|---|
| **Catalog** | `inventoryCatalog` | `cox cx catalog [section]` | Strong-only browser: domains, intents, KPIs, NBA rules, channels |
| **Health history** | `appendHealthSample` / `loadHealthHistory` | `cox cx health-history <name>` | Append-only `health-history.jsonl` samples from `status` polls |
| **Archive / restore** | `archiveCxSpec` / `restoreCxSpec` | `cox cx archive` / `restore` | Soft rename to `.archived-<name>` (hidden from list); no delete |
| **Snapshot** | `snapshotCxSpec` | `cox cx snapshot <name> [outDir]` | CAB base + `spec.json` + health/audit/daemon + `SNAPSHOT.md` |
| **Claim** | (tasks `applyProposal`) | `cox cx claim` | Ops alias for `apply` |
| **Operate** | console + board | `cox cx operate <name>` | One-shot console tick + board line + next hints |
| **Fleet status** | board + status | `cox cx fleet-status` | Fleet board plus status poll each deployed spec |

### Control paths

```text
catalog:  load_strong → inventory_catalog → emit
health:   load_health_history → emit  (append on status: summarize → append_sample)
archive:  archive_spec → rename → emit  (CLI audits before rename)
restore:  restore_spec → rename → emit
snapshot: snapshot → cab_base → copy_spec → copy_health → emit
fleet:    fleet_board → status_each → emit
operate:  console tick → board row → emit
```

### Kernel rules (unchanged)

1. Console / watch / daemon **propose** only; no silent prod mutation.
2. AWS remains plan-only (`template.yaml` + `APPLY.md`); never CreateStack.
3. Offline-first; live/hybrid when stack and optional keys are ready.
4. Strong graph first; NBA and catalog are zero-model.
5. Import law: `cx-*` → `@cox/core` + `@cox/cx-core` only; CLI is composition root.

## Operator quick start

```bash
# Closed world
pnpm cx:catalog
pnpm cox cx catalog nba --pack local

# Day-2 operate
pnpm cox cx status billing --live          # also appends health-history.jsonl
pnpm cox cx health-history billing
pnpm cx:operate -- billing
pnpm cox cx claim billing prop_…
pnpm cox cx tasks billing
pnpm cox cx task billing task_… done

# Fleet + handoff
pnpm cx:fleet
pnpm cox cx snapshot billing
pnpm cox cx archive old-program
pnpm cox cx restore old-program
```

Root scripts: `cx:catalog`, `cx:fleet`, `cx:operate` (plus existing `cx:board`, `cx:doctor`, `cx:run`, …).

## Files (real-cxos lane)

| Path | Role |
|---|---|
| `packages/cx-ops/src/catalog.ts` | `inventoryCatalog` |
| `packages/cx-ops/src/health-history.ts` | Health sample JSONL |
| `packages/cx-ops/src/archive.ts` | Soft archive / restore |
| `packages/cx-ops/src/snapshot.ts` | Full program snapshot |
| `packages/cx-ops/src/index.ts` | Re-exports |
| `packages/cx-ops/test/catalog-health-archive.test.ts` | Unit coverage |
| `packages/cx-ops/README.md` | Module + CLI mapping |
| `packages/cli/src/commands/cx.ts` | `runCxCatalog`, health-history, archive/restore, snapshot, claim, operate, fleet-status; status appends samples; archive audits **before** rename |
| `packages/cli/src/main.ts` | Command wiring |
| `package.json` | `cx:catalog` `cx:fleet` `cx:operate` |
| `docs/CXOS-COMPLETE.md` | Full inventory + layers |
| `docs/CXOS.md` | North star (linked from complete map) |
| `examples/cx-demo/README.md` | Demo tracks |
| `.grok/workflows/real-cxos.rhai` | Parallel map/build/verify workflow |

Related land commits (before this verify summary):

- `e9bb599` test(cx-ops): real OS coverage for catalog, health history, archive, snapshot
- `74cf69b` fix(cxos): archive audit before rename; expand REAL OS docs
- `a14887d` docs(cx-ops): real OS module table
- `13ea850` chore(cx): package scripts for catalog, fleet, operate

## Workflow

`.grok/workflows/real-cxos.rhai` - map real OS gaps, parallel build lanes (ops modules, CLI, docs, readme, verify), final verify.

## Docs map

| Doc | Role |
|---|---|
| **This file** | Real-cxos verify + operator delta |
| [`CXOS-COMPLETE.md`](./CXOS-COMPLETE.md) | Full OS map (all lifecycle commands) |
| [`CXOS.md`](./CXOS.md) | Technical north star |
| [`CXOS-PERSONAS-USE-CASES.md`](./CXOS-PERSONAS-USE-CASES.md) | Personas / playbooks |
| [`WAVE4-SUMMARY.md`](./WAVE4-SUMMARY.md) | Prior operate-loop wave |
| [`packages/cx-ops/README.md`](../packages/cx-ops/README.md) | Operate package API |

## Verify agent note

This pass re-ran the green suite with empty `OPENAI_API_KEY`, cleaned duplicate rows in `docs/CXOS-COMPLETE.md` / `package.json` scripts, and wrote this summary. No product code failures. Do not push.
