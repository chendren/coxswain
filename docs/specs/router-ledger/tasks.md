# router-ledger — Tasks

Execute strictly top to bottom. One commit per task:
`ws/router-ledger: task N — <title>`. A task is done only when `accept`
holds and `verify` passes (paste output in the commit body). Ledger comes
first — the router depends on `budgetState`.

- [x] 1. JSONL append + read foundation (`@cox/ledger`)
  - requirements: R6.1, R6.2
  - complexity: 2
  - accept: `appendEntry` creates parent dir + file on first write, one JSON line per entry via `appendFile`; `readEntries` returns `{ entries, skipped }`, skipping corrupt lines without throwing; `lastReadSkippedLines` exposed on the factory result; tests use `fs.mkdtemp` and injected `now`
  - verify: pnpm --filter @cox/ledger test -- -t "R6"

- [x] 2. `query` filters
  - requirements: R6.3
  - complexity: 1
  - accept: filters by sessionId, specName, tier, and `since` (ISO string ≥ compare) compose; results keep file order; empty file/missing file → `[]`
  - verify: pnpm --filter @cox/ledger test -- -t "R6.3"

- [x] 3. `summary` totals + byTier/byModel
  - requirements: R7.1
  - complexity: 2
  - accept: totals use `addUsage`; null `costUsd` counts as 0; `byModel` keyed by `modelKey`; buckets carry usage + cost; verified against a 6-entry fixture spanning 3 tiers/3 models
  - verify: pnpm --filter @cox/ledger test -- -t "R7.1"

- [x] 4. Baseline-vs-architect calculation
  - requirements: R7.2
  - complexity: 2
  - accept: `baselineArchitectCostUsd` re-prices every matched entry's usage (incl. cache fields at cache rates) at `config.tiers.architect.primary` via injected `pricing`; unknown pricing → 0; hand-computed expected value in test matches to 5 decimals
  - verify: pnpm --filter @cox/ledger test -- -t "R7.2"

- [x] 5. `budgetState` scopes + levels
  - requirements: R8.1, R8.2, R8.3
  - complexity: 3
  - accept: session USD + token limits and spec USD limit computed per R8.1; `spentTokens` sums all four usage fields; worst level wins with `scope` naming the tripped scope; no limits → `ok` with limit fields absent; boundary tests at exactly `warnAt` and exactly 1.0
  - verify: pnpm --filter @cox/ledger test -- -t "R8"

- [x] 6. Router scaffold: precedence + policy table (`@cox/router`)
  - requirements: R1.1, R1.2, R1.3, R1.6, R1.7
  - complexity: 3
  - accept: `createRouter` matches the design signature; `resolveTier` implements override precedence and the full TaskKind table incl. `spec-task-exec` complexity mapping and missing-hint→builder; model = tier primary; reasons byte-match design §Reason strings
  - verify: pnpm --filter @cox/router test -- -t "R1"

- [x] 7. Estimates module
  - requirements: R5.1, R5.2, R5.3
  - complexity: 1
  - accept: `inputTokens = contextTokens + estimateTokens(text)`; kind-default output table exactly as R5.2; `estCostUsd` null when pricing unknown, else `computeCostUsd` with zero cache fields
  - verify: pnpm --filter @cox/router test -- -t "R5"

- [x] 8. Scout classification happy path
  - requirements: R2.1, R2.2, R2.3
  - complexity: 3
  - accept: RUBRIC constant byte-identical to design; request is `{system: RUBRIC, one user message, tools: [], maxTokens: 128, effort: "low"}`; strict parse + hand validation; task_type→tier map and complexity≥4 bump (max architect); reasons per design; scripted local mock model only
  - verify: pnpm --filter @cox/router test -- -t "R2.3"

- [x] 9. Classification failure paths + timeout
  - requirements: R2.4
  - complexity: 2
  - accept: garbage JSON, wrong field types, stream error, and >3000 ms (fake timers + AbortSignal observed by the mock) all fall back to `defaultTier` with reason `classification failed`; no retries
  - verify: pnpm --filter @cox/router test -- -t "R2.4"

- [x] 10. Classification self-ledgering
  - requirements: R2.5, R2.6
  - complexity: 2
  - accept: classify call recorded via injected `Ledger.record` with `kind: "classify"`, tier scout, measured `durationMs`, cost from `pricingFor`+`computeCostUsd` (null-safe), `routingReasons: ["classification call"]`; no record when no usage event arrived; test computes classify share from `byTier` demonstrating the ≤2 % health check
  - verify: pnpm --filter @cox/router test -- -t "R2.5"

- [ ] 11. Budget governor
  - requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6
  - complexity: 3
  - accept: state fetched per route; warn degrades architect→builder only, `degradedByBudget: true`, pct reason string; spec-requirements/design floor at builder; exceeded (real or projected via `spent + estCostUsd`) throws `code: "budget_exceeded"` under hardStop, appends `budget exceeded — hardStop off` otherwise; governor never raises
  - verify: pnpm --filter @cox/router test -- -t "R3"

- [ ] 12. `reconsider` escalation ladder
  - requirements: R4.1, R4.2, R4.3, R4.4
  - complexity: 3
  - accept: disabled→null; thresholds read from `config.routing.escalation`; `context_overflow` inert; one step with `escalatedFrom`, new tier primary, single evidence reason with interpolated counts; architect or already-escalated → null
  - verify: pnpm --filter @cox/router test -- -t "R4"

- [ ] 13. Governor-after-escalation edge
  - requirements: R4.5
  - complexity: 2
  - accept: escalation resolving to a tier the governor degrades back to `current.tier` returns null; escalation scout→builder under warn budget still succeeds
  - verify: pnpm --filter @cox/router test -- -t "R4.5"

- [ ] 14. Table-driven fixture suite
  - requirements: R1–R5 (integration of)
  - complexity: 2
  - accept: `fixtures.test.ts` implements the design's fixture table verbatim, each row's test name prefixed with its requirement id; whole suite green
  - verify: pnpm --filter @cox/router test

- [ ] 15. Wrap-up: NOTES.md + green workspace lane
  - requirements: all
  - complexity: 1
  - accept: `packages/router/NOTES.md` + `packages/ledger/NOTES.md` written (design §NOTES seeds covered); `--passWithNoTests` removed from both package.json test scripts; typecheck + tests green for both packages
  - verify: pnpm --filter @cox/router --filter @cox/ledger typecheck && pnpm --filter @cox/router --filter @cox/ledger test
