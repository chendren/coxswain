# router-ledger — Design

Implements `Router` and `Ledger` from `@cox/core` exactly as specified in
`docs/05-ROUTING-AND-LEDGER.md` and requirements.md. Build the **ledger
first** — the router's governor consumes `Ledger.budgetState`.

## Dependency policy

Both packages: `@cox/core` + node builtins only. No zod (core validates
config; classification JSON is validated by hand). Never import
`@cox/providers` — tests use a local scripted `ChatModel` mock. Import
`pricingFor`, `computeCostUsd`, `addUsage`, `modelKey`, `ZERO_USAGE`
directly from `@cox/core` where needed.

## Files

```
packages/ledger/src/
  index.ts      export { createLedger }
  jsonl.ts      appendEntry(path, entry), readEntries(path) → { entries, skipped }
  summary.ts    summarize(entries, architectPricing) → LedgerSummary
  budget.ts     computeBudgetState(summaries, config) → BudgetState
packages/ledger/test/
  jsonl.test.ts summary.test.ts budget.test.ts        (mkdtemp dirs, injected now)

packages/router/src/
  index.ts      export { createRouter }
  policy.ts     precedence + TaskKind policy table + reason builders
  classify.ts   RUBRIC constant, classify(model, text, signal) → parsed | null
  estimate.ts   kind-default table + buildEstimate(...)
  governor.ts   applyGovernor(decision, state, config, kind) → decision | throws
  escalate.ts   shouldEscalate(signals, config) → evidence string | null
packages/router/test/
  helpers/mockModel.ts   scripted ChatModel (local; do not import @cox/providers)
  policy.test.ts classify.test.ts governor.test.ts escalate.test.ts fixtures.test.ts
```

## Factories (public API — exactly these, no more)

```ts
export function createLedger(deps: {
  filePath: string;              // .cox/ledger.jsonl (absolute)
  config: CoxConfig;             // budgets + tiers (for baseline pricing)
  pricing: typeof pricingFor;    // injected for test override
  now: () => string;             // ISO-8601 UTC
}): Ledger;

export function createRouter(deps: {
  config: CoxConfig;
  ledger: Ledger;
  classifyModel: () => ChatModel; // lazily resolves scout primary (cli wires)
  now: () => string;
}): Router;
```

Closure factories, no classes. Router imports nothing from `@cox/ledger` —
only the `Ledger` interface from core (cli wires the concrete one).

## Ledger mechanics

- `record`: `mkdir(dirname, { recursive: true })` on first write (cache the
  promise), then `appendFile(path, JSON.stringify(entry) + "\n")`. One line
  per call; crash-safe; no batching (R6.1).
- `readEntries`: read whole file (`utf8`), split lines, `JSON.parse` each;
  parse failures increment `skipped` (R6.2). The object returned by
  `createLedger` is typed `Ledger` but carries an extra non-contract
  property `lastReadSkippedLines: number` for tests — document it in
  NOTES.md; nothing outside tests may rely on it.
- `query`: filter per R6.3. ISO string comparison is valid because all `ts`
  values come from injected `now()` (UTC ISO-8601).
- `summary`: single pass building totals + `byTier`/`byModel` maps with
  `addUsage`; `costUsd: null` contributes 0. Baseline (R7.2): re-price each
  entry's usage at `deps.pricing(architect.primary.provider, architect.primary.model)`
  with `computeCostUsd` (its null-coalescing already prices cache fields at
  cache rates when defined).
- `budgetState`: two `summary` calls max (session filter; spec filter only
  when needed); utilization per R8.1–R8.3; percent used later by the
  governor's reason string comes from this state (router recomputes pct as
  `floor(100 * max utilization)`).

## Router flow (`route`)

```
resolveTier(input, config)            // R1.1–R1.5; may await classify()
  └ classify(): AbortController + 3000ms setTimeout race → parse → map
     · always ledger the call when a usage event arrived (R2.5), even on
       parse failure; on timeout/stream error with no usage, skip record
estimate = buildEstimate(input, tier→model, classification?)   // R5.*
state = await ledger.budgetState(input.sessionId, input.specName)
decision = applyGovernor({tier, model, reasons, estimate}, state, config, kind)
  · warn: architect→builder only, floor builder for spec-req/design (R3.2/3.3)
  · exceeded ∨ projected-exceeded: hardStop → throw Object.assign(
      new Error(`budget exceeded: ${scope} $${spent}/$${limit} — /budget extend to continue`),
      { code: "budget_exceeded" })                              // R3.4/3.5
return decision
```

`route()` never emits events — cli reads `degradedByBudget`/thrown `code`
and emits `budget_alert` itself (docs/01 ownership rule).

### Classification rubric (verbatim constant — do not reword; stable bytes)

