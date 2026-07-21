# router-ledger — Requirements

Workstream: `@cox/router` + `@cox/ledger`. Behavior authority:
`docs/05-ROUTING-AND-LEDGER.md`. Contracts: `Router`, `Ledger`, and related
types in `packages/core/src/types.ts` (frozen).

Requirement ids below (R*.*) are referenced by design.md, tasks.md, and test
names.

## Story 1 — Tier precedence & policy table

As a user, I want every call routed by a deterministic, explainable
precedence so I can predict and audit which model runs.

- **R1.1** WHEN `RoutingInput.userOverrideTier` is set, THE router SHALL
  resolve that tier and include the reason `user override (/model)`,
  ignoring hook overrides, policy, and classification.
- **R1.2** WHEN `userOverrideTier` is unset AND `hookOverrideTier` is set,
  THE router SHALL resolve that tier with reason `hook override`.
- **R1.3** WHEN no override applies, THE router SHALL resolve tier by
  `TaskKind` policy: `classify`→scout, `oneshot`→scout, `hook`→scout,
  `spec-requirements`→architect, `spec-design`→architect,
  `spec-tasks`→builder, `spec-task-exec`→by `complexityHint`
  (1–2→scout, 3→builder, 4–5→architect, missing→builder), and SHALL include
  a reason of the form `policy <kind>` (plus
  `complexity=<n> from spec task` for `spec-task-exec`).
- **R1.4** WHEN kind is `chat` and `config.routing.classifyWithScout` is
  true, THE router SHALL resolve tier via scout classification (Story 2).
- **R1.5** WHEN kind is `chat` and classification is disabled or fails,
  THE router SHALL resolve `config.routing.defaultTier` with reason
  `default tier` (disabled) or `classification failed` (failure).
- **R1.6** WHEN a tier is resolved, THE router SHALL select
  `config.tiers[tier].primary` as `RoutingDecision.model` (fallback models
  are consumed elsewhere; the router never returns a fallback).
- **R1.7** THE router SHALL populate `RoutingDecision.reasons` with ≥1
  user-facing string per decision, ordered most-specific first, exactly in
  the formats given in design.md §Reason strings.

## Story 2 — Scout classification

As a frugal user, I want ambiguous chat prompts classified by a cheap model
so routine questions never hit expensive tiers.

- **R2.1** WHEN classifying, THE router SHALL issue exactly one
  `ChatModel.stream` call using the verbatim rubric of design.md
  §Classification rubric as `system`, the task text as the sole user
  message, `tools: []`, `maxTokens: 128`, `effort: "low"`.
- **R2.2** THE rubric bytes SHALL be a module constant, byte-stable across
  calls and sessions (prompt-cache friendliness).
- **R2.3** WHEN the response parses as strict JSON with `task_type` ∈
  {question, mechanical-edit, feature, debug, architecture}, integer
  `complexity` ∈ 1..5, and positive integer `est_output_tokens`, THE router
  SHALL map task_type→tier (question|mechanical-edit→scout,
  feature|debug→builder, architecture→architect) and, IF complexity ≥ 4,
  SHALL bump the mapped tier one step (max architect), with reasons
  `classified task-type=<t> complexity=<n>` and
  `tier <tier> per routing table`.
- **R2.4** IF parsing/validation fails OR the call exceeds 3000 ms
  (aborted via `AbortSignal`) OR the stream throws, THEN THE router SHALL
  fall back to `config.routing.defaultTier` with reason
  `classification failed` and SHALL NOT retry.
- **R2.5** WHEN a classification call completes with a `usage` event, THE
  router SHALL record it via `Ledger.record` as a `LedgerEntry` with
  `kind: "classify"`, the classify model's ref/tier `scout`, measured
  `durationMs`, cost via `pricingFor`/`computeCostUsd` (null-safe), and
  `routingReasons: ["classification call"]`.
- **R2.6** WHERE classification spend is inspected, THE ledger summary's
  `byTier`/`byModel` breakdown SHALL make classify overhead computable
  (classify entries carry `kind: "classify"`; ≤2 % of session cost is the
  health target asserted in tests as a computation, not a hard gate).

## Story 3 — Budget governor

As a budget-conscious user, I want spend limits to degrade or stop calls
before money is gone, never silently.

- **R3.1** WHEN a tier has been resolved, THE router SHALL fetch
  `Ledger.budgetState(sessionId, specName)` and apply governance BEFORE
  returning the decision.
- **R3.2** IF budget level is `warn` AND the resolved tier is `architect`,
  THEN THE router SHALL degrade the tier to `builder`, set
  `degradedByBudget: true`, and append reason
  `budget <pct>% — degraded architect→builder` (pct = floor of the highest
  utilization across configured limits).
- **R3.3** THE governor SHALL never degrade below `builder` for kinds
  `spec-requirements` and `spec-design`, and SHALL never degrade any
  resolved `scout` or `builder` tier (warn touches architect only).
