import type { StreamEvent } from "@cox/core";
import { describe, expect, it } from "vitest";
import { translateAnthropicStream, type AnthropicStreamEvent } from "../src/anthropic.js";

async function fromArray<T>(items: T[]): Promise<AsyncIterable<T>> {
  return (async function* () {
    for (const item of items) yield item;
  })();
}

async function collect(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe("translateAnthropicStream", () => {
  it("R1.3: translates text_delta, thinking_delta, and split input_json_delta fragments into ordered StreamEvents", async () => {
    const raw: AnthropicStreamEvent[] = [
      {
        type: "message_start",
        message: {
          usage: { input_tokens: 100, cache_read_input_tokens: 20, cache_creation_input_tokens: 5 },
        },
      },
      { type: "content_block_start", index: 0, content_block: { type: "text" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "thinking" } },
      { type: "content_block_delta", index: 1, delta: { type: "thinking_delta", thinking: "pondering..." } },
      { type: "content_block_stop", index: 1 },
      {
        type: "content_block_start",
        index: 2,
        content_block: { type: "tool_use", id: "tool_abc", name: "read_file" },
      },
      { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"pa' } },
      {
        type: "content_block_delta",
        index: 2,
        delta: { type: "input_json_delta", partial_json: 'th":"x.ts"}' },
      },
      { type: "content_block_stop", index: 2 },
      { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 42 } },
      { type: "message_stop" },
    ];

    const events = await collect(translateAnthropicStream(await fromArray(raw)));

    expect(events).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " world" },
      { type: "thinking_delta", text: "pondering..." },
      { type: "tool_use", id: "tool_abc", name: "read_file", input: { path: "x.ts" } },
      {
        type: "usage",
        usage: { inputTokens: 100, outputTokens: 42, cacheReadTokens: 20, cacheWriteTokens: 5 },
      },
      { type: "done", stopReason: "tool_use" },
    ]);
  });

  it("R1.4: yields exactly one usage event with all four fields mapped, and exactly one done event", async () => {
    const raw: AnthropicStreamEvent[] = [
      {
        type: "message_start",
        message: { usage: { input_tokens: 7, cache_read_input_tokens: 1, cache_creation_input_tokens: 2 } },
      },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 9 } },
    ];

    const events = await collect(translateAnthropicStream(await fromArray(raw)));

    const usageEvents = events.filter((e) => e.type === "usage");
    const doneEvents = events.filter((e) => e.type === "done");
    expect(usageEvents).toHaveLength(1);
    expect(doneEvents).toHaveLength(1);
    expect(usageEvents[0]).toEqual({
      type: "usage",
      usage: { inputTokens: 7, outputTokens: 9, cacheReadTokens: 1, cacheWriteTokens: 2 },
    });
    expect(doneEvents[0]).toEqual({ type: "done", stopReason: "end_turn" });
  });

  it('R1.4: maps end_turn/tool_use/max_tokens/refusal, and unmapped stop_reason -> "error"', async () => {
    const cases: [raw: string, expected: string][] = [
      ["end_turn", "end_turn"],
      ["tool_use", "tool_use"],
      ["max_tokens", "max_tokens"],
      ["refusal", "refusal"],
      ["stop_sequence", "error"],
      ["pause_turn", "error"],
      ["something_unknown", "error"],
    ];

    for (const [raw, expected] of cases) {
      const events = await collect(
        translateAnthropicStream(
          await fromArray<AnthropicStreamEvent>([
            { type: "message_delta", delta: { stop_reason: raw }, usage: { output_tokens: 0 } },
          ]),
        ),
      );
      expect(events.at(-1)).toEqual({ type: "done", stopReason: expected });
    }
  });

  it("R1.4: missing usage/stop_reason fields default to 0 / error, still emitting exactly one usage and one done", async () => {
    const events = await collect(translateAnthropicStream(await fromArray<AnthropicStreamEvent>([])));
    expect(events).toEqual([
      { type: "usage", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } },
      { type: "done", stopReason: "error" },
    ]);
  });

  it("R1.3: content_block_stop for a non-tool_use block is a no-op (no stray tool_use event)", async () => {
    const raw: AnthropicStreamEvent[] = [
      { type: "content_block_start", index: 0, content_block: { type: "text" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } },
      { type: "content_block_stop", index: 0 },
    ];
    const events = await collect(translateAnthropicStream(await fromArray(raw)));
    expect(events.filter((e) => e.type === "tool_use")).toHaveLength(0);
  });
});