```ts
export const RUBRIC = `You classify coding-agent tasks for model routing. Reply with ONLY strict JSON, no prose, no markdown fences, exactly this shape:
{"task_type":"question|mechanical-edit|feature|debug|architecture","complexity":1,"est_output_tokens":800}
Field rules: task_type is one of the five literals; complexity is an integer 1-5 (1 trivial .. 5 novel/architectural); est_output_tokens is a positive integer estimate of assistant output size.
Definitions: question = explain/answer, no edits expected. mechanical-edit = rename/small tweak/single obvious change. feature = implement or modify behavior in one or a few files. debug = diagnose a failure, may iterate. architecture = design decisions, cross-cutting refactors, new subsystems.`;
```

Request: `{ system: RUBRIC, messages: [user(input.text)], tools: [], maxTokens: 128, effort: "low" }`.
Parsing: concatenate `text_delta`s, trim, strip a single optional
```` ```json … ``` ```` fence, `JSON.parse`, then hand-validate fields
(R2.3); any failure → `null` → fallback (R2.4).

### Reason strings (byte-exact formats; TUI prints verbatim)

| Case | reasons[] |
|---|---|
| user override | `user override (/model)` |
| hook override | `hook override` |
| policy kinds | `policy spec-design` (etc.); task-exec adds `complexity=3 from spec task` |
| classified | `classified task-type=feature complexity=2`, `tier builder per routing table` |
| classify fail | `classification failed` |
| default | `default tier` |
| degrade | append `budget 84% — degraded architect→builder` |
| hardStop off | append `budget exceeded — hardStop off` |
| escalation | single reason, e.g. `escalated builder→architect: tests failed twice` |

## `reconsider`

Pure over inputs (R4.*): guard enabled → guard one-per-task/terminal
(`current.escalatedFrom` set ∨ tier architect → null) → first threshold-met
signal wins, mapped to its evidence string (streak count and attempt count
interpolated: `3 consecutive tool errors`, `tests failed twice` for 2 /
`tests failed N times` for N>2) → build decision (tier+1 primary, fresh
estimate via same input, `escalatedFrom`) → re-apply governor; if governed
tier == current.tier → null (R4.5).

## Table-driven test plan

`fixtures.test.ts` runs a literal table; each row names its requirement:

| id | RoutingInput (delta from base) | budget | expect tier | expect reason contains |
|---|---|---|---|---|
| R1.1 | userOverrideTier: "architect", kind chat | ok | architect | `user override (/model)` |
| R1.2 | hookOverrideTier: "scout", kind chat | ok | scout | `hook override` |
| R1.3a | kind "oneshot" | ok | scout | `policy oneshot` |
| R1.3b | kind "spec-design" | ok | architect | `policy spec-design` |
| R1.3c | kind "spec-task-exec", complexityHint 1 | ok | scout | `complexity=1 from spec task` |
| R1.3d | kind "spec-task-exec", complexityHint 5 | ok | architect | `policy spec-task-exec` |
| R1.3e | kind "spec-task-exec", no hint | ok | builder | `policy spec-task-exec` |
| R2.3a | chat; mock replies feature/2 | ok | builder | `classified task-type=feature` |
| R2.3b | chat; mock replies question/4 (bump) | ok | builder | `complexity=4` |
| R2.4a | chat; mock replies garbage | ok | builder (default) | `classification failed` |
| R2.4b | chat; mock hangs > 3 s (fake timers) | ok | builder | `classification failed` |
| R3.2 | kind "spec-tasks"… architect via override | warn 84 % | builder | `degraded architect→builder` |
| R3.3 | kind "spec-design" | warn | builder | floor holds (never scout) |
| R3.4 | any | exceeded + hardStop | throws | `code === "budget_exceeded"` |
| R4.3 | reconsider builder + verification_failed 2 | ok | architect | `tests failed twice` |
| R4.4 | reconsider w/ escalatedFrom set | ok | null | — |

Base fixture: `{ kind: "chat", text: "add a test", contextTokens: 1000, sessionId: "s1" }`,
default config from `configSchema.parse({})`, ledger stubbed with a
controllable `budgetState`.

Mock model (`test/helpers/mockModel.ts`): implements `ChatModel` with a
scripted array of `StreamEvent`s and `estimateTokens = ceil(len/4)`;
variants: replies-JSON, replies-garbage, never-resolves (for the timeout
test with `vi.useFakeTimers`).

## NOTES.md seeds (write during implementation)

- `lastReadSkippedLines` extra property rationale.
- `context_overflow` signal intentionally inert (R4.2) — integrator may wire
  compaction later.
- Classify-call ledgering happens inside router (exception to "cli writes
  ledger entries" — cli never sees this internal call); flagged for
  integrator review.
