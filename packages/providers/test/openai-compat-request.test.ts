import type { ChatRequest } from "@cox/core";
import { describe, expect, it } from "vitest";
import { buildOpenAICompatHeaders, buildOpenAICompatRequest } from "../src/openai-compat.js";

const BASE_REQ: ChatRequest = {
  system: "You are cox.",
  messages: [],
  tools: [],
  maxTokens: 2048,
};

describe("buildOpenAICompatRequest", () => {
  it("R2.2: leads with a system message", () => {
    const body = buildOpenAICompatRequest("grok-4-1-fast", BASE_REQ);
    expect(body.messages[0]).toEqual({ role: "system", content: "You are cox." });
  });

  it("R2.2: sets model, stream, stream_options, and max_tokens", () => {
    const body = buildOpenAICompatRequest("grok-4-1-fast", { ...BASE_REQ, maxTokens: 777 });
    expect(body.model).toBe("grok-4-1-fast");
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.max_tokens).toBe(777);
  });

  it("R2.2: assistant text plus tool_use becomes content and tool_calls", () => {
    const req: ChatRequest = {
      ...BASE_REQ,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "let me check" },
            { type: "tool_use", id: "call_1", name: "read_file", input: { path: "a.ts" } },
          ],
        },
      ],
    };
    const body = buildOpenAICompatRequest("grok-4-1-fast", req);
    expect(body.messages[1]).toEqual({
      role: "assistant",
      content: "let me check",
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "read_file", arguments: '{"path":"a.ts"}' } },
      ],
    });
  });

  it("R2.2: an assistant message with only tool_use has null content and no tool_calls key when there are none", () => {
    const toolOnly: ChatRequest = {
      ...BASE_REQ,
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "call_1", name: "x", input: {} }],
        },
      ],
    };
    expect(buildOpenAICompatRequest("m", toolOnly).messages[1]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_1", type: "function", function: { name: "x", arguments: "{}" } }],
    });

    const textOnly: ChatRequest = {
      ...BASE_REQ,
      messages: [{ role: "assistant", content: [{ type: "text", text: "hi" }] }],
    };
    const msg = buildOpenAICompatRequest("m", textOnly).messages[1];
    expect(msg).toEqual({ role: "assistant", content: "hi" });
    expect(msg && "tool_calls" in msg).toBe(false);
  });

  it("R2.2: tool_result blocks become role:tool messages emitted before the user text message", () => {
    const req: ChatRequest = {
      ...BASE_REQ,
      messages: [
        {
          role: "user",
          content: [
            { type: "tool_result", toolUseId: "call_1", content: "file body", isError: false },
            { type: "text", text: "continue please" },
          ],
        },
      ],
    };
    const body = buildOpenAICompatRequest("m", req);
    // index 0 is the leading system message
    expect(body.messages[1]).toEqual({ role: "tool", tool_call_id: "call_1", content: "file body" });
    expect(body.messages[2]).toEqual({ role: "user", content: "continue please" });
  });

  it("R2.2: an isError tool_result gets an ERROR: content prefix", () => {
    const req: ChatRequest = {
      ...BASE_REQ,
      messages: [
        {
          role: "user",
          content: [{ type: "tool_result", toolUseId: "call_1", content: "boom", isError: true }],
        },
      ],
    };
    const body = buildOpenAICompatRequest("m", req);
    expect(body.messages[1]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "ERROR: boom",
    });
  });

  it("R2.2: multiple tool_results in one user turn are each emitted, all before the user text", () => {
    const req: ChatRequest = {
      ...BASE_REQ,
      messages: [
        {
          role: "user",
          content: [
            { type: "tool_result", toolUseId: "call_1", content: "one", isError: false },
            { type: "tool_result", toolUseId: "call_2", content: "two", isError: false },
            { type: "text", text: "thanks" },
          ],
        },
      ],
    };
    const body = buildOpenAICompatRequest("m", req);
    expect(body.messages.slice(1)).toEqual([
      { role: "tool", tool_call_id: "call_1", content: "one" },
      { role: "tool", tool_call_id: "call_2", content: "two" },
      { role: "user", content: "thanks" },
    ]);
  });

  it("R2.2: multiple text blocks in one message join into a single content string", () => {
    const req: ChatRequest = {
      ...BASE_REQ,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "part one " },
            { type: "text", text: "part two" },
          ],
        },
      ],
    };
    const body = buildOpenAICompatRequest("m", req);
    expect(body.messages[1]).toEqual({ role: "user", content: "part one part two" });
  });

  it("R2.2: maps tools to type:function with name/description/parameters", () => {
    const req: ChatRequest = {
      ...BASE_REQ,
      tools: [
        {
          name: "read_file",
          description: "Reads a file",
          inputSchema: { type: "object", properties: { path: { type: "string" } } },
        },
      ],
    };
    const body = buildOpenAICompatRequest("m", req);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Reads a file",
          parameters: { type: "object", properties: { path: { type: "string" } } },
        },
      },
    ]);
  });

  it("R2.2: omits the tools key entirely when req.tools is empty", () => {
    const body = buildOpenAICompatRequest("m", BASE_REQ);
    expect("tools" in body).toBe(false);
  });

  it("R2.2: ignores req.effort (no portable equivalent)", () => {
    const body = buildOpenAICompatRequest("m", { ...BASE_REQ, effort: "high" }) as unknown as Record<
      string,
      unknown
    >;
    expect("effort" in body).toBe(false);
  });
});

describe("buildOpenAICompatHeaders", () => {
  it("R2.5: includes a Bearer authorization header when an apiKey is given", () => {
    expect(buildOpenAICompatHeaders("sk-test-123")).toEqual({
      "content-type": "application/json",
      authorization: "Bearer sk-test-123",
    });
  });

  it("R2.5: omits the authorization header when no apiKey is given (local servers)", () => {
    const headers = buildOpenAICompatHeaders(undefined);
    expect(headers).toEqual({ "content-type": "application/json" });
    expect("authorization" in headers).toBe(false);
  });
});
