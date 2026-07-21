import { computeCostUsd, pricingFor } from "@cox/core";
import type { ChatModel, ModelRef, RoutingInput, TaskKind } from "@cox/core";

/** R5.2 kind-based defaults, used when no classification est_output_tokens is available. */
const KIND_DEFAULT_OUTPUT_TOKENS: Record<TaskKind, number> = {
  chat: 1500,
  oneshot: 500,
  "spec-requirements": 6000,
  "spec-design": 6000,
  "spec-tasks": 2500,
  "spec-task-exec": 2500,
  hook: 800,
  classify: 128,
};

export interface Estimate {
  inputTokens: number;
  estOutputTokens: number;
  estCostUsd: number | null;
}

/**
 * Pre-call estimate (R5.1-R5.3). `estimateTokensModel` is always the
 * classify model's estimateTokens — "chars/4 heuristic from the classify
 * model is acceptable" (R5.1), regardless of which tier actually resolved.
 */
export function buildEstimate(
  input: RoutingInput,
  model: ModelRef,
  estimateTokensModel: ChatModel,
  estOutputTokensFromClassification?: number,
): Estimate {
  const inputTokens = input.contextTokens + estimateTokensModel.estimateTokens(input.text);
  const estOutputTokens =
    estOutputTokensFromClassification ?? KIND_DEFAULT_OUTPUT_TOKENS[input.kind];

  const pricing = pricingFor(model.provider, model.model);
  const estCostUsd = pricing
    ? computeCostUsd(
        { inputTokens, outputTokens: estOutputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
        pricing,
      )
    : null;

  return { inputTokens, estOutputTokens, estCostUsd };
}
