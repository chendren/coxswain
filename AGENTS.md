# Coxswain — builder agent orientation

Coxswain (`cox`) is a spec-driven, steerable, token-frugal coding agent CLI.
CXOS is the CX operating layer on top (`@cox/cx-*` packages).

This repo is built by **parallel workstreams**; you are probably one of them.

## Read in this order
1. `docs/04-CONVENTIONS.md` — toolchain, style, testing, security rules
2. `packages/core/src/types.ts` — **frozen contracts. NEVER edit core.**
3. Your spec pack: `docs/specs/<workstream>/{requirements,design,tasks}.md`
4. CXOS: `docs/CXOS-COMPLETE.md` (kernel rules, packages, operate loop)
5. Reference when needed: `docs/00`–`03`, `docs/05` (routing/ledger behavior)

## CXOS hard rules
1. **Offline-first.** Live/hybrid only when stack and optional keys are ready.
2. **AWS is plan-only.** Write `template.yaml` + `APPLY.md`; humans apply CFN.
3. **Never CreateStack** (or any live CloudFormation mutate) from Coxswain.
4. **Human-gated proposals.** Console/watch write proposals only; apply = task + human note.
5. **Package import law.** Packages import `@cox/core` and own listed deps only.
   - `cx-*` packages may also import `@cox/cx-core`.
   - Never import another `@cox/*` package. Only `@cox/cli` may (composition root).

## Builder hard rules
- Write only inside your own packages + your own tasks.md checkboxes.
- Contract problems → append to `/INTEGRATION-NOTES.md`; do not work around
  by editing shared code.
- `pnpm --filter @cox/<pkg> typecheck && pnpm --filter @cox/<pkg> test`
  green before every commit. No network, no API keys in tests.

## Commands
- `pnpm install` once; `pnpm typecheck` / `pnpm test` for the whole workspace.
- `pnpm cox` runs the CLI via tsx.

## Map
`packages/` core (frozen) · providers · router · ledger · agent · tools ·
spec · steering · hooks · tui · cli · cx-core · cx-artifacts · cx-local ·
cx-aws · cx-ops · cx-world (Tell/wordmap) — dependency graph in `docs/01-ARCHITECTURE.md`
and `docs/CXOS-COMPLETE.md`. Fixtures: `fixtures/events-sample.jsonl`,
`examples/demo-project/`, `examples/cx-demo/`.
