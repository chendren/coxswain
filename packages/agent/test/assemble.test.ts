import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@cox/core";
import { assemble, buildAssistantMessage, buildToolResultMessage } from "../src/assemble";
import { scripted } from "./helpers/scripted-model";

async function consume(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _event of stream) {
    // drain — the ScriptedChatModel records the request on call, not here
  }
}

describe("assemble (R2.1, R2.3)", () => {
  it("R2.1: sends system verbatim", () => {
    const req = assemble("SYSTEM PROMPT", [], [], 0);
    expect(req.system).toBe("SYSTEM PROMPT");
  });

  it("R2.1: system is identical across calls (no per-turn content added)", () => {
    const msgs: ChatMessage[] = [{ role: "user", content: [{ type: "text", text: "hi" }] }];
    const req1 = assemble("SYS", msgs, [], 0);
    const req2 = assemble("SYS", msgs, [], 1);
    expect(req1.system).toBe("SYS");
    expect(req2.system).toBe("SYS");
  });

  it("passes messages and tools through unchanged", () => {
    const messages: ChatMessage[] = [{ role: "user", content: [{ type: "text", text: "hi" }] }];
    const tools = [{ name: "read", description: "d", inputSchema: {} }];
    const req = assemble("sys", messages, tools, 0);
    expect(req.messages).toBe(messages);
    expect(req.tools).toBe(tools);
  });

  it("sets a maxTokens budget", () => {
    const req = assemble("sys", [], [], 0);
    expect(req.maxTokens).toBeGreaterThan(0);
  });

  it("R2.3: empty history -> no cache breakpoint (undefined)", () => {
    const req = assemble("sys", [], [], 0);
    expect(req.cacheBreakpointMessageIndex).toBeUndefined();
  });

  it("R2.3: first call uses history.length - 1", () => {
    // messages = 2 prior history messages + this turn's fresh prompt
    const messages: ChatMessage[] = [
      { role: "user", content: [{ type: "text", text: "h1" }] },
      { role: "assistant", content: [{ type: "text", text: "h2" }] },
      { role: "user", content: [{ type: "text", text: "prompt" }] },
    ];
    const req = assemble("sys", messages, [], 2 /* task.history.length */);
    expect(req.cacheBreakpointMessageIndex).toBe(1);
  });

  it("R2.3: subsequent calls break at the previous call's last message index (via recorded requests)", async () => {
    const model = scripted([
      { toolUses: [{ id: "t1", name: "read", input: { path: "a" } }] },
      { deltas: ["done"] },
    ]);

    // Turn 1: empty history, one fresh user message.
    let messages: ChatMessage[] = [{ role: "user", content: [{ type: "text", text: "go" }] }];
    let prevLen = 0; // task.history.length
    await consume(model.stream(assemble("sys", messages, [], prevLen)));
    prevLen = messages.length; // captured right after assembling, per runner.ts contract

    // Turn 1 produced a tool call -> append assistant + tool_result messages.
    messages = [
      ...messages,
      buildAssistantMessage("", [{ id: "t1", name: "read", input: { path: "a" } }]),
      buildToolResultMessage([{ toolUseId: "t1", content: "file contents", isError: false }]),
    ];

    // Turn 2: breakpoint should land on turn 1's last message index.
    await consume(model.stream(assemble("sys", messages, [], prevLen)));

    expect(model.requests[0]?.cacheBreakpointMessageIndex).toBeUndefined();
    expect(model.requests[1]?.cacheBreakpointMessageIndex).toBe(0); // prevLen(1) - 1
  });
});

describe("buildAssistantMessage / buildToolResultMessage (R2.2)", () => {
  it("builds one text block then tool_use blocks, in stream order", () => {
    const msg = buildAssistantMessage("thinking...", [
      { id: "1", name: "read", input: { path: "a" } },
      { id: "2", name: "grep", input: { pattern: "x" } },
    ]);
    expect(msg.role).toBe("assistant");
    expect(msg.content).toEqual([
      { type: "text", text: "thinking..." },
      { type: "tool_use", id: "1", name: "read", input: { path: "a" } },
      { type: "tool_use", id: "2", name: "grep", input: { pattern: "x" } },
    ]);
  });

  it("includes the text block even when text is empty", () => {
    const msg = buildAssistantMessage("", [{ id: "1", name: "read", input: {} }]);
    expect(msg.content[0]).toEqual({ type: "text", text: "" });
  });

  it("includes the text block even with no tool uses", () => {
    const msg = buildAssistantMessage("just text", []);
    expect(msg.content).toEqual([{ type: "text", text: "just text" }]);
  });

  it("builds exactly one user message with all tool_results in order", () => {
    const msg = buildToolResultMessage([
      { toolUseId: "1", content: "a", isError: false },
      { toolUseId: "2", content: "boom", isError: true },
    ]);
    expect(msg.role).toBe("user");
    expect(msg.content).toEqual([
      { type: "tool_result", toolUseId: "1", content: "a", isError: false },
      { type: "tool_result", toolUseId: "2", content: "boom", isError: true },
    ]);
  });
});
