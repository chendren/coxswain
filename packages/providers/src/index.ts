/**
 * @cox/providers — turns configured provider endpoints into streaming
 * ChatModels behind the frozen contracts in @cox/core. See
 * docs/specs/providers/{requirements,design,tasks}.md.
 *
 * Public surface grows incrementally as tasks land; see tasks.md for the
 * checklist. Final surface (task 13) matches design.md exactly.
 */
export { providerError, isRetryable, withRetries } from "./errors.js";
export { createMockModel, type MockTurn } from "./mock.js";
export { createAnthropicAdapter } from "./anthropic.js";
export { createOpenAICompatAdapter } from "./openai-compat.js";
