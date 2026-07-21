# Routing & Ledger — the frugality engine

Authoritative behavior spec for WS2 (router-ledger); WS3/WS4/WS6 read it to
integrate correctly. Types referenced here are in `packages/core/src/types.ts`.

## 1. Routing pipeline

`Router.route(input)` resolves a tier, then a model, in this exact precedence:

```
1. input.userOverrideTier          → use it, reason "user override (/model)"
2. input.hookOverrideTier          → use it, reason "hook override"
3. policy table on input.kind      → see below
4. (chat only, classifyWithScout)  → scout classification call
5. config.routing.defaultTier      → reason "default tier"
then: budget governor may DEGRADE the resolved tier (never raises it)
then: tier → config.tiers[tier].primary (fallbacks used on provider errors)
```

### Policy table (by TaskKind)

| kind | tier | rationale |
|---|---|---|
| `classify` | scout, always | the router's own calls must be cheap |
| `oneshot` (explain/suggest) | scout | low-stakes, latency-sensitive |
| `hook` | AgentHookConfig.tier (default scout) | automations stay cheap |
| `spec-requirements` | architect | judgment-heavy, low token volume |
| `spec-design` | architect | same |
| `spec-tasks` | builder | mechanical decomposition of an approved design |
| `spec-task-exec` | by complexityHint: 1–2 → scout, 3 → builder, 4–5 → architect |
| `chat` | classification (step 4) |

### Scout classification (step 4)

One scout-tier call, `maxTokens: 128`, with a **fixed rubric prompt** (stable
bytes → it prompt-caches). Returns strict JSON:

```json
{"task_type": "question|mechanical-edit|feature|debug|architecture",
 "complexity": 1-5, "est_output_tokens": 800}
```

Mapping: `question|mechanical-edit` → scout, `feature|debug` → builder,
`architecture` → architect; complexity 4–5 bumps one tier up. On parse
failure or timeout (3s): `defaultTier`, reason `"classification failed"`.
The classification call itself is ledgered (`kind: "classify"`) — frugality
includes counting our own overhead. If a session's classify spend exceeds 2%
of total, that's a bug (tracked in `LedgerSummary.byTier`).

### Budget governor

`Ledger.budgetState()` before each call:

- `warn` (≥ warnAt, default 80%): emit `budget_alert`; degrade architect→builder
  (reason `"budget 84% — degraded architect→builder"`). Never degrade
  spec-requirements/design below builder.
- `exceeded` + `hardStop`: block the call, emit `budget_alert{exceeded}`;
  the TUI offers `/budget extend <usd>`. Without hardStop: warn every call.

### Escalation ladder (`Router.reconsider`)

Signals from the agent loop (`EscalationSignal`): tool_error_streak ≥ 3,
verification_failed ≥ 2, model_stuck (two identical consecutive tool calls),
model_requested_help. On trigger: scout→builder or builder→architect, one
step per task, at most one escalation per task (architect is terminal).
Reasons must name the evidence: `"escalated builder→architect: tests failed twice"`.
De-escalation never happens mid-task; the next task re-routes fresh.

Escalation swaps the model with history intact — which forfeits the prompt
cache (caches are per-model). That's priced in: escalate only on the signal
thresholds above, never speculatively.

## 2. Visibility (WS6 renders, WS2 supplies the data)

Routing announcement (one per `routing_decision` event, `routing.announce`):

```
⑆ router  spec task 4 "wire divide guard" → scout (claude-haiku-4-5)
          complexity=1 from spec task · policy spec-task-exec
          est 3.1k in / ~600 out ≈ $0.006    session $0.42/$5.00 ██░░░░░░░░
```

Status line (from `SessionSnapshot`, updated on every model_call_finished):

```
⛵ builder claude-sonnet-5 │ ▲128k ▼24k │ $0.42/$5.00 │ cache 71% │ spec auth-flow 4/9
```

`/ledger` in-session and `cox ledger` offline:

```
session ses_a1b2 — 47 calls, 891k in (612k cached) / 103k out, $1.87
  tier       calls   in-tok    out-tok   cost     share
  scout        29    102k       11k      $0.16      9%
  builder      15    614k       78k      $1.32     71%
  architect     3    175k       14k      $0.39     21%
  ─ savings vs all-architect baseline: $6.41 (77% saved)
  ─ cache: 612k reads saved ≈ $1.65 vs uncached
```

`baselineArchitectCostUsd` = replay every entry's usage at the architect
primary's pricing (cache fields at cache rates). It's an estimate; label it.

## 3. Ledger mechanics (WS2)

- Append-only JSONL at `.cox/ledger.jsonl`, one `LedgerEntry` per model call
  (including classify calls, hook runs, spec generation). Write with
  `appendFile` per entry — crash-safe, no in-memory batching.
- Corrupt lines: skip with a counted warning, never crash reads.
- `summary(q)` streams the file; no index in v1 (files stay small; revisit
  at >50k entries).
- Budget state = summary over `sessionId` (and `specName` for spec budgets)
  compared against `BudgetConfig`.

## 4. Estimation

Pre-call estimates (`RoutingDecision.estimate`) use
`ChatModel.estimateTokens` (chars/4 heuristic is acceptable) over the
assembled prompt + `est_output_tokens` from classification (or kind-based
defaults: oneshot 500, task-exec 2500, design 6000). Estimates are for
display and never gate anything except the budget governor's *projection*
(spent + estimate > limit → treat as `exceeded` early). Actuals always come
from the provider's usage events.

## 5. Frugality levers checklist (where the savings come from)

1. Tiered routing (the big one — see baseline number).
2. Prompt-cache-aware assembly (docs/01 §prompt assembly; stable prefixes).
3. Cheap classification with cached rubric (≤2% overhead budget).
4. Agent hooks default to scout.
5. Steering token budget warnings (`steering.warnTokens`) — context bloat is
   cost bloat.
6. Escalate on evidence, never on vibes; one step max.
7. Local models (`ollama/*`, $0) configurable per tier for the truly frugal.
