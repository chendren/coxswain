import { describe, expect, it } from "vitest";
import { EFFORT_MODELS, maxOutputFor } from "../src/capabilities.js";

describe("capabilities", () => {
  it("R7.1: maxOutputFor clamps claude-haiku-4-5 to 64000", () => {
    expect(maxOutputFor("claude-haiku-4-5")).toBe(64000);
  });

  it("R7.1: maxOutputFor defaults every other model to 128000", () => {
    expect(maxOutputFor("claude-sonnet-5")).toBe(128000);
    expect(maxOutputFor("claude-opus-4-8")).toBe(128000);
    expect(maxOutputFor("claude-fable-5")).toBe(128000);
    expect(maxOutputFor("some-future-model")).toBe(128000);
  });

  it("R7.2: EFFORT_MODELS contains exactly sonnet-5, opus-4-8, fable-5", () => {
    expect(EFFORT_MODELS.has("claude-sonnet-5")).toBe(true);
    expect(EFFORT_MODELS.has("claude-opus-4-8")).toBe(true);
    expect(EFFORT_MODELS.has("claude-fable-5")).toBe(true);
    expect(EFFORT_MODELS.has("claude-haiku-4-5")).toBe(false);
    expect(EFFORT_MODELS.size).toBe(3);
  });
});
