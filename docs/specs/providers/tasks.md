# providers — Tasks

Execute strictly top to bottom. One commit per task:
`ws/providers: task N — <title>`. A task is done only when `verify` passes;
paste its output in the commit body. All tests offline, no env vars.

- [x] 1. Package scaffolding & deps
      requirements: R1, R2
      complexity: 1
      accept: `@anthropic-ai/sdk` added to dependencies; `--passWithNoTests`
        removed from the test script; empty `src/` module layout from
        design.md created with TODO stubs that typecheck.
      verify: pnpm --filter @cox/providers typecheck

- [x] 2. Error taxonomy + withRetries
      requirements: R3.1, R3.2, R3.3, R3.4
      complexity: 3
      accept: `providerError`/`isRetryable`/`withRetries` per design; sleep
        injectable; retries only when zero events yielded; backoff sequence
        500/1000ms (+jitter) asserted with fake sleep.
      verify: pnpm --filter @cox/providers test -- -t "R3"

- [x] 3. Mock model
      requirements: R6.1, R6.2, R6.3
      complexity: 2
      accept: `createMockModel(script)` yields deltas → toolUses → usage →
        done per turn; `failWith` throws with retryable marker; exhausted
        script throws; exported from index.ts.
      verify: pnpm --filter @cox/providers test -- -t "R6"

- [x] 4. Estimation + capability tables
      requirements: R8.1, R7.1, R7.2
      complexity: 1
      accept: `estimateTokens` = ceil(len/4); `EFFORT_MODELS` and
        `maxOutputFor` (haiku-4-5 → 64000, default 128000) unit-tested.
      verify: pnpm --filter @cox/providers test -- -t "R8"

- [x] 5. Anthropic request builder (pure)
      requirements: R1.2, R1.5, R7.1, R7.2, R7.3
      complexity: 3
      accept: pure `buildAnthropicRequest(modelId, req)` covering the full
        mapping table: system cache_control, message-index breakpoint,
        content-block and tool mappings, maxTokens clamp, effort gating;
        asserts absence of temperature/top_p/top_k/thinking keys.
      verify: pnpm --filter @cox/providers test -- -t "R1.2"

- [ ] 6. Anthropic stream translation
      requirements: R1.3, R1.4
      complexity: 4
      accept: fake SDK event stream (incl. split input_json_delta fragments
        and a thinking block) translates to ordered StreamEvents; exactly one
        usage (all four fields mapped) and one done; unknown stop_reason →
        "error".
      verify: pnpm --filter @cox/providers test -- -t "R1.3"

- [ ] 7. Anthropic adapter factory
      requirements: R1.1, R1.6, R1.7, R3 (classification at call site)
      complexity: 3
      accept: `createAnthropicAdapter` wires builder + translation +
        withRetries; lazy key read (missing env var → non-retryable error
        naming it); AbortSignal passed through and honored in fake client;
        `models()` returns the four known ids.
      verify: pnpm --filter @cox/providers test -- -t "R1.1|R1.6|R1.7" && pnpm --filter @cox/providers typecheck

- [ ] 8. OpenAI-compat request builder (pure)
      requirements: R2.2, R2.5
      complexity: 3
      accept: message flattening rules (system lead message; assistant
        text+tool_calls; tool_result → role:"tool" before user text; ERROR
        prefix), tools mapping, stream_options, auth header presence/absence.
      verify: pnpm --filter @cox/providers test -- -t "R2.2"

- [ ] 9. SSE parser + openai-compat stream translation
      requirements: R2.3, R2.4
      complexity: 4
      accept: byte-stream SSE parsing with a chunk boundary mid-line;
        tool_call fragment accumulation by index; finish_reason and usage
        chunk mapping; zeroed usage emitted when provider sends none.
      verify: pnpm --filter @cox/providers test -- -t "R2.3|R2.4"

- [ ] 10. OpenAI-compat adapter factory
      requirements: R2.1, R2.5, R3
      complexity: 2
      accept: `createOpenAICompatAdapter` wires builder + parser +
        withRetries with injectable fetch; id/models from entry; 401 without
        retry, 429 with retry asserted.
      verify: pnpm --filter @cox/providers test -- -t "R2.1"

- [ ] 11. Failover wrapper
      requirements: R4.1, R4.2, R4.3
      complexity: 3
      accept: advances on retryable pre-first-event failures; rethrows
        mid-stream or non-retryable; exhaustion rethrows last error;
        ref/estimateTokens delegate to primary.
      verify: pnpm --filter @cox/providers test -- -t "R4"

- [ ] 12. Provider registry
      requirements: R5.1, R5.2, R5.3
      complexity: 2
      accept: `createProviderRegistry(configSchema.parse({}))` resolves
        anthropic models; per-key caching (same instance twice); unknown
        provider error lists configured ids; `listModels()` pairs known ids
        with `pricingFor` results (ollama entry → $0 pricing).
      verify: pnpm --filter @cox/providers test -- -t "R5"

- [ ] 13. Package close-out
      requirements: all
      complexity: 1
      accept: index.ts exports exactly the design.md surface; NOTES.md
        written (decisions/deviations ≤1 page); full suite + typecheck green;
        every R-id appears in ≥1 test name (`grep -o 'R[0-9]\.[0-9]' test/*` audit).
      verify: pnpm --filter @cox/providers typecheck && pnpm --filter @cox/providers test
