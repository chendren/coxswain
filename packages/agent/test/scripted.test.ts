import { describe, expect, it } from "vitest";
import type { ChatRequest, StreamEvent } from "@cox/core";
import { scripted } from "./helpers/scripted-model";
import { inputPreview, resultPreview } from "../src/preview";

async function collect(stream: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

function req(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return { system: "sys", messages: [], tools: [], maxTokens: 1000, ...overrides };
}

describe("R9.1: ScriptedChatModel", () => {
  it("replays deltas, toolUses, and usage in order", async () => {
    const model = scripted([
      {
        deltas: ["Hello", " world"],
        toolUses: [{ id: "t1", name: "read", input: { path: "a.ts" } }],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);
    const events = await collect(model.stream(req()));
    expect(events).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " world" },
      { type: "tool_use", id: "t1", name: "read", input: { path: "a.ts" } },
      {
        type: "usage",
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
      { type: "done", stopReason: "tool_use" },
    ]);
  });

  it("defaults stopReason to end_turn when there are no toolUses", async () => {
    const model = scripted([{ deltas: ["hi"] }]);
    const events = await collect(model.stream(req()));
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end_turn" });
  });

  it("honors an explicit stopReason override", async () => {
    const model = scripted([{ deltas: ["hi"], stopReason: "max_tokens" }]);
    const events = await collect(model.stream(req()));
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "max_tokens" });
  });

  it("records every request passed to stream(), in order", async () => {
    const model = scripted([{ deltas: ["a"] }, { deltas: ["b"] }]);
    await collect(model.stream(req({ system: "first" })));
    await collect(model.stream(req({ system: "second" })));
    expect(model.requests.map((r) => r.system)).toEqual(["first", "second"]);
  });

  it("advances turn-by-turn, then repeats the last turn once exhausted", async () => {
    const model = scripted([{ deltas: ["one"] }, { deltas: ["two"] }]);
    expect((await collect(model.stream(req())))[0]).toEqual({ type: "text_delta", text: "one" });
    expect((await collect(model.stream(req())))[0]).toEqual({ type: "text_delta", text: "two" });
    expect((await collect(model.stream(req())))[0]).toEqual({ type: "text_delta", text: "two" });
  });

  it("failWith throws mid-stream, after any deltas already yielded", async () => {
    const boom = new Error("boom");
    const model = scripted([{ deltas: ["partial"], failWith: boom }]);
    const iter = model.stream(req())[Symbol.asyncIterator]();
    expect(await iter.next()).toEqual({ done: false, value: { type: "text_delta", text: "partial" } });
    await expect(iter.next()).rejects.toThrow("boom");
  });

  it("throws an AbortError once the passed signal is aborted mid-stream", async () => {
    const model = scripted([{ deltas: ["a", "b", "c"] }]);
    const controller = new AbortController();
    const iter = model.stream(req(), controller.signal)[Symbol.asyncIterator]();
    await iter.next(); // "a"
    controller.abort();
    await expect(iter.next()).rejects.toThrow(/aborted/i);
  });

  it("rejects an empty turn list", () => {
    expect(() => scripted([])).toThrow(/at least one turn/);
  });
});

describe("R3.3: preview helpers", () => {
  it("inputPreview passes short input through unchanged", () => {
    expect(inputPreview({ path: "a.ts" })).toBe('{"path":"a.ts"}');
  });

  it("inputPreview truncates at 80 chars with an ellipsis, staying within budget", () => {
    const longPath = "x".repeat(200);
    const preview = inputPreview({ path: longPath });
    expect(preview.length).toBeLessThanOrEqual(80);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("inputPreview collapses whitespace", () => {
    expect(inputPreview("line1\nline2   line3")).toBe("line1 line2 line3");
  });

  it("resultPreview takes only the first line", () => {
    expect(resultPreview("first line\nsecond line\nthird")).toBe("first line");
  });

  it("resultPreview truncates at 120 chars with an ellipsis, staying within budget", () => {
    const longLine = "y".repeat(300);
    const preview = resultPreview(longLine);
    expect(preview.length).toBeLessThanOrEqual(120);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("resultPreview passes short content through unchanged", () => {
    expect(resultPreview("ok")).toBe("ok");
  });
});
