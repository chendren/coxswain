# providers — Design

Implements `ProviderAdapter`, `ChatModel`, `ProviderRegistry` from
`@cox/core`. No other `@cox/*` imports. Runtime deps: `@anthropic-ai/sdk`
only; the openai-compat adapter uses global `fetch` + hand-rolled SSE parsing
(no `openai` package, no `eventsource` package).

## Files

```
packages/providers/src/
  index.ts        re-exports: createAnthropicAdapter, createOpenAICompatAdapter,
                  createProviderRegistry, createFailoverChatModel,
                  createMockModel, type MockTurn, ProviderError helpers
  errors.ts       providerError(msg, retryable), isRetryable(err), withRetries(fn)
  estimate.ts     estimateTokens(text) = Math.ceil(text.length / 4)
  capabilities.ts EFFORT_MODELS set, maxOutputFor(modelId)
  anthropic.ts    createAnthropicAdapter
  openai-compat.ts createOpenAICompatAdapter + SSE line parser
  failover.ts     createFailoverChatModel
  registry.ts     createProviderRegistry
  mock.ts         createMockModel
packages/providers/test/*.test.ts
packages/providers/NOTES.md
```

## Factory signatures

```ts
// anthropic.ts — clientFactory injectable for tests (no vi.mock of ESM needed)
export function createAnthropicAdapter(
  cfg: { apiKeyEnv: string },
  deps?: { clientFactory?: (apiKey: string) => AnthropicLike },
): ProviderAdapter;
// AnthropicLike is a minimal local structural type over the SDK surface used.

// openai-compat.ts — fetchImpl injectable for tests
export function createOpenAICompatAdapter(
  entry: { id: string; baseUrl: string; apiKeyEnv?: string; models: string[] },
  deps?: { fetchImpl?: typeof fetch },
): ProviderAdapter;

// failover.ts
export function createFailoverChatModel(models: ChatModel[]): ChatModel;

// registry.ts — builds anthropic + one adapter per openaiCompat entry;
// "ollama" is just an openaiCompat entry, nothing special.
export function createProviderRegistry(
  config: CoxConfig,
  deps?: { adapters?: ProviderAdapter[] }, // test override; default builds from config
): ProviderRegistry;

// mock.ts — consumed by @cox/cli integration tests ONLY. Other packages
// write their own local mocks per docs/03 ground rules.
export interface MockTurn {
  textDeltas?: string[];
  toolUses?: { id: string; name: string; input: unknown }[];
  usage?: Partial<TokenUsage>;
  stopReason?: StopReason;             // default "end_turn" ("tool_use" if toolUses)
  failWith?: { message: string; retryable: boolean };
}
export function createMockModel(script: MockTurn[], ref?: ModelRef): ChatModel;
```

`models()` on the anthropic adapter returns the static list
`["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8", "claude-fable-5"]`
— config tier maps reference these; unknown anthropic ids are still creatable
(pass-through) so users can pin newer models, but `registry.getModel` warns
via thrown-error text only when the *provider* is unknown, not the model.
Correction for determinism: `models()` is the *known* list; `create()` accepts
any id. `listModels()` lists known models only.

## Anthropic mapping (Provider facts — encode exactly)

Model ids: `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-4-8`,
`claude-fable-5`. Request via `client.messages.stream(...)`, passing
`signal` through request options.

| ChatRequest | Anthropic request |
|---|---|
| `system` | `system: [{type:"text", text, cache_control:{type:"ephemeral"}}]` (cache_control always on the last/only system block) |
| `messages[i]` content `text` | `{type:"text", text}` |
| content `tool_use` | `{type:"tool_use", id, name, input}` |
| content `tool_result` | `{type:"tool_result", tool_use_id: toolUseId, content, is_error: isError}` |
| `tools[]` | `{name, description, input_schema: inputSchema}` |
| `maxTokens` | `max_tokens`, clamped by `maxOutputFor` (haiku-4-5 → 64000, others → 128000) |
| `effort` | `output_config: {effort}` iff model ∈ EFFORT_MODELS = {sonnet-5, opus-4-8, fable-5}; else omitted |
| `cacheBreakpointMessageIndex` | additionally set `cache_control:{type:"ephemeral"}` on the last content block of `messages[index]` when `index >= 0` and in range |

Never send: `temperature`, `top_p`, `top_k`, `thinking` (v1 uses model
defaults; sonnet-5 runs adaptive thinking when omitted — that is fine and
its thinking deltas surface as `thinking_delta`).

