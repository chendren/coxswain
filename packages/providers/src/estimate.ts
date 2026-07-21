/**
 * R8.1: cheap client-side token estimate — no network, documented heuristic.
 * Used by every ChatModel's `estimateTokens` (anthropic, openai-compat, mock).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
