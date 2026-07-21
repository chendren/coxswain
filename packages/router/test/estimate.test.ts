import { describe, expect, it } from "vitest";
import { computeCostUsd, pricingFor, type RoutingInput, type TaskKind } from "@cox/core";
import { buildEstimate } from "../src/estimate";
import { createMockModel } from "./helpers/mockModel";

const base: RoutingInput = {
  kind: "chat",
  text: "add a test", // 10 chars -> ceil(10/4) = 3 (mock model's chars/4 heuristic)
  contextTokens: 1000,
  sessionId: "s1",
};

const HAIKU = { provider: "anthropic", model: "claude-haiku-4-5" };
const UNKNOWN_MODEL = { provider: "unknown-provider", model: "mystery-model" };

describe("estimates (R5)", () => {
  it("R5.1: inputTokens = contextTokens + estimateTokens(text) from the classify model", () => {
    const model = createMockModel();
    const estimate = buildEstimate(base, HAIKU, model);
    expect(estimate.inputTokens).toBe(1000 + model.estimateTokens(base.text));
  });

  it("R5.1: uses the classify model's estimateTokens regardless of the resolved tier's model", () => {
    // The heuristic is explicitly "from the classify model" — the resolved
    // model ref only affects pricing, not tokenization.
    const model = createMockModel({ ref: { provider: "anthropic", model: "claude-haiku-4-5" } });
    const architectRef = { provider: "anthropic", model: "claude-opus-4-8" };
    const estimate = buildEstimate(base, architectRef, model);
    expect(estimate.inputTokens).toBe(1000 + model.estimateTokens(base.text));
  });

  const KIND_DEFAULTS: [TaskKind, number][] = [
    ["chat", 1500],
    ["oneshot", 500],
    ["spec-requirements", 6000],
    ["spec-design", 6000],
    ["spec-tasks", 2500],
    ["spec-task-exec", 2500],
    ["hook", 800],
    ["classify", 128],
  ];

  it.each(KIND_DEFAULTS)("R5.2: kind '%s' defaults estOutputTokens to %i", (kind, expected) => {
    const model = createMockModel();
    const estimate = buildEstimate({ ...base, kind }, HAIKU, model);
    expect(estimate.estOutputTokens).toBe(expected);
  });

  it("R5.2: classification est_output_tokens overrides the kind default when provided", () => {
    const model = createMockModel();
    const estimate = buildEstimate(base, HAIKU, model, 777);
    expect(estimate.estOutputTokens).toBe(777);
  });

  it("R5.3: estCostUsd computed via pricingFor + computeCostUsd with zero cache fields", () => {
    const model = createMockModel();
    const estimate = buildEstimate(base, HAIKU, model);
    const pricing = pricingFor(HAIKU.provider, HAIKU.model)!;
    const expectedCost = computeCostUsd(
      {
        inputTokens: estimate.inputTokens,
        outputTokens: estimate.estOutputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      pricing,
    );
    expect(estimate.estCostUsd).toBeCloseTo(expectedCost, 8);
  });

  it("R5.3: estCostUsd is null when pricing is unknown for the resolved model", () => {
    const model = createMockModel();
    const estimate = buildEstimate(base, UNKNOWN_MODEL, model);
    expect(estimate.estCostUsd).toBeNull();
  });
});
