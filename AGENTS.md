# Coxswain — builder agent orientation

Coxswain (`cox`) is a spec-driven, steerable, token-frugal coding agent CLI.
This repo is built by **parallel workstreams**; you are probably one of them.

## Read in this order
1. `docs/04-CONVENTIONS.md` — toolchain, style, testing, security rules
2. `packages/core/src/types.ts` — **frozen contracts. NEVER edit core.**
3. Your spec pack: `docs/specs/<workstream>/{requirements,design,tasks}.md`
4. Reference when needed: `docs/00`–`03`, `docs/05` (routing/ledger behavior)

## Hard rules
- Imports: your package may import `@cox/core` and its own listed deps. Never
  another `@cox/*` package (only `@cox/cli` may — it's the composition root).
- Write only inside your own packages + your own tasks.md checkboxes.
- Contract problems → append to `/INTEGRATION-NOTES.md`; do not work around
  by editing shared code.
- `pnpm --filter @cox/<pkg> typecheck && pnpm --filter @cox/<pkg> test`
  green before every commit. No network, no API keys in tests.

## Commands
- `pnpm install` once; `pnpm typecheck` / `pnpm test` for the whole workspace.
- `pnpm cox` runs the CLI via tsx (works once WS6 lands `packages/cli/src/main.ts`).

## Map
`packages/` core (frozen) · providers · router · ledger · agent · tools ·
spec · steering · hooks · tui · cli — dependency graph and dataflow in
`docs/01-ARCHITECTURE.md`. Fixtures: `fixtures/events-sample.jsonl` (TUI
replay), `examples/demo-project/` (spec-engine e2e target).
