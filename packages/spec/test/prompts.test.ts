import { describe, expect, it } from "vitest";
import type { SpecTask } from "@cox/core";
import { designPrompt, execPrompt, requirementsPrompt, SPEC_SYSTEM, tasksPrompt } from "../src/prompts.js";

/**
 * R5.1 — these templates are the product surface handed to the model.
 * Snapshots pin them so any drift (intentional or not) shows as a diff in
 * review, per design.md's "template drift must be a conscious diff".
 */
describe("prompts", () => {
  it("prompts: SPEC_SYSTEM matches the pinned snapshot", () => {
    expect(SPEC_SYSTEM).toMatchSnapshot();
  });

  it("prompts: requirementsPrompt matches the pinned snapshot", () => {
    expect(requirementsPrompt("safe-divide", "guard divide() against b=0")).toMatchSnapshot();
  });

  it("prompts: designPrompt matches the pinned snapshot", () => {
    const requirementsMd = "# Requirements — safe-divide\n\n...\n";
    expect(designPrompt("safe-divide", "guard divide() against b=0", requirementsMd)).toMatchSnapshot();
  });

  it("prompts: tasksPrompt matches the pinned snapshot", () => {
    const requirementsMd = "# Requirements — safe-divide\n\n...\n";
    const designMd = "# Design — safe-divide\n\n...\n";
    expect(tasksPrompt("safe-divide", requirementsMd, designMd)).toMatchSnapshot();
  });

  it("prompts: execPrompt matches the pinned snapshot", () => {
    const task: SpecTask = {
      id: "1",
      title: "Guard divide() against b=0",
      requirements: ["R1.1"],
      complexity: 2,
      status: "pending",
    };
    const excerpts = '- R1.1: WHEN b is 0, THE SYSTEM SHALL throw a descriptive error.';
    const designMd = "# Design — safe-divide\n\n...\n";
    expect(execPrompt(task, excerpts, designMd)).toMatchSnapshot();
  });
});
