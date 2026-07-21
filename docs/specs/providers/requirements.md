# providers — Requirements

`@cox/providers` turns configured provider endpoints into streaming `ChatModel`s
behind the frozen contracts in `packages/core/src/types.ts` (`ProviderAdapter`,
`ChatModel`, `ProviderRegistry`, `StreamEvent`, `TokenUsage`). It is the only
package that talks to model APIs. Consumers: `@cox/agent` (streaming loop),
`@cox/router` (token estimates), `@cox/cli` (wiring + integration tests).
Nothing here may import any `@cox/*` package other than `@cox/core`.

## R1 — Anthropic adapter

As a cox user, I want first-class Anthropic support so the default tier map
(haiku/sonnet/opus) works with one API key.

- R1.1 WHEN `create(modelId)` is called on the anthropic adapter THE SYSTEM
  SHALL return a `ChatModel` whose `ref` is `{provider: "anthropic", model: modelId}`.
- R1.2 WHEN `stream(req)` runs THE SYSTEM SHALL translate `ChatRequest` to an
  Anthropic Messages streaming request exactly per design.md §Provider facts
  (system as text-block array, tools as `input_schema` tools, content-block
  mappings for `text`/`tool_use`/`tool_result`).
- R1.3 WHEN the API streams THE SYSTEM SHALL yield `text_delta` and
  `thinking_delta` events as deltas arrive, and one `tool_use` event per
  tool-use block carrying the fully accumulated JSON input.
- R1.4 WHEN the stream completes THE SYSTEM SHALL yield exactly one `usage`
  event with the mapping `input_tokens→inputTokens`, `output_tokens→outputTokens`,
  `cache_read_input_tokens→cacheReadTokens`, `cache_creation_input_tokens→cacheWriteTokens`,
  followed by exactly one `done` event with `stopReason` mapped
  `end_turn|tool_use|max_tokens|refusal` (anything else → `"error"`).
- R1.5 WHEN `req.cacheBreakpointMessageIndex` is set THE SYSTEM SHALL place
  `cache_control: {type: "ephemeral"}` on the last system block and on the
  last content block of the message at that index; WHEN it is absent THE
  SYSTEM SHALL place it on the last system block only.
- R1.6 WHEN the configured `apiKeyEnv` variable is unset at stream time THE
  SYSTEM SHALL throw a non-retryable `Error` naming that variable.
- R1.7 WHEN `signal` is aborted THE SYSTEM SHALL stop the underlying request
  and stop yielding events.

## R2 — OpenAI-compat adapter

As a frugal user, I want any OpenAI-compatible endpoint (xAI, OpenAI, Ollama,
LM Studio) usable as a tier, so scout can be grok-4-1-fast or a $0 local model.

- R2.1 WHEN configured with a `CoxConfig.providers.openaiCompat` entry THE
  SYSTEM SHALL expose an adapter whose `id` is the entry's `id` and whose
  `models()` returns the entry's `models` list.
- R2.2 WHEN `stream(req)` runs THE SYSTEM SHALL POST
  `{baseUrl}/chat/completions` with `stream: true` and
  `stream_options: {include_usage: true}`, translating messages and tools per
  design.md §Provider facts (tool_use → `tool_calls`, tool_result → `role:"tool"`).
- R2.3 WHEN SSE chunks arrive THE SYSTEM SHALL yield `text_delta` events for
  content deltas and accumulate `tool_calls` fragments by index, yielding one
  `tool_use` event per completed call with parsed JSON input.
- R2.4 WHEN the final usage chunk arrives THE SYSTEM SHALL yield one `usage`
  event (`prompt_tokens→inputTokens`, `completion_tokens→outputTokens`, both
  cache fields 0) then one `done` event (`stop→end_turn`,
  `tool_calls→tool_use`, `length→max_tokens`, `content_filter→refusal`,
  missing/other → `"error"`).
- R2.5 WHEN the entry has no `apiKeyEnv` THE SYSTEM SHALL send no
  Authorization header (local servers); WHEN it has one that is unset THE
  SYSTEM SHALL throw a non-retryable `Error` naming the variable.

## R3 — Error taxonomy & retries

As an agent loop, I need provider failures classified so I can fail over
without retrying user errors.

- R3.1 WHEN a request fails with HTTP 429, 5xx, or a network-level error THE
  SYSTEM SHALL retry up to 2 times with exponential backoff plus jitter
  before throwing.
- R3.2 WHEN retries are exhausted on a retryable failure THE SYSTEM SHALL
  throw an `Error` with a `retryable: true` marker property.
- R3.3 WHEN a request fails with any other 4xx THE SYSTEM SHALL throw
  immediately with no retry and no `retryable` marker, including the HTTP
  status and any provider error message in `Error.message`.
- R3.4 WHEN a failure occurs after the stream has already yielded events THE
  SYSTEM SHALL NOT retry internally; it SHALL throw the classified error.

## R4 — Failover wrapper

As a user, I want tier fallbacks (config `tiers.*.fallbacks`) to absorb
provider outages without my involvement.

- R4.1 WHEN `createFailoverChatModel(models)` streams and the current model
  throws an error with `retryable === true` before any event was yielded THE
  SYSTEM SHALL advance to the next model in order and restart the request.
- R4.2 WHEN an error occurs after events were yielded, or is non-retryable,
  or the model list is exhausted THE SYSTEM SHALL rethrow.
- R4.3 THE failover model's `ref` and `estimateTokens` SHALL delegate to the
  first (primary) model.

## R5 — Provider registry

As the composition root, I want one object that resolves any `ModelRef`.

- R5.1 WHEN `getModel(ref)` is called THE SYSTEM SHALL return a cached
  `ChatModel` per `modelKey(ref)` (one instance per key per registry).
- R5.2 WHEN `ref.provider` matches no configured adapter, or the model id is
  not served by that adapter, THE SYSTEM SHALL throw an `Error` naming the
  ref and listing configured providers.
- R5.3 WHEN `listModels()` is called THE SYSTEM SHALL return every
  configured model with its `ModelPricing` via `pricingFor` (null when
  unknown), suitable for `cox models`.

## R6 — Mock model

As the cli workstream, I need a scripted `ChatModel` for integration tests
with zero network.

- R6.1 WHEN constructed with a script of turns THE SYSTEM SHALL, per
  `stream()` call, consume the next turn and yield its text deltas, tool
  uses, one `usage` event, and one `done` event in that order.
- R6.2 WHEN a turn specifies a failure THE SYSTEM SHALL throw an `Error`
  honoring the turn's `retryable` flag instead of yielding.
- R6.3 WHEN the script is exhausted THE SYSTEM SHALL throw an `Error` saying
  so (test authoring aid).

## R7 — Capability guards

As a correctness measure, provider quirks must be guarded in the adapter, not
discovered as API 400s.

- R7.1 WHEN the model is `claude-haiku-4-5` THE SYSTEM SHALL clamp
  `maxTokens` to 64000 and SHALL NOT send `output_config.effort`.
- R7.2 WHEN `req.effort` is set and the model supports it
  (`claude-sonnet-5`, `claude-opus-4-8`, `claude-fable-5`) THE SYSTEM SHALL
  send `output_config: {effort}`; otherwise it SHALL omit it silently.
- R7.3 THE anthropic adapter SHALL never send `temperature`, `top_p`,
  `top_k`, or any `thinking` configuration (model defaults apply in v1).

## R8 — Token estimation

As the router, I need cheap client-side estimates for routing announcements.

- R8.1 WHEN `estimateTokens(text)` is called on any model THE SYSTEM SHALL
  return `ceil(text.length / 4)` (documented heuristic, no network).
