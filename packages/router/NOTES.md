# @cox/router — notes for the integrator

## `context_overflow` is intentionally inert (R4.2)

`shouldEscalate` (escalate.ts) matches every `EscalationSignal` variant
except `context_overflow`, which falls through and never escalates — this
is the spec'd v1 behavior ("SHALL NOT trigger escalation in v1... reserved"),
not an oversight. Wiring context-overflow handling (likely compaction
rather than escalation) is left to whoever integrates the agent loop.

## Classify-call ledgering lives inside the router (ownership exception)

Every other model call is expected to be ledgered by whoever owns the
call site outside the router (per docs/01's "cli writes ledger entries, the
router only decides" split) — but the scout classification call is made
*by the router itself*, internally, and the caller of `route()` never sees
it or its `ChatModel.stream` events. So `resolveTier` calls
`deps.ledger.record(...)` directly for classify calls (R2.5), which is a
deliberate, spec-directed exception to that ownership rule (design.md
§NOTES.md seeds calls this out explicitly). Flagging here again for
whoever reviews cross-package ownership: this is the *only* place
`@cox/router` calls `Ledger.record` — every other `LedgerEntry` in a real
session comes from the cli/agent loop after a real model call completes.

## `route()` never emits `AgentEvent`s

Per docs/05 ownership: `degradedByBudget` and the thrown
`{ code: "budget_exceeded" }` error are data for the caller to turn into a
`budget_alert` event — the router itself has no `EventBus`/`emit` dependency
and shouldn't gain one.

## Decisions during implementation (not deviations, but worth flagging)

- **R5.1's "chars/4 heuristic from the classify model"** is taken literally:
  `buildEstimate` always calls `deps.classifyModel().estimateTokens(text)`,
  regardless of which tier actually resolved. `createRouter`'s deps only
  expose a `classifyModel` resolver (no general provider registry), so this
  is also the only token estimator available to the router.
- **`durationMs`** on the classify ledger entry is measured with a plain
  `Date.now()` diff around the `classify()` call, not the injected `now()`
  clock — `now` produces the ISO-8601 *timestamp* (`LedgerEntry.ts`, where
  determinism matters for assertions); `durationMs` is a wall-clock span
  that tests only assert is `>= 0`/`typeof "number"`, never an exact value,
  so no injected duration clock was added to `RouterDeps`.
- **`applyGovernor`'s `kind: TaskKind` parameter** is accepted (matches
  design.md's `applyGovernor(decision, state, config, kind)` signature) but
  is unused in the body. R3.3's "never degrade below builder for
  spec-requirements/spec-design, never degrade scout/builder" holds as an
  *invariant* of the implementation rather than an explicit branch: the only
  mutation `applyGovernor` ever performs is architect→builder, so there is
  no code path that could put any kind below builder or touch an
  already-scout/builder decision. Kept the parameter for signature fidelity
  and in case a future policy needs kind-specific governance.
- **The `budget_exceeded` error message text** (`budget exceeded: <scope>
  $<spent>/$<limit> — /budget extend to continue`) follows design.md's
  pseudocode but is not part of the tested contract — only
  `err.code === "budget_exceeded"` and that the message names the scope are
  asserted (R3.4). Treat the exact wording as router's own choice, not a
  frozen format.
- **Escalation's "fresh estimate via same input"** (R4.3/`reconsider`) calls
  `buildEstimate` with the kind-based default output-token table — it does
  **not** re-run scout classification. Re-classifying mid-task would add a
  second classify cost and contradicts "escalate on evidence... never
  speculatively" (docs/05 §1).
- **Test helpers** (`test/helpers/mockModel.ts`, `test/helpers/mockLedger.ts`)
  are local-only fixtures — neither imports `@cox/providers` or
  `@cox/ledger`, per the "no dependencies beyond `@cox/core` and node
  builtins" rule in design.md, which also applies transitively to tests.
  `mockLedger.ts` isn't in design.md's enumerated file list (only
  `helpers/mockModel.ts` is) but was added because governor/escalate/
  fixture tests all need a controllable `Ledger.budgetState` plus a spy on
  `record()`.

## Deviations from design.md

None functionally. `estimate.test.ts` isn't in design.md's file list (only
`helpers/mockModel.ts policy.test.ts classify.test.ts governor.test.ts
escalate.test.ts fixtures.test.ts` are named) but was added so R5 (task 7)
had isolable, directly-verifiable tests rather than only being exercised
indirectly through `policy.test.ts`/`fixtures.test.ts`.
