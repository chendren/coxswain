import type { ChatRequest, StreamEvent } from "@cox/core";
import { afterEach, describe, expect, it } from "vitest";
import { createOpenAICompatAdapter } from "../src/openai-compat.js";

const REQ: ChatRequest = { system: "s", messages: [], tools: [], maxTokens: 100 };
const TEST_KEY_VAR = "COX_TEST_OPENAI_COMPAT_KEY_R2";

async function collect(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

function sseBody(...payloads: string[]): AsyncIterable<Uint8Array> {
  const encoder = new TextEncoder();
  return (async function* () {
    for (const p of payloads) yield encoder.encode(`data: ${p}\n\n`);
    yield encoder.encode("data: [DONE]\n\n");
  })();
}

function okResponse(...payloads: string[]): Response {
  return new Response(sseBody(...payloads), { status: 200 });
}

afterEach(() => {
  delete process.env[TEST_KEY_VAR];
});

describe("createOpenAICompatAdapter", () => {
  it("R2.1: id and models() come from the entry", () => {
    const adapter = createOpenAICompatAdapter({
      id: "xai",
      baseUrl: "https://api.x.ai/v1",
      models: ["grok-4-1-fast", "grok-4-3"],
    });
    expect(adapter.id).toBe("xai");
    expect(adapter.models()).toEqual(["grok-4-1-fast", "grok-4-3"]);
  });

  it("R2.1: POSTs to {baseUrl}/chat/completions with the built body, and translates a full SSE response", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return okResponse(
        JSON.stringify({ choices: [{ delta: { content: "hi" } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
        JSON.stringify({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 1 } }),
      );
    };
    const adapter = createOpenAICompatAdapter(
      { id: "local", baseUrl: "http://localhost:1234/v1", models: ["m"] },
      { fetchImpl },
    );

    const events = await collect(adapter.create("m").stream(REQ));

    expect(capturedUrl).toBe("http://localhost:1234/v1/chat/completions");
    expect(capturedInit?.method).toBe("POST");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect("authorization" in headers).toBe(false);
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toMatchObject({ model: "m", stream: true, max_tokens: 100 });

    expect(events).toEqual([
      { type: "text_delta", text: "hi" },
      { type: "usage", usage: { inputTokens: 2, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  it("R2.5: sends a Bearer authorization header when apiKeyEnv resolves to a value", async () => {
    process.env[TEST_KEY_VAR] = "sk-test-key";
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedInit = init;
      return okResponse(JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }));
    };
    const adapter = createOpenAICompatAdapter(
      { id: "openai", baseUrl: "https://api.openai.com/v1", apiKeyEnv: TEST_KEY_VAR, models: ["m"] },
      { fetchImpl },
    );

    await collect(adapter.create("m").stream(REQ));

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test-key");
  });

  it("R2.5: a missing apiKeyEnv value throws a non-retryable Error naming the variable", () => {
    delete process.env[TEST_KEY_VAR];
    const adapter = createOpenAICompatAdapter(
      { id: "openai", baseUrl: "https://api.openai.com/v1", apiKeyEnv: TEST_KEY_VAR, models: ["m"] },
      {
        fetchImpl: (() => {
          throw new Error("fetch must not be called when the key is missing");
        }) as unknown as typeof fetch,
      },
    );
    const model = adapter.create("m");

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

  it("R2.1: an entry with no apiKeyEnv sends no authorization header (local servers)", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedInit = init;
      return okResponse(JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }));
    };
    const adapter = createOpenAICompatAdapter(
      { id: "ollama", baseUrl: "http://localhost:11434/v1", models: ["llama3"] },
      { fetchImpl },
    );
    await collect(adapter.create("llama3").stream(REQ));
    const headers = capturedInit?.headers as Record<string, string>;
    expect("authorization" in headers).toBe(false);
  });

  it("R3: a 401 response throws immediately without retry", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls++;
      return new Response("invalid api key", { status: 401, statusText: "Unauthorized" });
    };
    const adapter = createOpenAICompatAdapter(
      { id: "openai", baseUrl: "https://api.openai.com/v1", models: ["m"] },
      { fetchImpl },
    );

    await expect(collect(adapter.create("m").stream(REQ))).rejects.toMatchObject({ retryable: false });
    expect(calls).toBe(1);
  });

  it("R3: a 429 response is retried once and then succeeds", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls++;
      if (calls === 1) {
        return new Response("rate limited", { status: 429, statusText: "Too Many Requests" });
      }
      return okResponse(JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }));
    };
    const adapter = createOpenAICompatAdapter(
      { id: "openai", baseUrl: "https://api.openai.com/v1", models: ["m"] },
      { fetchImpl },
    );

    const events = await collect(adapter.create("m").stream(REQ));

    expect(calls).toBe(2);
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end_turn" });
  });

  it("forwards the AbortSignal to fetch", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedInit = init;
      return okResponse(JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }));
    };
    const adapter = createOpenAICompatAdapter(
      { id: "openai", baseUrl: "https://api.openai.com/v1", models: ["m"] },
      { fetchImpl },
    );
    const controller = new AbortController();

    await collect(adapter.create("m").stream(REQ, controller.signal));

    expect(capturedInit?.signal).toBe(controller.signal);
  });
});