- **R3.4** IF budget level is `exceeded` (including by projection, R3.5)
  AND `config.budgets.hardStop` is true, THEN `route()` SHALL throw an
  `Error` with property `code: "budget_exceeded"` and a message naming the
  tripped scope and limit; IF `hardStop` is false, THE router SHALL proceed
  and append reason `budget exceeded — hardStop off`.
- **R3.5** WHEN governing, THE router SHALL project
  `spentUsd + estimate.estCostUsd` (when both are numbers) against the USD
  limit of the active scope and treat a projected overrun as `exceeded`.
- **R3.6** THE governor SHALL never raise a tier.

## Story 4 — Mid-task escalation

As a user, I want a stuck cheap model upgraded exactly one step, with the
evidence stated, so failures don't loop and costs don't jump silently.

- **R4.1** WHEN `reconsider(current, input, signals)` is called AND
  `config.routing.escalation.enabled` is false, THE router SHALL return
  `null`.
- **R4.2** THE router SHALL escalate WHEN any signal meets its threshold:
  `tool_error_streak.count ≥ config.routing.escalation.toolErrorStreak`;
  `verification_failed.attempts ≥ config.routing.escalation.verificationFailures`;
  any `model_stuck`; any `model_requested_help`. `context_overflow` SHALL
  NOT trigger escalation in v1 (return `null`; reserved).
- **R4.3** WHEN escalating, THE router SHALL move exactly one step
  (scout→builder, builder→architect), set
  `escalatedFrom: current.tier`, select the new tier's primary model, and
  emit a single evidence-bearing reason, e.g.
  `escalated builder→architect: tests failed twice`,
  `escalated scout→builder: 3 consecutive tool errors`,
  `escalated builder→architect: repeated identical tool calls`,
  `escalated builder→architect: model requested help`.
- **R4.4** IF `current.tier` is `architect` OR `current.escalatedFrom` is
  already set, THEN `reconsider` SHALL return `null` (one escalation per
  task; architect terminal).
- **R4.5** WHEN an escalation resolves, THE budget governor SHALL apply to
  the escalated tier; IF governance returns the tier to `current.tier`,
  THEN `reconsider` SHALL return `null` instead of a no-op decision.

## Story 5 — Estimates

As a user, I want a pre-call size/cost estimate on every decision so the
routing announcement means something.

- **R5.1** THE router SHALL set `estimate.inputTokens` =
  `input.contextTokens` + `estimateTokens(input.text)` (chars/4 heuristic
  from the classify model is acceptable).
- **R5.2** THE router SHALL set `estimate.estOutputTokens` from
  classification `est_output_tokens` when available, else by kind:
  chat 1500, oneshot 500, spec-requirements 6000, spec-design 6000,
  spec-tasks 2500, spec-task-exec 2500, hook 800, classify 128.
- **R5.3** THE router SHALL set `estimate.estCostUsd` via
  `pricingFor(model)` + `computeCostUsd` (zero cache fields); WHEN pricing
  is unknown, `estCostUsd` SHALL be `null`.

## Story 6 — Ledger persistence

As an auditor of my own spend, I want every model call durably recorded.

- **R6.1** WHEN `record(entry)` is called, THE ledger SHALL append exactly
  one JSON line to the configured JSONL path via `appendFile`, creating the
  parent directory and file on first write; no in-memory batching.
- **R6.2** WHEN reading, THE ledger SHALL skip lines that fail
  `JSON.parse`, count them internally (exposed for tests), and never throw
  on corrupt input.
- **R6.3** `query(q)` SHALL filter by `sessionId`, `specName`, `tier`, and
  `since` (ISO-8601 string compare on `entry.ts ≥ since`), returning
  entries in file order.

## Story 7 — Summaries & baseline

As a user, I want `/ledger` to show where tokens went and what tiering saved.

- **R7.1** `summary(q)` SHALL return totals (`entries`, summed `usage` via
  `addUsage`, `costUsd` treating null entry costs as 0) plus `byTier` and
  `byModel` (key = `modelKey(ref)`) breakdowns with per-bucket usage and
  cost.
- **R7.2** `summary(q).baselineArchitectCostUsd` SHALL equal the sum of
  every matched entry's usage re-priced at
  `config.tiers.architect.primary` pricing via `computeCostUsd` (cache
  fields at cache rates); WHEN architect pricing is unknown, the baseline
  SHALL be 0.

## Story 8 — Budget state

As a user, I want a single truthful budget readout across scopes.

- **R8.1** `budgetState(sessionId, specName?)` SHALL compute session-scope
  utilization from `budgets.sessionUsd` / `budgets.sessionTokens` and, when
  `specName` and `budgets.specUsd` are both present, spec-scope utilization
  from spec-filtered cost; `spentTokens` = input + output + cacheRead +
  cacheWrite.
- **R8.2** Level SHALL be `ok` when max utilization < `warnAt`, `warn` when
  `warnAt` ≤ utilization < 1.0, `exceeded` at ≥ 1.0; the worst level across
  scopes wins and `scope` SHALL name the tripped scope
  (`"session"` | `"spec"`).
- **R8.3** WHEN no limits are configured, THE state SHALL be
  `{ level: "ok" }` with spent figures populated and limit fields absent.
