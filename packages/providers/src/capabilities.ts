/**
 * R7 — Anthropic model capability guards, checked in the adapter rather than
 * discovered as API 400s. Model ids per design.md: claude-haiku-4-5,
 * claude-sonnet-5, claude-opus-4-8, claude-fable-5.
 */

/** Models whose Messages API accepts `output_config: {effort}` (R7.2). */
export const EFFORT_MODELS: ReadonlySet<string> = new Set([
  "claude-sonnet-5",
  "claude-opus-4-8",
  "claude-fable-5",
]);

/** Per-model `max_tokens` ceiling; haiku-4-5 has a lower cap (R7.1). */
export function maxOutputFor(modelId: string): number {
  return modelId === "claude-haiku-4-5" ? 64000 : 128000;
}
