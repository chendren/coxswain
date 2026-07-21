import type { ChatModel, ChatRequest, ModelRef, StreamEvent } from "@cox/core";
import { describe, expect, it } from "vitest";
import { createFailoverChatModel } from "../src/failover.js";
import { createMockModel } from "../src/mock.js";
import { providerError } from "../src/errors.js";

const REQ: ChatRequest = { system: "s", messages: [], tools: [], maxTokens: 100 };

async function collect(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

/** Counts stream() invocations on top of a real ChatModel, for call-count assertions. */
function countingModel(model: ChatModel): { model: ChatModel; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    model: {
      ref: model.ref,
      estimateTokens: model.estimateTokens,
      stream(req, signal) {
        calls++;
        return model.stream(req, signal);
      },
    },
  };
}

/** A ChatModel that yields one event, then throws — MockTurn can't express this. */
function yieldsThenFails(ref: ModelRef, message: string, retryable: boolean): ChatModel {
  return {
    ref,
    estimateTokens: (text: string) => Math.ceil(text.length / 4),
    async *stream(): AsyncIterable<StreamEvent> {
      yield { type: "text_delta", text: "partial" };
      throw providerError(message, retryable);
    },
  };
}

describe("createFailoverChatModel", () => {
  it("throws immediately on a zero-length model list", () => {
    expect(() => createFailoverChatModel([])).toThrow(/at least one model/i);
  });

  it("R4.3: ref and estimateTokens delegate to the primary (first) model", () => {
    const primary = createMockModel([], { provider: "anthropic", model: "claude-sonnet-5" });
    const secondary = createMockModel([], { provider: "xai", model: "grok-4-1-fast" });
    const failover = createFailoverChatModel([primary, secondary]);

    expect(failover.ref).toEqual({ provider: "anthropic", model: "claude-sonnet-5" });
    expect(failover.estimateTokens("abcdefgh")).toBe(primary.estimateTokens("abcdefgh"));
  });

  it("R4.1: advances to the next model on a retryable failure before any event was yielded", async () => {
    const a = countingModel(
      createMockModel([{ failWith: { message: "rate limited", retryable: true } }], {
        provider: "a",
        model: "a",
      }),
    );
    const b = countingModel(
      createMockModel([{ textDeltas: ["ok"], usage: { inputTokens: 1 }, stopReason: "end_turn" }], {
        provider: "b",
        model: "b",
      }),
    );
    const failover = createFailoverChatModel([a.model, b.model]);

    const events = await collect(failover.stream(REQ));

    expect(a.calls()).toBe(1);
    expect(b.calls()).toBe(1);
    expect(events).toEqual([
      { type: "text_delta", text: "ok" },
      { type: "usage", usage: { inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  it("R4.1: advances across more than one retryable failure", async () => {
    const a = createMockModel([{ failWith: { message: "down", retryable: true } }], { provider: "a", model: "a" });
    const b = createMockModel([{ failWith: { message: "also down", retryable: true } }], {
      provider: "b",
      model: "b",
    });
    const c = createMockModel([{ textDeltas: ["finally"] }], { provider: "c", model: "c" });
    const failover = createFailoverChatModel([a, b, c]);

    const events = await collect(failover.stream(REQ));
    expect(events[0]).toEqual({ type: "text_delta", text: "finally" });
  });

  it("R4.2: does not advance when the failure occurs after events were already yielded", async () => {
    const a = countingModel(yieldsThenFails({ provider: "a", model: "a" }, "dropped mid-stream", true));
    const b = countingModel(createMockModel([{ textDeltas: ["should not run"] }], { provider: "b", model: "b" }));
    const failover = createFailoverChatModel([a.model, b.model]);

    const out: StreamEvent[] = [];
    await expect(async () => {
      for await (const event of failover.stream(REQ)) out.push(event);
    }).rejects.toMatchObject({ message: "dropped mid-stream", retryable: true });

    expect(out).toEqual([{ type: "text_delta", text: "partial" }]);
    expect(a.calls()).toBe(1);
    expect(b.calls()).toBe(0); // never advanced
  });

  it("R4.2: does not advance on a non-retryable failure", async () => {
    const a = countingModel(
      createMockModel([{ failWith: { message: "bad request", retryable: false } }], { provider: "a", model: "a" }),
    );
    const b = countingModel(createMockModel([{ textDeltas: ["should not run"] }], { provider: "b", model: "b" }));
    const failover = createFailoverChatModel([a.model, b.model]);

    await expect(collect(failover.stream(REQ))).rejects.toMatchObject({
      message: "bad request",
      retryable: false,
    });
    expect(a.calls()).toBe(1);
    expect(b.calls()).toBe(0);
  });

  it("R4.2: exhausting all candidates rethrows the last error", async () => {
    const a = countingModel(
      createMockModel([{ failWith: { message: "a down", retryable: true } }], { provider: "a", model: "a" }),
    );
    const b = countingModel(
      createMockModel([{ failWith: { message: "b down too", retryable: true } }], { provider: "b", model: "b" }),
    );
    const failover = createFailoverChatModel([a.model, b.model]);

    await expect(collect(failover.stream(REQ))).rejects.toMatchObject({
      message: "b down too",
      retryable: true,
    });
    expect(a.calls()).toBe(1);
    expect(b.calls()).toBe(1);
  });
});
