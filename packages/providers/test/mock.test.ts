import type { ChatRequest, StreamEvent } from "@cox/core";
import { describe, expect, it } from "vitest";
import { createMockModel } from "../src/mock.js";

const REQ: ChatRequest = { system: "s", messages: [], tools: [], maxTokens: 100 };

async function collect(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe("createMockModel", () => {
  it("R6.1: yields text deltas, tool uses, one usage, one done — in that order", async () => {
    const model = createMockModel([
      {
        textDeltas: ["Hello", " world"],
        toolUses: [{ id: "t1", name: "read_file", input: { path: "a.ts" } }],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);

    const events = await collect(model.stream(REQ));

    expect(events.map((e) => e.type)).toEqual([
      "text_delta",
      "text_delta",
      "tool_use",
      "usage",
      "done",
    ]);
    expect(events[0]).toEqual({ type: "text_delta", text: "Hello" });
    expect(events[1]).toEqual({ type: "text_delta", text: " world" });
    expect(events[2]).toEqual({
      type: "tool_use",
      id: "t1",
      name: "read_file",
      input: { path: "a.ts" },
    });
    expect(events[3]).toEqual({
      type: "usage",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    // stopReason defaults to "tool_use" because this turn scripted a tool use.
    expect(events[4]).toEqual({ type: "done", stopReason: "tool_use" });
  });

  it("R6.1: defaults stopReason to end_turn when no tool uses are scripted", async () => {
    const model = createMockModel([{ textDeltas: ["hi"] }]);
    const events = await collect(model.stream(REQ));
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end_turn" });
    expect(events.at(-2)).toEqual({
      type: "usage",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
  });

  it("R6.1: an explicit stopReason overrides the tool-use default", async () => {
    const model = createMockModel([
      { toolUses: [{ id: "t1", name: "x", input: {} }], stopReason: "max_tokens" },
    ]);
    const events = await collect(model.stream(REQ));
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "max_tokens" });
  });

  it("R6.1: consecutive stream() calls consume successive turns in order", async () => {
    const model = createMockModel([{ textDeltas: ["one"] }, { textDeltas: ["two"] }]);
    const first = await collect(model.stream(REQ));
    const second = await collect(model.stream(REQ));
    expect(first[0]).toEqual({ type: "text_delta", text: "one" });
    expect(second[0]).toEqual({ type: "text_delta", text: "two" });
  });

  it("R6.2: failWith throws honoring the turn's retryable flag instead of yielding", async () => {
    const model = createMockModel([{ failWith: { message: "rate limited", retryable: true } }]);
    await expect(collect(model.stream(REQ))).rejects.toMatchObject({
      message: "rate limited",
      retryable: true,
    });
  });

  it("R6.2: failWith honors retryable:false", async () => {
    const model = createMockModel([{ failWith: { message: "bad request", retryable: false } }]);
    await expect(collect(model.stream(REQ))).rejects.toMatchObject({
      message: "bad request",
      retryable: false,
    });
  });

  it("R6.3: an exhausted script throws a descriptive error", async () => {
    const model = createMockModel([{ textDeltas: ["only turn"] }]);
    await collect(model.stream(REQ));
    await expect(collect(model.stream(REQ))).rejects.toThrow(/exhausted/i);
  });

  it("R6.3: an empty script throws on the first call", async () => {
    const model = createMockModel([]);
    await expect(collect(model.stream(REQ))).rejects.toThrow(/exhausted/i);
  });

  it("uses the default mock ref when none is given, and a custom one when provided", () => {
    const defaultModel = createMockModel([]);
    expect(defaultModel.ref).toEqual({ provider: "mock", model: "mock-model" });

    const customModel = createMockModel([], { provider: "xai", model: "grok-4-1-fast" });
    expect(customModel.ref).toEqual({ provider: "xai", model: "grok-4-1-fast" });
  });

  it("estimateTokens matches the shared R8.1 heuristic", () => {
    const model = createMockModel([]);
    expect(model.estimateTokens("abcdefgh")).toBe(2);
  });
});
