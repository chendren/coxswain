# @cox/ledger — notes for the integrator

## `lastReadSkippedLines` (non-contract property)

`createLedger()`'s return value is typed `Ledger` plus one extra readonly
property, `lastReadSkippedLines: number`, reflecting the corrupt-line count
(R6.2) from the most recent read performed by `query`/`summary`/
`budgetState`. It exists purely so tests can assert corrupt-line handling
without parsing stdout/logs. **Nothing outside tests should read it** — it's
not part of the `Ledger` contract in `@cox/core`, and other packages must
keep depending only on the frozen interface.

## `budgetState` — which scope's numbers get reported

`BudgetState` (frozen) has exactly one `spentUsd`/`spentTokens`/`limitUsd`/
`limitTokens`/`scope`, even though session and spec scopes can both be in
play. Decision: `computeBudgetState` reports the figures for whichever
configured scope has the **highest utilization** ("worst wins" per R8.2),
not always the session scope. Concretely: if a spec budget is closer to its
limit than the session budget, `spentUsd`/`limitUsd`/`scope` describe the
*spec*, not the session. `scope`/`limitUsd`/`limitTokens` are populated
whenever at least one scope is configured, not only once a level actually
trips past `ok` — R8.3's "limit fields absent" wording is specifically
about the *no-limits-configured* case, not about level.

Spec-scope filtering is by `specName` only (not also `sessionId`) — a spec's
budget is meant to span every session that touched it, per design.md's
"`budgetState`: two summary calls max (session filter; spec filter only
when needed)".

Zero-configured-limit edge case: `ratio(spent, limit)` treats a `limit <= 0`
as `Infinity` utilization when `spent > 0` (immediately exceeded) rather
than dividing by zero into `NaN`. Not exercised by the spec's fixtures;
included defensively since the config schema doesn't enforce `limit > 0`.

## Baseline re-pricing (R7.2)

`summarize()` accumulates `baselineArchitectCostUsd` per-entry via
`computeCostUsd(entry.usage, architectPricing)` inside the same loop that
builds totals/byTier/byModel, rather than a second pass over aggregate
totals. Because `computeCostUsd` is linear in the usage fields, both
approaches give the same number — per-entry was chosen because it reads
more directly off R7.2's wording ("re-prices every matched entry's usage").

## `now` dependency

`createLedger`'s `now: () => string` dep is accepted (matches design.md's
factory signature) but is **not currently called anywhere in ledger's own
code** — every `LedgerEntry.ts` value is supplied by the caller (router/cli)
before `record()` is invoked; the ledger itself never stamps a timestamp.
Kept in the signature for parity with the design and in case a future
internal use (e.g. timestamping corrupt-read warnings) needs it.

## Deviations from design.md

None. Implementation follows design.md's file layout and factory signature
as written.
