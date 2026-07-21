import type { ChatRequest, ContentBlock, StopReason, StreamEvent } from "@cox/core";
import { EFFORT_MODELS, maxOutputFor } from "./capabilities.js";

// ---------------------------------------------------------------------------
// Request shapes (local — see design.md §Anthropic mapping). Not the real
// SDK's param types: we build these by hand and pass them through
// AnthropicLike.messages.stream, which is typed loosely enough (task 7) that
// this doesn't need to match the SDK's (much larger) MessageStreamParams.
// ---------------------------------------------------------------------------

export interface AnthropicCacheControl {
  type: "ephemeral";
}

export interface AnthropicContentBlockParam {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  cache_control?: AnthropicCacheControl;
}

export interface AnthropicMessageParam {
  role: "user" | "assistant";
  content: AnthropicContentBlockParam[];
}

export interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control: AnthropicCacheControl;
}

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  system: [AnthropicSystemBlock];
  messages: AnthropicMessageParam[];
  tools: { name: string; description: string; input_schema: Record<string, unknown> }[];
  output_config?: { effort: NonNullable<ChatRequest["effort"]> };
}

function toContentBlockParam(block: ContentBlock): AnthropicContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "tool_use":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.toolUseId,
        content: block.content,
        is_error: block.isError,
      };
  }
}

/**
 * R1.2/R1.5/R7.1/R7.2/R7.3 — pure translation of a provider-agnostic
 * ChatRequest into an Anthropic Messages request body. Never sends
 * temperature/top_p/top_k/thinking (R7.3 — v1 uses model defaults).
 */
export function buildAnthropicRequest(modelId: string, req: ChatRequest): AnthropicRequestBody {
  const messages: AnthropicMessageParam[] = req.messages.map((m) => ({
    role: m.role,
    content: m.content.map(toContentBlockParam),
  }));

  const breakpoint = req.cacheBreakpointMessageIndex;
  if (breakpoint !== undefined && breakpoint >= 0) {
    const target = messages[breakpoint];
    if (target) {
      const last = target.content[target.content.length - 1];
      if (last) last.cache_control = { type: "ephemeral" };
    }
  }

  const body: AnthropicRequestBody = {
    model: modelId,
    max_tokens: Math.min(req.maxTokens, maxOutputFor(modelId)),
    system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
    messages,
    tools: req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    })),
  };

  if (req.effort && EFFORT_MODELS.has(modelId)) {
    body.output_config = { effort: req.effort };
  }

  return body;
}

// ---------------------------------------------------------------------------
// Stream translation (task 6). AnthropicStreamEvent is a minimal local
// structural type over the raw SDK event shapes actually read here — see
// design.md's "AnthropicLike is a minimal local structural type" note. Real
// field names (delta.thinking vs delta.text, Usage field names, ...) were
// checked against the installed @anthropic-ai/sdk types.
// ---------------------------------------------------------------------------

export interface AnthropicStreamEvent {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string };
  delta?: {
    type?: string;
    text?: string; // text_delta
    thinking?: string; // thinking_delta
    partial_json?: string; // input_json_delta
    stop_reason?: string | null; // message_delta
  };
  message?: {
    usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
    };
  };
  usage?: {
    output_tokens?: number;
  };
}

function mapAnthropicStopReason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case "end_turn":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "error";
  }
}

interface ToolUseAccumulator {
  id: string;
  name: string;
  json: string;
}

/**
 * R1.3/R1.4 — translates the Anthropic Messages raw SDK event stream into
 * ordered StreamEvents: text_delta/thinking_delta as deltas arrive, one
 * tool_use per completed tool-use block (accumulated input_json_delta
 * fragments, JSON-parsed), then exactly one usage event (all four
 * TokenUsage fields, missing -> 0) and exactly one done event.
 */
export async function* translateAnthropicStream(
  raw: AsyncIterable<AnthropicStreamEvent>,
): AsyncIterable<StreamEvent> {
  const toolUses = new Map<number, ToolUseAccumulator>();
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let outputTokens = 0;
  let stopReason: StopReason = "error";

  for await (const event of raw) {
    switch (event.type) {
      case "message_start": {
        const usage = event.message?.usage;
        inputTokens = usage?.input_tokens ?? 0;
        cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
        cacheWriteTokens = usage?.cache_creation_input_tokens ?? 0;
        break;
      }
      case "content_block_start": {
        if (event.content_block?.type === "tool_use" && event.index !== undefined) {
          toolUses.set(event.index, {
            id: event.content_block.id ?? "",
            name: event.content_block.name ?? "",
            json: "",
          });
        }
        break;
      }
      case "content_block_delta": {
        const delta = event.delta;
        if (!delta) break;
        if (delta.type === "text_delta") {
          if (delta.text) yield { type: "text_delta", text: delta.text };
        } else if (delta.type === "thinking_delta") {
          if (delta.thinking) yield { type: "thinking_delta", text: delta.thinking };
        } else if (delta.type === "input_json_delta" && event.index !== undefined) {
          const acc = toolUses.get(event.index);
          if (acc) acc.json += delta.partial_json ?? "";
        }
        break;
      }
      case "content_block_stop": {
        if (event.index !== undefined) {
          const acc = toolUses.get(event.index);
          if (acc) {
            yield {
              type: "tool_use",
              id: acc.id,
              name: acc.name,
              input: JSON.parse(acc.json || "{}") as unknown,
            };
            toolUses.delete(event.index);
          }
        }
        break;
      }
      case "message_delta": {
        outputTokens = event.usage?.output_tokens ?? 0;
        stopReason = mapAnthropicStopReason(event.delta?.stop_reason);
        break;
      }
      default:
        break; // message_stop, ping, etc. — nothing to translate
    }
  }

  yield {
    type: "usage",
    usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
  };
  yield { type: "done", stopReason };
}
