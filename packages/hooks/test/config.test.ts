import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHookConfigLoader } from "../src/config";
import { makeTmpCwd, makeTmpHome, testEnv, writeJsonFile, writeTextFile } from "./helpers";

describe("createHookConfigLoader — hooks.json", () => {
  it("R5.1: user hooks precede project hooks, concatenated user-first", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeJsonFile(join(home, ".cox", "hooks.json"), {
      hooks: [{ event: "SessionStart", command: "echo user" }],
    });
    await writeJsonFile(join(cwd, ".cox", "hooks.json"), {
      hooks: [{ event: "SessionStart", command: "echo project" }],
    });

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.commandHooks().map((h) => h.command)).toEqual(["echo user", "echo project"]);
  });

  it("R5.1: the user hooks path is resolved from injected env.HOME, never the real home directory", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeJsonFile(join(home, ".cox", "hooks.json"), {
      hooks: [{ event: "Stop", command: "echo from-fake-home" }],
    });

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.commandHooks()).toEqual([{ event: "Stop", command: "echo from-fake-home" }]);
  });

  it("R5.2: a missing hooks.json file contributes no hooks and no error", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.commandHooks()).toEqual([]);
    expect(loader.drainWarnings()).toEqual([]);
  });

  it("R5.2: a missing project hooks.json with a present user hooks.json still works", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeJsonFile(join(home, ".cox", "hooks.json"), {
      hooks: [{ event: "Stop", command: "echo user-only" }],
    });

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.commandHooks()).toEqual([{ event: "Stop", command: "echo user-only" }]);
  });

  it("R5.3: malformed JSON skips the whole file and records a load warning naming its path", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeTextFile(join(cwd, ".cox", "hooks.json"), "{ not valid json ");

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.commandHooks()).toEqual([]);
    const warnings = loader.drainWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.source).toBe(join(cwd, ".cox", "hooks.json"));
  });

  it("R5.3: an entry with an unknown event is skipped with a warning; other entries still load", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeJsonFile(join(cwd, ".cox", "hooks.json"), {
      hooks: [
        { event: "NotARealEvent", command: "echo nope" },
        { event: "Stop", command: "echo ok" },
      ],
    });

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.commandHooks()).toEqual([{ event: "Stop", command: "echo ok" }]);
    expect(loader.drainWarnings().length).toBeGreaterThanOrEqual(1);
  });

  it("R5.3: an entry missing a usable command is skipped with a warning", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeJsonFile(join(cwd, ".cox", "hooks.json"), {
      hooks: [{ event: "Stop" }, { event: "Stop", command: "echo ok" }],
    });

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.commandHooks()).toEqual([{ event: "Stop", command: "echo ok" }]);
    expect(loader.drainWarnings().length).toBeGreaterThanOrEqual(1);
  });

  it("R5.3: load warnings drain exactly once and are cleared afterward", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeTextFile(join(cwd, ".cox", "hooks.json"), "not json");

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.drainWarnings()).toHaveLength(1);
    expect(loader.drainWarnings()).toEqual([]);
  });

  it("hooks.json entries preserve optional matcher/timeoutMs fields", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeJsonFile(join(cwd, ".cox", "hooks.json"), {
      hooks: [
        { event: "PreToolUse", matcher: "bash", command: "echo hi", timeoutMs: 5000 },
      ],
    });

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.commandHooks()).toEqual([
      { event: "PreToolUse", matcher: "bash", command: "echo hi", timeoutMs: 5000 },
    ]);
  });

  it("config loading is lazy and cached: on-disk changes after first access are not picked up", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeJsonFile(join(cwd, ".cox", "hooks.json"), {
      hooks: [{ event: "Stop", command: "first" }],
    });
    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });
    expect(loader.commandHooks()).toHaveLength(1);

    await writeJsonFile(join(cwd, ".cox", "hooks.json"), {
      hooks: [
        { event: "Stop", command: "first" },
        { event: "Stop", command: "second" },
      ],
    });

    expect(loader.commandHooks()).toHaveLength(1);
  });
});

describe("createHookConfigLoader — .cox/hooks/*.md agent hooks", () => {
  it("R6.1: name is the file stem, prompt is the trimmed body, tier defaults to scout", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeTextFile(
      join(cwd, ".cox", "hooks", "lint-on-save.md"),
      '---\ntrigger:\n  type: fileSave\n  pattern: "src/**/*.ts"\n---\n\n  Run the linter and fix issues.  \n\n',
    );

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });
    const hooks = loader.agentHookConfigs();

    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toEqual({
      name: "lint-on-save",
      trigger: { type: "fileSave", pattern: "src/**/*.ts" },
      tier: "scout",
      prompt: "Run the linter and fix issues.",
    });
  });

  it("R6.1: tier is read from front matter when explicitly valid", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeTextFile(
      join(cwd, ".cox", "hooks", "big-refactor.md"),
      "---\ntrigger: manual\ntier: architect\n---\nDo a big refactor.\n",
    );

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.agentHookConfigs()[0]?.tier).toBe("architect");
  });

  it("R6.2: fileSave without a pattern is skipped with a recorded warning", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeTextFile(
      join(cwd, ".cox", "hooks", "broken.md"),
      "---\ntrigger:\n  type: fileSave\n---\nDo something.\n",
    );

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.agentHookConfigs()).toEqual([]);
    expect(loader.drainWarnings().length).toBeGreaterThanOrEqual(1);
  });

  it("R6.2: an invalid tier is skipped with a recorded warning", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeTextFile(
      join(cwd, ".cox", "hooks", "bad-tier.md"),
      "---\ntrigger: manual\ntier: overlord\n---\nDo something.\n",
    );

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.agentHookConfigs()).toEqual([]);
    expect(loader.drainWarnings().length).toBeGreaterThanOrEqual(1);
  });

  it("R6.2: an empty body is skipped with a recorded warning", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeTextFile(
      join(cwd, ".cox", "hooks", "empty.md"),
      "---\ntrigger: manual\n---\n   \n\n",
    );

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.agentHookConfigs()).toEqual([]);
    expect(loader.drainWarnings().length).toBeGreaterThanOrEqual(1);
  });

  it("R6.3: trigger: { type: manual } (nested YAML mapping) is parsed with a manual trigger", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeTextFile(
      join(cwd, ".cox", "hooks", "review.md"),
      "---\ntrigger:\n  type: manual\n---\nReview the diff.\n",
    );

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.agentHookConfigs()[0]?.trigger).toEqual({ type: "manual" });
  });

  it("R6.3: trigger: manual (bare-string equivalent YAML) is parsed with a manual trigger", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeTextFile(
      join(cwd, ".cox", "hooks", "review2.md"),
      "---\ntrigger: manual\n---\nReview the diff.\n",
    );

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.agentHookConfigs()[0]?.trigger).toEqual({ type: "manual" });
  });

  it("a file with no usable front matter is skipped with a recorded warning", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    await writeTextFile(join(cwd, ".cox", "hooks", "no-frontmatter.md"), "Just a prompt, no config.\n");

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.agentHookConfigs()).toEqual([]);
    expect(loader.drainWarnings().length).toBeGreaterThanOrEqual(1);
  });

  it("a missing .cox/hooks directory does not throw and yields no agent hooks", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();

    const loader = createHookConfigLoader({ cwd, env: testEnv({ HOME: home }) });

    expect(loader.agentHookConfigs()).toEqual([]);
    expect(loader.drainWarnings()).toEqual([]);
  });
});
