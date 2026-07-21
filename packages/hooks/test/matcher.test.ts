import { describe, expect, it } from "vitest";
import { createHookEngine } from "../src/engine";
import { makeConfig, makePayload, makeTmpCwd, testEnv, writeHooksJson } from "./helpers";

describe("hook matcher selection", () => {
  it.each([
    {
      label: "exact matcher matches the tool name on PreToolUse",
      event: "PreToolUse" as const,
      matcher: "^bash$",
      toolName: "bash",
      expectSelected: true,
    },
    {
      label: "matcher regex that doesn't match the tool name excludes the hook",
      event: "PreToolUse" as const,
      matcher: "^bash$",
      toolName: "edit",
      expectSelected: false,
    },
    {
      label: "alternation matcher matches one of several tool names on PostToolUse",
      event: "PostToolUse" as const,
      matcher: "^(bash|edit)$",
      toolName: "edit",
      expectSelected: true,
    },
    {
      label: '"*" matches any tool name',
      event: "PreToolUse" as const,
      matcher: "*",
      toolName: "anything-at-all",
      expectSelected: true,
    },
    {
      label: "an absent matcher matches any tool name",
      event: "PreToolUse" as const,
      matcher: undefined,
      toolName: "anything-at-all",
      expectSelected: true,
    },
  ])("R7.1/R7.2: $label", async ({ event, matcher, toolName, expectSelected }) => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event, matcher, command: "probe-command" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload(event, cwd, { toolName }));

    expect(outcomes.some((o) => o.hook === "probe-command")).toBe(expectSelected);
  });

  it("R7.1: only hooks whose configured event equals payload.event are selected", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [
      { event: "PreToolUse", command: "pre-hook" },
      { event: "PostToolUse", command: "post-hook" },
    ]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("PreToolUse", cwd, { toolName: "bash" }));

    expect(outcomes.map((o) => o.hook)).toEqual(["pre-hook"]);
  });

  it("R7.3: matcher is ignored entirely on non-tool events, even a garbage pattern still fires the hook", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "Stop", matcher: "[unterminated", command: "stop-hook" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("Stop", cwd));

    expect(outcomes).toEqual([{ hook: "stop-hook", action: "continue" }]);
  });

  it("R7.3: matcher is ignored on UserPromptSubmit", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "UserPromptSubmit", matcher: "^bash$", command: "prompt-hook" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("UserPromptSubmit", cwd, { text: "hello" }));

    expect(outcomes.map((o) => o.hook)).toEqual(["prompt-hook"]);
  });

  it("R7.4: an invalid matcher regex skips the hook and records a continue outcome naming the pattern", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "PreToolUse", matcher: "[unterminated", command: "broken-hook" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("PreToolUse", cwd, { toolName: "bash" }));

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.action).toBe("continue");
    expect(outcomes[0]?.stderr).toContain("[unterminated");
  });

  it("R7.4: an invalid matcher does not prevent other valid hooks on the same event from running", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [
      { event: "PreToolUse", matcher: "[unterminated", command: "broken-hook" },
      { event: "PreToolUse", matcher: "^bash$", command: "good-hook" },
    ]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("PreToolUse", cwd, { toolName: "bash" }));

    expect(outcomes.map((o) => o.hook)).toEqual(["broken-hook", "good-hook"]);
    expect(outcomes[0]?.action).toBe("continue");
    expect(outcomes[1]?.action).toBe("continue");
  });
});
