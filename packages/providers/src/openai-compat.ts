import type { ChatModel, ChatMessage, ChatRequest, ContentBlock, ProviderAdapter, StopReason, StreamEvent } from "@cox/core";
import { providerError, withRetries } from "./errors.js";
import { estimateTokens } from "./estimate.js";

// ---------------------------------------------------------------------------
// Request shapes (local — see design.md §OpenAI-compat mapping).
// ---------------------------------------------------------------------------

export interface OpenAICompatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAICompatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAICompatToolCall[];
}

export interface OpenAICompatTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface OpenAICompatRequestBody {
  model: string;
  stream: true;
  stream_options: { include_usage: true };
  max_tokens: number;
  messages: OpenAICompatMessage[];
  tools?: OpenAICompatTool[];
}

function textOf(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function toolResultsOf(blocks: ContentBlock[]): Extract<ContentBlock, { type: "tool_result" }>[] {
  return blocks.filter((b): b is Extract<ContentBlock, { type: "tool_result" }> => b.type === "tool_result");
}

function toolUsesOf(blocks: ContentBlock[]): Extract<ContentBlock, { type: "tool_use" }>[] {
  return blocks.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
}

function toOpenAIMessages(message: ChatMessage): OpenAICompatMessage[] {
  if (message.role === "assistant") {
    const text = textOf(message.content);
    const toolUses = toolUsesOf(message.content);
    const out: OpenAICompatMessage = { role: "assistant", content: text.length > 0 ? text : null };
    if (toolUses.length > 0) {
      out.tool_calls = toolUses.map((tu) => ({
        id: tu.id,
        type: "function",
        function: { name: tu.name, arguments: JSON.stringify(tu.input) },
      }));
    }
    return [out];
  }

  // user: each tool_result becomes its own role:"tool" message, emitted
  // BEFORE the user text message (tool results answer the prior assistant
  // turn); isError results get an "ERROR: " content prefix.
  const out: OpenAICompatMessage[] = [];
  for (const tr of toolResultsOf(message.content)) {
    out.push({
      role: "tool",
      tool_call_id: tr.toolUseId,
      content: tr.isError ? `ERROR: ${tr.content}` : tr.content,
    });
  }
  out.push({ role: "user", content: textOf(message.content) });
  return out;
}

/**
 * R2.2 — pure translation of a provider-agnostic ChatRequest into an
 * OpenAI-compatible chat/completions body. `effort` is ignored (no portable
 * equivalent across OpenAI-compatible servers).
 */
export function buildOpenAICompatRequest(modelId: string, req: ChatRequest): OpenAICompatRequestBody {
  const messages: OpenAICompatMessage[] = [{ role: "system", content: req.system }];
  for (const m of req.messages) {
    messages.push(...toOpenAIMessages(m));
  }

  const body: OpenAICompatRequestBody = {
    model: modelId,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: req.maxTokens,
    messages,
  };

  if (req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
  }

  return body;
}

/** R2.5 — Bearer auth header iff an apiKey is present; local servers send none. */
export function buildOpenAICompatHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

// ---------------------------------------------------------------------------
// SSE parsing + stream translation (task 9)
// ---------------------------------------------------------------------------

/**
 * Parses a byte stream of `data: ...` SSE lines into raw JSON payload
 * strings, buffering across chunk boundaries (a single line may be split
 * across two byte chunks). Stops at `data: [DONE]` without yielding it.
 */
export async function* parseSSELines(body: AsyncIterable<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      if (line.startsWith("data: ")) {
        const payload = line.slice("data: ".length);
        if (payload === "[DONE]") return;
        yield payload;
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }
}

interface OpenAIStreamToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAIStreamChunk {
  choices?: {
    delta?: { content?: string | null; tool_calls?: OpenAIStreamToolCallDelta[] };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

function mapOpenAIFinishReason(reason: string): StopReason {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    default:
      return "error";
  }
}

function drainToolCalls(toolCalls: Map<number, ToolCallAccumulator>): StreamEvent[] {
  const ordered = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]);
  const events: StreamEvent[] = ordered.map(([, acc]) => ({
    type: "tool_use",
    id: acc.id,
    name: acc.name,
    input: JSON.parse(acc.arguments || "{}") as unknown,
  }));
  toolCalls.clear();
  return events;
}

/**
 * R2.3/R2.4 — translates raw SSE JSON payload strings (as produced by
 * parseSSELines) into ordered StreamEvents: text_delta per content
 * fragment; tool_calls accumulated by index (first fragment carries id/
 * name, later ones append arguments), flushed as tool_use events as soon as
 * a finish_reason arrives (with a defensive flush after the loop too); one
 * usage event mapped from the usage chunk, or a zeroed one when the
 * provider never sent one (contract: exactly one usage event); then one
 * done event.
 */