Stream translation (iterate the SDK's raw event stream):

| SDK event | StreamEvent |
|---|---|
| `content_block_delta` `text_delta` | `{type:"text_delta", text}` |
| `content_block_delta` `thinking_delta` | `{type:"thinking_delta", text}` |
| `content_block_start` (tool_use block) | start accumulator keyed by block index (id, name) |
| `content_block_delta` `input_json_delta` | append `partial_json` to accumulator |
| `content_block_stop` (tool_use block) | `{type:"tool_use", id, name, input: JSON.parse(accumulated || "{}")}` |
| `message_start` | stash `usage.input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` |
| `message_delta` | stash `usage.output_tokens`, `stop_reason` |
| stream end | yield `usage` (mapped per R1.4, missing fields → 0), then `done` with mapped stopReason (`end_turn`/`tool_use`/`max_tokens`/`refusal`, else `"error"`) |

API key: read `process.env[cfg.apiKeyEnv]` inside `stream()` (lazily — so
`cox doctor` can construct adapters keylessly); missing → non-retryable
error: `` `anthropic: environment variable ${apiKeyEnv} is not set` ``.

## OpenAI-compat mapping

`POST {baseUrl}/chat/completions`, headers `content-type: application/json`
plus `authorization: Bearer ${key}` iff `apiKeyEnv` configured. Body:

- `model`, `stream: true`, `stream_options: {include_usage: true}`,
  `max_tokens: req.maxTokens`, `messages`, `tools` (omit when empty):
  `{type:"function", function:{name, description, parameters: inputSchema}}`.
- Message flattening rules:
  - `system` → leading `{role:"system", content}` message.
  - assistant message: concatenated text blocks → `content` (null when none);
    tool_use blocks → `tool_calls: [{id, type:"function", function:{name,
    arguments: JSON.stringify(input)}}]`.
  - user message: text blocks join to one `{role:"user", content}`; each
    `tool_result` block becomes its own `{role:"tool", tool_call_id, content}`
    message, emitted BEFORE the user text message (tool results answer the
    prior assistant turn). `isError` results prefix content with `"ERROR: "`.
- `effort` is ignored (no portable equivalent).

SSE parsing: split on newlines, lines starting `data: `; `data: [DONE]` ends.
Each JSON chunk: `choices[0].delta.content` → `text_delta`;
`delta.tool_calls[]` accumulate by `index` (first fragment carries id/name,
later ones append `function.arguments`); on `finish_reason` or [DONE], emit
accumulated tool calls as `tool_use` events (JSON.parse arguments, `{}` on
empty). Usage chunk (`usage` present, often with empty `choices`) →
`{type:"usage", usage:{inputTokens: prompt_tokens, outputTokens:
completion_tokens, cacheReadTokens: 0, cacheWriteTokens: 0}}`. Then `done`:
`stop→end_turn`, `tool_calls→tool_use`, `length→max_tokens`,
`content_filter→refusal`, otherwise `"error"`. If no usage chunk arrived,
still emit a zeroed `usage` event before `done` (contract: consumers may rely
on exactly one usage event).

## Errors & retries (`errors.ts`)

```ts
export function providerError(message: string, retryable: boolean): Error; // sets (err as any).retryable
export function isRetryable(err: unknown): boolean;                        // err?.retryable === true
export async function* withRetries<T>(attempt: () => AsyncIterable<T>): AsyncIterable<T>;
```

`withRetries` re-invokes `attempt` on retryable failures **only when zero
items have been yielded**; max 2 retries; backoff `500 * 2^n + random(0..250)`
ms (inject `sleep` dep for tests). Classification at the call site:
HTTP 429/5xx → retryable; fetch/network `TypeError` and SDK connection errors
→ retryable; other 4xx → non-retryable (include status + provider message).
Mid-stream failures propagate as classified errors without internal retry
(R3.4) — failover (R4.2) also refuses to switch models mid-stream, so a
partial turn is never silently replayed.

## Failover (`failover.ts`)

Holds `models: ChatModel[]`; `stream()` iterates candidates: wrap each
attempt, count yielded events; on `isRetryable(err) && yielded === 0 && more
candidates` continue to next, else rethrow. `ref`/`estimateTokens` delegate
to `models[0]`. Zero-length input → throw immediately.

## Registry (`registry.ts`)

Builds adapter map `{[adapter.id]: adapter}` from config (anthropic +
openaiCompat entries). `getModel` caches by `modelKey(ref)`. Unknown
provider → `` `unknown provider "${ref.provider}" — configured: ${ids.join(", ")}` ``.
`listModels()` = for each adapter, for each `models()` id:
`{ref, pricing: pricingFor(adapter.id, id)}`.

## Testing strategy

No network, no env keys. Anthropic: fake `clientFactory` returning canned
SDK-shaped event async-iterables; assert request bodies captured by the fake.
OpenAI-compat: fake `fetchImpl` returning `Response` with a
`ReadableStream` of SSE bytes (split mid-line in at least one test to prove
buffering). Retries: injectable sleep; assert attempt counts and backoff
sequence. Failover: mock models (local `createMockModel`) with `failWith`.
Test names carry requirement ids (`"R2.3: accumulates split tool_call fragments"`).
