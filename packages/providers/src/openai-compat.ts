import type { ChatMessage, ChatRequest, ContentBlock } from "@cox/core";

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