export async function* translateOpenAICompatStream(
  lines: AsyncIterable<string>,
): AsyncIterable<StreamEvent> {
  const toolCalls = new Map<number, ToolCallAccumulator>();
  let stopReason: StopReason = "error";
  let usageEmitted = false;

  for await (const payload of lines) {
    let chunk: OpenAIStreamChunk;
    try {
      chunk = JSON.parse(payload) as OpenAIStreamChunk;
    } catch {
      continue; // ignore malformed lines defensively
    }

    if (chunk.usage) {
      yield {
        type: "usage",
        usage: {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      };
      usageEmitted = true;
    }

    const choice = chunk.choices?.[0];
    if (!choice) continue;

    const delta = choice.delta;
    if (delta?.content) {
      yield { type: "text_delta", text: delta.content };
    }
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        let acc = toolCalls.get(idx);
        if (!acc) {
          acc = { id: "", name: "", arguments: "" };
          toolCalls.set(idx, acc);
        }
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name = tc.function.name;
        if (tc.function?.arguments) acc.arguments += tc.function.arguments;
      }
    }
    if (choice.finish_reason) {
      stopReason = mapOpenAIFinishReason(choice.finish_reason);
      for (const ev of drainToolCalls(toolCalls)) yield ev;
    }
  }

  for (const ev of drainToolCalls(toolCalls)) yield ev; // safety net

  if (!usageEmitted) {
    yield {
      type: "usage",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  }
  yield { type: "done", stopReason };
}

// ---------------------------------------------------------------------------
// Adapter factory (task 10)
// ---------------------------------------------------------------------------

export interface OpenAICompatEntry {
  /** Adapter id used in ModelRef.provider, e.g. "xai", "ollama". */
  id: string;
  baseUrl: string;
  /** Env var holding the API key; omit for local servers that need none. */
  apiKeyEnv?: string;
  models: string[];
}

/** Reads a Response body as an async iterable of byte chunks (R2.3's byte-stream input). */
async function* readBody(body: NonNullable<Response["body"]>): AsyncIterable<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value as Uint8Array;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Classification at the call site (R3): 429/5xx/network -> retryable; other 4xx -> not; aborts -> not. */
function classifyFetchError(err: unknown, signal: AbortSignal | undefined): Error {
  if (err instanceof Error && typeof (err as { retryable?: unknown }).retryable === "boolean") {
    return err; // already classified upstream
  }
  if (signal?.aborted) {
    return providerError(`request aborted`, false);
  }
  const message = err instanceof Error ? err.message : String(err);
  return providerError(message, true); // network-level failure (fetch TypeError, etc.)
}

async function* streamOnce(
  fetchImpl: typeof fetch,
  entry: OpenAICompatEntry,
  headers: Record<string, string>,
  body: OpenAICompatRequestBody,
  signal: AbortSignal | undefined,
): AsyncIterable<StreamEvent> {
  let response: Response;
  try {
    response = await fetchImpl(`${entry.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    throw classifyFetchError(err, signal);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const retryable = response.status === 429 || response.status >= 500;
    throw providerError(
      `${entry.id}: ${response.status} ${text || response.statusText}`,
      retryable,
    );
  }
  if (!response.body) {
    throw providerError(`${entry.id}: empty response body`, false);
  }

  try {
    yield* translateOpenAICompatStream(parseSSELines(readBody(response.body)));
  } catch (err) {
    throw classifyFetchError(err, signal);
  }
}

/**
 * R2.1/R2.5 — an OpenAI-compatible ProviderAdapter (xAI, OpenAI, Ollama, LM
 * Studio, ...). Reads process.env[apiKeyEnv] lazily inside stream(); sends no
 * Authorization header when apiKeyEnv is omitted (local servers).
 */
export function createOpenAICompatAdapter(
  entry: OpenAICompatEntry,
  deps: { fetchImpl?: typeof fetch } = {},
): ProviderAdapter {
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    id: entry.id,
    models(): string[] {
      return [...entry.models];
    },
    create(modelId: string): ChatModel {
      return {
        ref: { provider: entry.id, model: modelId },
        estimateTokens,
        stream(req: ChatRequest, signal?: AbortSignal): AsyncIterable<StreamEvent> {
          let apiKey: string | undefined;
          if (entry.apiKeyEnv) {
            apiKey = process.env[entry.apiKeyEnv];
            if (!apiKey) {
              throw providerError(
                `${entry.id}: environment variable ${entry.apiKeyEnv} is not set`,
                false,
              );
            }
          }
          const body = buildOpenAICompatRequest(modelId, req);
          const headers = buildOpenAICompatHeaders(apiKey);
          return withRetries<StreamEvent>(() => streamOnce(fetchImpl, entry, headers, body, signal));
        },
      };
    },
  };
}
