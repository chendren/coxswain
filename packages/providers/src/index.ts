/**
 * @cox/providers — turns configured provider endpoints into streaming
 * ChatModels behind the frozen contracts in @cox/core. See
 * docs/specs/providers/{requirements,design,tasks}.md and NOTES.md.
 *
 * This is the package's full public surface (design.md §Factory
 * signatures). Everything else (buildAnthropicRequest,
 * translateAnthropicStream, parseSSELines, buildOpenAICompatRequest,
 * translateOpenAICompatStream, the AnthropicLike/AnthropicStreamEvent
 * types, ...) is internal — tests reach into those modules directly.
 */
export { createAnthropicAdapter } from "./anthropic.js";
export { createOpenAICompatAdapter } from "./openai-compat.js";
export { createProviderRegistry } from "./registry.js";
export { createFailoverChatModel } from "./failover.js";
export { createMockModel, type MockTurn } from "./mock.js";
export { providerError, isRetryable, withRetries } from "./errors.js";
