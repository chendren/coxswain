# @cox/providers — implementation notes

Decisions and minor deviations for the integrator. See
`docs/specs/providers/{requirements,design,tasks}.md` for the spec this
implements; all 13 tasks are done (see tasks.md checkboxes).

## Decisions

- **`estimate.ts` landed in task 1's scaffolding, not task 4.** It is a
  pure, dependency-free one-liner (`ceil(text.length / 4)`) fully specified
  by R8.1, and `mock.ts` (task 3) needs a working `estimateTokens` to
  satisfy the `ChatModel` interface before task 4 runs. Rather than
  duplicate the formula locally in `mock.ts` and de-duplicate it later,
  `estimate.ts` was written in full during scaffolding; task 4 added its
  dedicated R8.1 tests plus `capabilities.ts` (which had no such early
  dependency and stayed a stub until task 4 as planned).

- **Registry model-id validation (R5.2).** Requirements R5.2's literal text
  says to throw when "the model id is not served by that adapter." design.md
  explicitly overrides this ("Correction for determinism: `models()` is the
  known list; `create()` accepts any id... `registry.getModel` warns ...
  only when the provider is unknown, not the model"). Implemented per
  design.md: `getModel` throws only on an unknown *provider*; an unknown
  model id on a known provider is pass-through creatable (so users can pin
  models newer than the adapter's static list). Tested explicitly in
  `test/registry.test.ts`.

- **`AnthropicLike`/`AnthropicStreamEvent` are minimal local structural
  types**, not the real `@anthropic-ai/sdk` types (design.md calls for
  exactly this, to avoid coupling adapter logic and tests to SDK type
  churn). Field shapes (e.g. `delta.thinking` for `thinking_delta` vs
  `delta.text` for `text_delta`, `Usage.cache_read_input_tokens`, ...) were
  checked against the installed SDK (0.112.4) types for real-path fidelity.
  The one bridge point is `defaultClientFactory`, which casts
  `new Anthropic(...)` to `AnthropicLike` — everything else, including all
  tests, only ever touches the local type.

- **`createFailoverChatModel`'s "yielded then failed" test case** (R4.2)
  needs a turn that yields an event and *then* throws — `MockTurn` can only
  express "fully succeeds" or "fails before yielding anything," by design
  (R6.1/R6.2). `test/failover.test.ts` uses one small hand-written
  `ChatModel` test double for that scenario; every other provider test uses
  `createMockModel`.

- **OpenAI-compat user-turn flattening always emits the user message**,
  even when its text is empty (e.g. a turn that is only `tool_result`
  blocks answering a prior tool call). design.md's mapping table describes
  this as an unconditional rule ("text blocks join to one
  `{role:"user", content}`"); implemented literally rather than
  conditionally skipping an empty one.

- **`buildAnthropicRequest`'s `max_tokens` clamp is `min(requested, cap)`**,
  not "always set to the cap" — R7.1 says "clamp," and a request already
  under the per-model ceiling passes through unchanged (tested).

## Tooling note (affects any workstream using this verify-command style)

`pnpm --filter <pkg> test -- -t "<pattern>"` does **not** scope the run the
way it looks like it should: pnpm forwards the `--` itself into the
underlying `vitest run` invocation, and vitest then treats `-t`/`<pattern>`
as raw passthrough positional args rather than `--testNamePattern`, so the
*entire* suite runs regardless of the pattern. Confirmed empirically
(`pnpm --filter @cox/providers test -- -t "R99_NO_SUCH_TEST"` still runs
every test). Dropping the `--` (`pnpm --filter <pkg> test -t "<pattern>"`)
filters correctly. This does not weaken any of this package's task
verifications — running the full suite is a strict superset of the intended
scoped check, so it can only fail more often, never pass falsely — but
every `tasks.md` verify line of this shape is, in practice, "run the whole
suite," not a true subset.

## Deviations from design.md

None. Every mapping table, factory signature, and error-classification rule
was implemented as written; the two items above under "Decisions" resolve
ambiguity/tension *within* the spec pack (requirements vs. design, or gaps
`MockTurn` can't express) rather than deviate from design.md itself.
