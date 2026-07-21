# Parallel Build Plan

Six independent workstreams, each with a full spec pack in `docs/specs/<ws>/`
(requirements.md / design.md / tasks.md — yes, we dogfood the spec-coding
format). All depend only on `@cox/core`, which is **done and frozen**.

## Workstreams

| # | Workstream | Packages | Spec pack | Suggested builder model | Risk |
|---|---|---|---|---|---|
| WS1 | providers | `@cox/providers` | `docs/specs/providers/` | Sonnet | SDK/API drift — pin to spec'd request shapes |
| WS2 | router-ledger | `@cox/router`, `@cox/ledger` | `docs/specs/router-ledger/` | Sonnet | policy precedence bugs — table-driven tests |
| WS3 | agent-tools | `@cox/agent`, `@cox/tools` | `docs/specs/agent-tools/` | Sonnet (agent), Haiku ok (tools) | loop correctness — mock-model tests |
| WS4 | spec-engine | `@cox/spec` | `docs/specs/spec-engine/` | Sonnet | state machine edge cases |
| WS5 | steering-hooks | `@cox/steering`, `@cox/hooks` | `docs/specs/steering-hooks/` | Sonnet, parts Haiku-able | shell-exec safety, watcher lifecycle |
| WS6 | tui-cli | `@cox/tui`, `@cox/cli` | `docs/specs/tui-cli/` | Sonnet | integration surface — build TUI against fixtures first |

Model guidance dogfoods our own routing: mechanical/table-driven tasks are
marked complexity 1–2 in each tasks.md (fine for Haiku); anything touching
loop control, state machines, or process management is 3+ (Sonnet). Escalate
to Opus only if a task fails twice with tests in hand.

## Ground rules for every builder agent

1. Read, in order: `CLAUDE.md` → `docs/04-CONVENTIONS.md` →
   `packages/core/src/types.ts` → your spec pack. Nothing else is required.
2. **Write only inside your packages and your spec pack** (checking off
   tasks.md items). Never touch `packages/core`, other packages, or shared
   docs. Shared friction goes to `/INTEGRATION-NOTES.md` (append-only file,
   create your dated section).
3. Work tasks.md top to bottom; each task = one commit
   (`ws/<name>: task N — <title>`). Check the box only when its
   verification command passes.
4. `pnpm --filter @cox/<pkg> typecheck && pnpm --filter @cox/<pkg> test`
   must pass before every commit.
5. No new runtime dependencies beyond the ones your design.md lists. Need
   another? INTEGRATION-NOTES.md entry + pick the closest listed one.
6. Stop and flag (don't improvise) when: a core contract can't be satisfied
   as written; two spec-pack statements contradict; a task requires another
   package's unfinished code (should not happen — every spec pack defines a
   mock/fixture strategy).

## Sequencing & milestones

```
        ┌─ WS1 providers ──────┐
        ├─ WS2 router-ledger ──┤
core ───┼─ WS3 agent-tools ────┼──▶ M2 integration (WS6 lead or human+architect session)
(done)  ├─ WS4 spec-engine ────┤
        ├─ WS5 steering-hooks ─┘
        └─ WS6 tui-cli ────────┘   (starts immediately too — builds against fixtures)
```

- **M1 — lanes green (parallel, no coordination):** every package
  typechecks + unit tests pass against core types + its own mocks/fixtures.
  WS6's TUI renders `fixtures/events-sample.jsonl` via `cox replay`;
  cli wires a `FakeEverything` session for `cox doctor` + arg parsing.
- **M2 — wired session:** integrator branch connects real implementations in
  cli's composition root. Exit criteria: interactive session answers a
  prompt end-to-end with MockChatModel (no network), routing announcements +
  status line + ledger entries all appear.
- **M3 — live smoke:** with `ANTHROPIC_API_KEY`, run against
  `examples/demo-project`: one chat turn (haiku via scout), one
  `cox spec new safe-divide` through all gates, one `cox explain`.
  `/ledger` shows plausible costs incl. cache reads. Tag `v0.1.0`.

Integration order within M2: providers+router+ledger first (they compose
into "routed model call with receipt"), then agent+tools, then spec, then
steering+hooks, TUI last (it was already rendering fixtures).

## Definition of done (per workstream)

- All tasks.md boxes checked, each with its verification command output.
- Public API = exactly the factories named in design.md; no extra exports
  beyond types/helpers the design lists.
- Unit tests: every requirement id (R*) referenced by ≥1 test name.
- No `console.log` outside `@cox/tui`/`@cox/cli`; no network in tests;
  no edits outside your lane.
- A `NOTES.md` in each package: decisions taken, deviations, TODOs for
  integrator (≤ 1 page).
