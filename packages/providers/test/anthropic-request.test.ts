import type { ChatRequest } from "@cox/core";
import { describe, expect, it } from "vitest";
import { buildAnthropicRequest } from "../src/anthropic.js";

const BASE_REQ: ChatRequest = {
  system: "You are cox.",
  messages: [],
  tools: [],
  maxTokens: 4096,
};

describe("buildAnthropicRequest", () => {
  it("R1.2: wraps system in a text block with cache_control on it", () => {
    const body = buildAnthropicRequest("claude-sonnet-5", BASE_REQ);
    expect(body.system).toEqual([
      { type: "text", text: "You are cox.", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("R1.2: maps text/tool_use/tool_result content blocks", () => {
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
        {
          role: "user",
          content: [
            { type: "tool_result", toolUseId: "call_1", content: "file body", isError: false },
          ],
        },
      ],
    };

    const body = buildAnthropicRequest("claude-sonnet-5", req);

    expect(body.messages).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "let me check" },
          { type: "tool_use", id: "call_1", name: "read_file", input: { path: "a.ts" } },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: "file body",
            is_error: false,
          },
        ],
      },
    ]);
  });

  it("R1.2: maps tools to name/description/input_schema", () => {
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

    const body = buildAnthropicRequest("claude-sonnet-5", req);

    expect(body.tools).toEqual([
      {
        name: "read_file",
        description: "Reads a file",
        input_schema: { type: "object", properties: { path: { type: "string" } } },
      },
    ]);
  });

  it("R1.2: sends an empty tools array when req.tools is empty", () => {
    const body = buildAnthropicRequest("claude-sonnet-5", BASE_REQ);
    expect(body.tools).toEqual([]);
  });

  it("R1.5: without cacheBreakpointMessageIndex, only the system block gets cache_control", () => {
    const req: ChatRequest = {
      ...BASE_REQ,
      messages: [
        { role: "user", content: [{ type: "text", text: "hi" }] },
        { role: "assistant", content: [{ type: "text", text: "hello" }] },
      ],
    };

    const body = buildAnthropicRequest("claude-sonnet-5", req);

    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    for (const m of body.messages) {
      for (const c of m.content) {
        expect(c.cache_control).toBeUndefined();
      }
    }
  });

  it("R1.5: with cacheBreakpointMessageIndex set, also marks the last content block of that message", () => {
    const req: ChatRequest = {
      ...BASE_REQ,
      messages: [
        { role: "user", content: [{ type: "text", text: "turn 0" }] },
        {
          role: "assistant",
          content: [
            { type: "text", text: "turn 1a" },
            { type: "text", text: "turn 1b" },
          ],
        },
        { role: "user", content: [{ type: "text", text: "turn 2" }] },
      ],
      cacheBreakpointMessageIndex: 1,
    };

    const body = buildAnthropicRequest("claude-sonnet-5", req);

    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    // message 0: untouched
    expect(body.messages[0]?.content[0]?.cache_control).toBeUndefined();
    // message 1: only the LAST content block gets it
    expect(body.messages[1]?.content[0]?.cache_control).toBeUndefined();
    expect(body.messages[1]?.content[1]?.cache_control).toEqual({ type: "ephemeral" });
    // message 2: untouched
    expect(body.messages[2]?.content[0]?.cache_control).toBeUndefined();
  });

  it("R1.5: an out-of-range cacheBreakpointMessageIndex is a no-op beyond the system block", () => {
    const req: ChatRequest = {
      ...BASE_REQ,
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      cacheBreakpointMessageIndex: 5,
    };
    expect(() => buildAnthropicRequest("claude-sonnet-5", req)).not.toThrow();
    const body = buildAnthropicRequest("claude-sonnet-5", req);
    expect(body.messages[0]?.content[0]?.cache_control).toBeUndefined();
  });

  it("R7.1: clamps claude-haiku-4-5 max_tokens to 64000 and never sends output_config", () => {
    const req: ChatRequest = { ...BASE_REQ, maxTokens: 999_999, effort: "high" };
    const body = buildAnthropicRequest("claude-haiku-4-5", req);
    expect(body.max_tokens).toBe(64000);
    expect(body.output_config).toBeUndefined();
  });

  it("R7.1: clamps other models' max_tokens to 128000, otherwise passes the requested value through", () => {
    const clamped = buildAnthropicRequest("claude-opus-4-8", { ...BASE_REQ, maxTokens: 999_999 });
    expect(clamped.max_tokens).toBe(128000);

    const unclamped = buildAnthropicRequest("claude-opus-4-8", { ...BASE_REQ, maxTokens: 500 });
    expect(unclamped.max_tokens).toBe(500);
  });

  it("R7.2: sends output_config.effort for effort-capable models when effort is set", () => {
    for (const model of ["claude-sonnet-5", "claude-opus-4-8", "claude-fable-5"]) {
      const body = buildAnthropicRequest(model, { ...BASE_REQ, effort: "xhigh" });
      expect(body.output_config).toEqual({ effort: "xhigh" });
    }
  });

  it("R7.2: omits output_config when effort is unset, even for capable models", () => {
    const body = buildAnthropicRequest("claude-sonnet-5", BASE_REQ);
    expect(body.output_config).toBeUndefined();
  });

  it("R7.2: omits output_config for models outside EFFORT_MODELS even when effort is set", () => {
    const body = buildAnthropicRequest("claude-haiku-4-5", { ...BASE_REQ, effort: "low" });
    expect(body.output_config).toBeUndefined();
  });

  it("R7.3: never sends temperature, top_p, top_k, or thinking", () => {
    const body = buildAnthropicRequest("claude-sonnet-5", {
      ...BASE_REQ,
      effort: "max",
    }) as unknown as Record<string, unknown>;
    expect("temperature" in body).toBe(false);
    expect("top_p" in body).toBe(false);
    expect("top_k" in body).toBe(false);
    expect("thinking" in body).toBe(false);
  });
});
