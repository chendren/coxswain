# @cox/agent — Notes for the integrator

## Decisions

- **Cost-null caveat.** When `pricingFor(provider, model)` returns `null`
  (unpriced model), `model_call_finished.costUsd` is `null` for that event
  (visible, honest per-call signal), but the call contributes `0` — not
  `null` — to the running aggregate (`AgentRunResult.costUsd`, `turn_done
  .costUsd`). Token usage (`TokenUsage`) is always fully tracked regardless
  of pricing, so no data is lost — but a session mixing priced and unpriced
  models will *understate* total cost in the aggregate number. This matches
  core's own doc comment ("unknown models are recorded with costUsd = null,
  tokens still tracked") extended to the aggregate case, which core doesn't
  explicitly specify.
- **Deps beyond design.md's literal factory signature** — see
  `/INTEGRATION-NOTES.md` for the full rationale, summarized here:
  - `requestPermission: (req) => Promise<PermissionDecision>` was added to
    `createAgentRunner`'s deps. Nothing in the literal design.md deps list
    can back `ToolContext.requestPermission`'s frozen signature.
- **`ToolContext` has no `AbortSignal`** (core, frozen). The bash tool (and
  any future subprocess/network tool) can't be interrupted mid-call by the
  run's abort signal — only by its own internal timeout. The agent loop
  still honors `signal` correctly at its own level: pre-iteration (checked
  before each turn) and mid-stream (passed into `ChatModel.stream`, and a
  thrown abort-shaped error from the stream is caught and turned into
  `stopReason: "aborted"`). Tool execution itself just isn't preemptible.
- **`tool_error_streak` is edge-triggered** (R4.1): the signal fires exactly
  when the consecutive-isError streak *reaches* `toolErrorStreak`, not on
  every call past the threshold. Chosen because the requirement text doesn't
  fully disambiguate "when N consecutive failures" and edge-triggering keeps
  `Router.reconsider` calls proportionate to actual state changes rather
  than firing on every subsequent failing call once past the threshold.
- **`model_stuck` uses canonical (key-order-independent) JSON equality**
  for comparing consecutive tool inputs, not raw string equality — a model
  re-emitting logically identical arguments with keys in a different order
  still counts as "stuck."
- **Escalation's `RoutingInput` is recomputed fresh** on each
  `Router.reconsider` call (`buildRoutingInput(task, messages)`), not reused
  from the initial `route()` call, so `contextTokens` reflects the grown
  message history rather than a stale initial estimate.
- **Implementation vs. test-coverage split across tasks 12-14.** Task 12's
  commit built the full loop shape in one pass — including tool execution,
  the complete permission gate (R6.1-R6.4), unknown-tool handling (R1.6),
  `allowlist.ts`, and hook callback wiring (R5.1/R5.2) — since it's one
  cohesive control-flow function and the design doc specifies its full
  algorithm up front. Only R1.1/R1.3/R3.1/R3.2 were exercised by tests at
  that point; tasks 13/14 then added the dedicated tests
  (`permissions-flow.test.ts`, the hook/plan-mode blocks in
  `runner.test.ts`) proving out behavior that was already correct. Task 15
  (escalation) is the one piece genuinely built later, since it needed its
  own new module (`escalation.ts`). Flagging this so the commit-by-commit
  diff isn't misread as tasks 13/14 being no-ops — they're real test
  coverage, just not net-new runner.ts behavior.

## Environment quirk (not a bug)

Same as `@cox/tools`: `pnpm --filter @cox/agent test -- <filter>` (and
`-t <pattern>`) don't actually restrict which tests run here — pnpm's
arg-forwarding inserts a literal `--` that defeats vitest's filter parsing.
Verified filters work correctly via direct `npx vitest run <file> -t
<pattern>`, bypassing pnpm (e.g. task 14's `-t hook` matches exactly the 6
hook/plan-mode tests when run directly). Harmless: the full suite runs as a
superset and is kept green at every commit, so every `verify:` command
still exits 0.
