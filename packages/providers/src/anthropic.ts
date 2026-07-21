import type { ChatRequest, ContentBlock } from "@cox/core";
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
