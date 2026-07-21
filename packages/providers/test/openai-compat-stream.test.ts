import type { StreamEvent } from "@cox/core";
import { describe, expect, it } from "vitest";
import { parseSSELines, translateOpenAICompatStream } from "../src/openai-compat.js";

function toBytes(...parts: string[]): AsyncIterable<Uint8Array> {
  const encoder = new TextEncoder();
  return (async function* () {
    for (const part of parts) yield encoder.encode(part);
  })();
}

function toLines(items: string[]): AsyncIterable<string> {
  return (async function* () {
    for (const item of items) yield item;
  })();
}

async function collectStrings(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

async function collectEvents(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

function sseLine(payload: string): string {
  return `data: ${payload}\n\n`;
}

describe("parseSSELines", () => {
  it("R2.3: yields the JSON payload of each data: line and stops at [DONE]", async () => {
    const bytes = toBytes(
      sseLine('{"a":1}') + sseLine('{"a":2}') + "data: [DONE]\n\n",
    );
    expect(await collectStrings(parseSSELines(bytes))).toEqual(['{"a":1}', '{"a":2}']);
  });

  it("R2.3: reassembles a data: line split across a chunk boundary mid-line", async () => {
    // Split right in the middle of the JSON payload, across two byte chunks.
    const bytes = toBytes('data: {"choi', 'ces":[{"delta":{"content":"hi"}}]}\n\n', "data: [DONE]\n\n");
    expect(await collectStrings(parseSSELines(bytes))).toEqual([
      '{"choices":[{"delta":{"content":"hi"}}]}',
    ]);
  });

  it("R2.3: splits mid-line even at the exact newline boundary", async () => {
    const bytes = toBytes("data: {\"x\":1}", "\n\n", "data: [DONE]", "\n\n");
    expect(await collectStrings(parseSSELines(bytes))).toEqual(['{"x":1}']);
  });

  it("ignores non-data lines (e.g. blank keep-alive lines, event: lines)", async () => {
    const bytes = toBytes("event: ping\n\n" + sseLine('{"a":1}') + "\n" + "data: [DONE]\n\n");
    expect(await collectStrings(parseSSELines(bytes))).toEqual(['{"a":1}']);
  });
});

describe("translateOpenAICompatStream", () => {
  it("R2.3: yields text_delta events for content fragments in order", async () => {
    const lines = toLines([
      JSON.stringify({ choices: [{ delta: { content: "Hel" } }] }),
      JSON.stringify({ choices: [{ delta: { content: "lo" } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
    ]);
    const events = await collectEvents(translateOpenAICompatStream(lines));
    expect(events.filter((e) => e.type === "text_delta")).toEqual([
      { type: "text_delta", text: "Hel" },
      { type: "text_delta", text: "lo" },
    ]);
  });

  it("R2.3: accumulates split tool_call fragments by index and emits tool_use on finish_reason", async () => {
    const lines = toLines([
      JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read" } }] } }],
      }),
      JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"path"' } }] } }],
      }),
      JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':"a.ts"}' } }] } }],
      }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
      JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 3 } }),
    ]);

    const events = await collectEvents(translateOpenAICompatStream(lines));

    expect(events).toEqual([
      { type: "tool_use", id: "call_1", name: "read", input: { path: "a.ts" } },
      { type: "usage", usage: { inputTokens: 5, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 } },
      { type: "done", stopReason: "tool_use" },
    ]);
  });

  it("R2.3: accumulates two interleaved tool calls by their own indices", async () => {
    const lines = toLines([
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "call_a", function: { name: "read" } },
                { index: 1, id: "call_b", function: { name: "write" } },
              ],
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { arguments: '{"a":1}' } },
                { index: 1, function: { arguments: '{"b":2}' } },
              ],
            },
          },
        ],
      }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
    ]);

    const events = await collectEvents(translateOpenAICompatStream(lines));
    expect(events.filter((e) => e.type === "tool_use")).toEqual([
      { type: "tool_use", id: "call_a", name: "read", input: { a: 1 } },
      { type: "tool_use", id: "call_b", name: "write", input: { b: 2 } },
    ]);
  });

  it.each([
    ["stop", "end_turn"],
    ["tool_calls", "tool_use"],
    ["length", "max_tokens"],
    ["content_filter", "refusal"],
    ["something_else", "error"],
  ])("R2.4: maps finish_reason %s to stopReason %s", async (raw, expected) => {
    const lines = toLines([JSON.stringify({ choices: [{ delta: {}, finish_reason: raw }] })]);
    const events = await collectEvents(translateOpenAICompatStream(lines));
    expect(events.at(-1)).toEqual({ type: "done", stopReason: expected });
  });

  it("R2.4: maps the usage chunk (prompt_tokens/completion_tokens), cache fields always 0", async () => {
    const lines = toLines([
      JSON.stringify({ choices: [{ delta: { content: "hi" } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      JSON.stringify({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 22 } }),
    ]);
    const events = await collectEvents(translateOpenAICompatStream(lines));
    const usageEvents = events.filter((e) => e.type === "usage");
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toEqual({
      type: "usage",
      usage: { inputTokens: 11, outputTokens: 22, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
  });

  it("R2.4: emits a zeroed usage event before done when the provider sends no usage chunk", async () => {
    const lines = toLines([
      JSON.stringify({ choices: [{ delta: { content: "hi" } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
    ]);
    const events = await collectEvents(translateOpenAICompatStream(lines));
    expect(events.at(-2)).toEqual({
      type: "usage",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end_turn" });
  });

  it("R2.4: an empty stream still yields exactly one usage and one done", async () => {
    const events = await collectEvents(translateOpenAICompatStream(toLines([])));
    expect(events).toEqual([
      { type: "usage", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } },
      { type: "done", stopReason: "error" },
    ]);
  });

  it("ignores malformed JSON lines defensively", async () => {
    const lines = toLines(["not json{{{", JSON.stringify({ choices: [{ delta: { content: "ok" } }] })]);
    const events = await collectEvents(translateOpenAICompatStream(lines));
    expect(events.filter((e) => e.type === "text_delta")).toEqual([{ type: "text_delta", text: "ok" }]);
  });
});
