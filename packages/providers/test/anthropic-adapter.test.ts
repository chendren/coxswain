import type { ChatRequest, StreamEvent } from "@cox/core";
import { afterEach, describe, expect, it } from "vitest";
import { createAnthropicAdapter, type AnthropicLike, type AnthropicStreamEvent } from "../src/anthropic.js";

const REQ: ChatRequest = { system: "s", messages: [], tools: [], maxTokens: 100 };
const TEST_KEY_VAR = "COX_TEST_ANTHROPIC_KEY_R1";

async function collect(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

function toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return (async function* () {
    for (const item of items) yield item;
  })();
}

afterEach(() => {
  delete process.env[TEST_KEY_VAR];
});

describe("createAnthropicAdapter", () => {
  it("R1.1: create(modelId) returns a ChatModel whose ref is {provider: 'anthropic', model: modelId}", () => {
    const adapter = createAnthropicAdapter({ apiKeyEnv: TEST_KEY_VAR });
    const model = adapter.create("claude-sonnet-5");
    expect(model.ref).toEqual({ provider: "anthropic", model: "claude-sonnet-5" });
  });

  it("models() returns the four known anthropic model ids", () => {
    const adapter = createAnthropicAdapter({ apiKeyEnv: TEST_KEY_VAR });
    expect(adapter.models()).toEqual([
      "claude-haiku-4-5",
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-fable-5",
    ]);
    expect(adapter.id).toBe("anthropic");
  });

  it("R1.6: a missing apiKeyEnv value throws a non-retryable Error naming that variable", () => {
    delete process.env[TEST_KEY_VAR];
    const adapter = createAnthropicAdapter(
      { apiKeyEnv: TEST_KEY_VAR },
      {
        clientFactory: () => {
          throw new Error("clientFactory must not be called when the key is missing");
        },
      },
    );
    const model = adapter.create("claude-sonnet-5");

    let thrown: unknown;
    try {
      model.stream(REQ);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain(TEST_KEY_VAR);
    expect((thrown as { retryable?: boolean }).retryable).toBe(false);
  });

  it("R1.7: the AbortSignal passed to stream() is forwarded to messages.stream()", async () => {
    process.env[TEST_KEY_VAR] = "test-key";
    let capturedOptions: { signal?: AbortSignal } | undefined;
    const fakeFactory = (): AnthropicLike => ({
      messages: {
        stream: (_body, options) => {
          capturedOptions = options;
          return (async function* (): AsyncIterable<AnthropicStreamEvent> {
            yield { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } };
          })();
        },
      },
    });
    const adapter = createAnthropicAdapter({ apiKeyEnv: TEST_KEY_VAR }, { clientFactory: fakeFactory });
    const model = adapter.create("claude-sonnet-5");
    const controller = new AbortController();

    await collect(model.stream(REQ, controller.signal));

    expect(capturedOptions?.signal).toBe(controller.signal);
  });

  it("R1.7: an aborted signal stops the stream without an internal retry", async () => {
    process.env[TEST_KEY_VAR] = "test-key";
    let calls = 0;
    const fakeFactory = (): AnthropicLike => ({
      messages: {
        stream: (_body, options) => {
          calls++;
          return (async function* (): AsyncIterable<AnthropicStreamEvent> {
            if (options?.signal?.aborted) {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              throw err;
            }
          })();
        },
      },
    });
    const adapter = createAnthropicAdapter({ apiKeyEnv: TEST_KEY_VAR }, { clientFactory: fakeFactory });
    const model = adapter.create("claude-sonnet-5");
    const controller = new AbortController();
    controller.abort();

    await expect(collect(model.stream(REQ, controller.signal))).rejects.toMatchObject({
      retryable: false,
    });
    expect(calls).toBe(1); // no retry after an abort
  });

  it("captures the request body built by buildAnthropicRequest and passes it to messages.stream", async () => {
    process.env[TEST_KEY_VAR] = "test-key";
    let capturedBody: unknown;
    const fakeFactory = (): AnthropicLike => ({
      messages: {
        stream: (body) => {
          capturedBody = body;
          return (async function* (): AsyncIterable<AnthropicStreamEvent> {
            yield { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } };
          })();
        },
      },
    });
    const adapter = createAnthropicAdapter({ apiKeyEnv: TEST_KEY_VAR }, { clientFactory: fakeFactory });
    const model = adapter.create("claude-haiku-4-5");

    await collect(model.stream({ ...REQ, maxTokens: 999_999 }));

    expect(capturedBody).toMatchObject({ model: "claude-haiku-4-5", max_tokens: 64000 });
  });

  it("R3: a 429-shaped failure is retried once and then succeeds; a 401-shaped failure is not retried", async () => {
    process.env[TEST_KEY_VAR] = "test-key";

    let rateLimitedCalls = 0;
    const rateLimited = createAnthropicAdapter(
      { apiKeyEnv: TEST_KEY_VAR },
      {
        clientFactory: (): AnthropicLike => ({
          messages: {
            stream: () =>
              (async function* (): AsyncIterable<AnthropicStreamEvent> {
                rateLimitedCalls++;
                if (rateLimitedCalls === 1) {
                  throw Object.assign(new Error("rate limited"), { status: 429 });
                }
                yield { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } };
              })(),
          },
        }),
      },
    );
    const events = await collect(rateLimited.create("claude-sonnet-5").stream(REQ));
    expect(rateLimitedCalls).toBe(2); // one failure + one successful retry
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end_turn" });

    const unauthorized = createAnthropicAdapter(
      { apiKeyEnv: TEST_KEY_VAR },
      {
        clientFactory: (): AnthropicLike => ({
          messages: {
            stream: () =>
              (async function* (): AsyncIterable<AnthropicStreamEvent> {
                throw Object.assign(new Error("unauthorized"), { status: 401 });
              })(),
          },
        }),
      },
    );
    await expect(collect(unauthorized.create("claude-sonnet-5").stream(REQ))).rejects.toMatchObject({
      retryable: false,
    });
  });

  it("a fully scripted stream translates end to end through the real adapter", async () => {
    process.env[TEST_KEY_VAR] = "test-key";
    const events: AnthropicStreamEvent[] = [
      { type: "message_start", message: { usage: { input_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
    ];
    const fakeFactory = (): AnthropicLike => ({
      messages: { stream: () => toAsyncIterable(events) },
    });
    const adapter = createAnthropicAdapter({ apiKeyEnv: TEST_KEY_VAR }, { clientFactory: fakeFactory });
    const out = await collect(adapter.create("claude-sonnet-5").stream(REQ));
    expect(out).toEqual([
      { type: "text_delta", text: "hi" },
      { type: "usage", usage: { inputTokens: 3, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } },
      { type: "done", stopReason: "end_turn" },
    ]);
  });
});
