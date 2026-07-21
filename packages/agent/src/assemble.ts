import type { ChatMessage, ChatRequest, ContentBlock, ToolSpec } from "@cox/core";

const DEFAULT_MAX_TOKENS = 8192;

/**
 * Builds one ChatRequest (R2.1, R2.3). `prevLen` is the length of the
 * messages array as it stood for the *previous* call — `task.history.length`
 * for the very first call, treating history as an implicit "call 0". The
 * cache breakpoint always lands on the last index of that prior span: it was
 * already sent verbatim once, so it's a stable, cacheable prefix; anything
 * appended since is new. Caller is responsible for updating `prevLen` to
 * `messages.length` right after each assemble() call (see runner.ts).
 */
export function assemble(
  system: string,
  messages: ChatMessage[],
  tools: ToolSpec[],
  prevLen: number,
): ChatRequest {
  return {
    system,
    messages,
    tools,
    maxTokens: DEFAULT_MAX_TOKENS,
    cacheBreakpointMessageIndex: prevLen > 0 ? prevLen - 1 : undefined,
  };
}

/**
 * R2.2: one assistant message — one text block with the concatenated
 * deltas (even when empty), then tool_use blocks in stream order.
 */
export function buildAssistantMessage(
  text: string,
  toolUses: { id: string; name: string; input: unknown }[],
): ChatMessage {
  const content: ContentBlock[] = [{ type: "text", text }];
  for (const tu of toolUses) {
    content.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
  }
  return { role: "assistant", content };
}

/**
 * R2.2: exactly one user message holding all tool_result blocks, in the
 * same order as their originating tool_use blocks.
 */
export function buildToolResultMessage(
  results: { toolUseId: string; content: string; isError: boolean }[],
): ChatMessage {
  return {
    role: "user",
    content: results.map((r) => ({
      type: "tool_result" as const,
      toolUseId: r.toolUseId,
      content: r.content,
      isError: r.isError,
    })),
  };
}
