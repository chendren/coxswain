import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Records every spawn() call (args) while still delegating to the real
// implementation, so R9.4 can assert exactly what reaches child_process
// without faking process execution.
const { spawnCalls } = vi.hoisted(() => ({ spawnCalls: [] as unknown[][] }));
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => {
      spawnCalls.push(args);
      return actual.spawn(...args);
    },
  };
});

import { createHookEngine } from "../src/engine";
import {
  makeConfig,
  makePayload,
  makeTmpCwd,
  makeTmpHome,
  testEnv,
  writeHooksJson,
  writeJsonFile,
  writeTextFile,
} from "./helpers";

beforeEach(() => {
  spawnCalls.length = 0;
});

describe("hook command execution — exit code semantics", () => {
  it("R8.1: spawns $SHELL -c <command> with cwd = payload.cwd and the payload JSON written to stdin", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "Stop", command: "cat" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });
    const payload = makePayload("Stop", cwd, { some: "data", n: 1 });

    const outcomes = await engine.fire(payload);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.action).toBe("continue");
    // `cat` echoes stdin back to stdout, which then round-trips through the
    // exit-0 stdout-JSON parse — proving stdin received exactly the payload.
    expect(outcomes[0]?.output).toEqual(payload);
  });

  it("R8.1: the hook's cwd is payload.cwd, not the process cwd", async () => {
    const cwd = await makeTmpCwd();
    // A relative-path `touch` only lands in the right place if the child's
    // cwd was actually set to payload.cwd.
    await writeHooksJson(cwd, [{ event: "Stop", command: "touch cwd-marker.txt" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("Stop", cwd));

    expect(outcomes).toEqual([{ hook: "touch cwd-marker.txt", action: "continue" }]);
    expect(existsSync(join(cwd, "cwd-marker.txt"))).toBe(true);
  });

  it("R8.2: exit 0 with no stdout produces a bare continue outcome (no output field)", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "Stop", command: "exit 0" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("Stop", cwd));

    expect(outcomes).toEqual([{ hook: "exit 0", action: "continue" }]);
  });

  it("R8.2: exit 0 with a JSON object on stdout attaches it as output, non-Tier tierOverride stripped, other keys survive", async () => {
    const cwd = await makeTmpCwd();
    const stdoutJson = JSON.stringify({ tierOverride: "not-a-real-tier", note: "kept-me" });
    await writeHooksJson(cwd, [{ event: "Stop", command: `printf '%s' '${stdoutJson}'` }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("Stop", cwd));

    expect(outcomes[0]?.action).toBe("continue");
    expect(outcomes[0]?.output).toEqual({ note: "kept-me" });
  });

  it("R8.2: a valid tierOverride ('builder') survives on the output", async () => {
    const cwd = await makeTmpCwd();
    const stdoutJson = JSON.stringify({ tierOverride: "builder" });
    await writeHooksJson(cwd, [{ event: "PreModelCall", command: `printf '%s' '${stdoutJson}'` }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("PreModelCall", cwd));

    expect(outcomes[0]?.output).toEqual({ tierOverride: "builder" });
  });

  it("R8.2: exit 0 with non-JSON stdout produces no output field", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "Stop", command: "printf 'not json at all'" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("Stop", cwd));

    expect(outcomes).toEqual([{ hook: "printf 'not json at all'", action: "continue" }]);
  });

  it("R8.3: exit 2 produces a block outcome with captured stderr", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "PreToolUse", command: ">&2 printf 'nope, blocked'; exit 2" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("PreToolUse", cwd, { toolName: "bash" }));

    expect(outcomes).toEqual([
      {
        hook: ">&2 printf 'nope, blocked'; exit 2",
        action: "block",
        stderr: "nope, blocked",
      },
    ]);
  });

  it("R8.4: exit 3 (or any other non-0/non-2 code) produces continue with the captured stderr", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "Stop", command: ">&2 printf 'just a warning'; exit 3" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("Stop", cwd));

    expect(outcomes).toEqual([
      { hook: ">&2 printf 'just a warning'; exit 3", action: "continue", stderr: "just a warning" },
    ]);
  });

  it("R8.5: hooks run sequentially in configuration order (user file order, then project)", async () => {
    const cwd = await makeTmpCwd();
    const home = await makeTmpHome();
    // The user hook sleeps, so if hooks ran concurrently the project hook's
    // outcome would land first; sequential execution guarantees outcome
    // order still matches configuration order regardless of timing.
    await writeJsonFile(join(home, ".cox", "hooks.json"), {
      hooks: [{ event: "Stop", command: "sleep 0.05; printf 'first'" }],
    });
    await writeJsonFile(join(cwd, ".cox", "hooks.json"), {
      hooks: [{ event: "Stop", command: "printf 'second'" }],
    });
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv({ HOME: home }) });

    const outcomes = await engine.fire(makePayload("Stop", cwd));

    expect(outcomes.map((o) => o.hook)).toEqual(["sleep 0.05; printf 'first'", "printf 'second'"]);
  });
});

describe("hook command execution — safety limits", () => {
  it("R9.1: a hook exceeding timeoutMs is SIGKILLed and produces continue with a timeout message, quickly", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "Stop", command: "sleep 5", timeoutMs: 200 }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const start = Date.now();
    const outcomes = await engine.fire(makePayload("Stop", cwd));
    const elapsedMs = Date.now() - start;

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.action).toBe("continue");
    expect(outcomes[0]?.stderr).toContain("timed out");
    expect(elapsedMs).toBeLessThan(1000);
  }, 2000);

  it("R9.1: a timeout is never a block, even for a hook on a blocking-capable event", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "PreToolUse", command: "sleep 5", timeoutMs: 150 }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("PreToolUse", cwd, { toolName: "bash" }));

    expect(outcomes[0]?.action).toBe("continue");
  }, 2000);

  it("R9.2: a nonexistent shell path produces continue with the spawn error in stderr", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "Stop", command: "true" }]);
    const engine = createHookEngine({
      cwd,
      config: makeConfig(),
      env: testEnv({ SHELL: "/definitely/not/a/real/shell/binary" }),
    });

    const outcomes = await engine.fire(makePayload("Stop", cwd));

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.action).toBe("continue");
    expect(outcomes[0]?.stderr).toBeTruthy();
  });

  it("R9.3: capturing several MiB of stdout stays capped (doesn't hang or block on backpressure)", async () => {
    const cwd = await makeTmpCwd();
    // HookOutcome only ever surfaces stdout via the parsed `output` field
    // (exit 0 + valid JSON), so raw stdout length isn't directly observable
    // through the public contract — the exact-length assertion below (same
    // shared capping logic) covers stderr instead. This proves the cap
    // keeps a much-larger-than-1-MiB producer from stalling the pipeline.
    await writeHooksJson(cwd, [{ event: "Stop", command: "yes x | head -c 5000000" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const start = Date.now();
    const outcomes = await engine.fire(makePayload("Stop", cwd));
    const elapsedMs = Date.now() - start;

    expect(outcomes[0]?.action).toBe("continue");
    expect(elapsedMs).toBeLessThan(3000);
  }, 5000);

  it("R9.3: stderr captured beyond 1 MiB is truncated with a marker, capped at 1 MiB + marker length", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [
      { event: "Stop", command: "yes x | head -c 2000000 >&2; exit 3" },
    ]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("Stop", cwd));

    const stderr = outcomes[0]?.stderr ?? "";
    const MAX = 1024 * 1024;
    expect(stderr.endsWith("…[truncated]")).toBe(true);
    expect(stderr.length).toBe(MAX + "…[truncated]".length);
  });

  it("R9.4: the command string reaches spawn as a single verbatim argv element — never built from payload data", async () => {
    const cwd = await makeTmpCwd();
    const command = "printf 'fixed command, unaffected by payload'";
    await writeHooksJson(cwd, [{ event: "PreToolUse", command }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    await engine.fire(
      makePayload("PreToolUse", cwd, { toolName: "bash", dangerous: "$(touch pwned.txt)`touch pwned2.txt`; rm -rf /" }),
    );

    expect(spawnCalls).toHaveLength(1);
    const [, argv] = spawnCalls[0]! as [string, string[], unknown];
    expect(argv).toEqual(["-c", command]);
  });

  it("R9.4: payload data that looks like shell syntax reaches the hook only as inert stdin data", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "PreToolUse", command: "cat" }]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });
    const dangerous = "$(touch injected.txt); rm -rf / #";

    const outcomes = await engine.fire(
      makePayload("PreToolUse", cwd, { toolName: "bash", note: dangerous }),
    );

    expect(existsSync(join(cwd, "injected.txt"))).toBe(false);
    const output = outcomes[0]?.output as { data?: { note?: string } } | undefined;
    expect(output?.data?.note).toBe(dangerous);
  });
});

describe("fire() aggregation (R10)", () => {
  it("R10.1: hooks.enabled:false returns [] and spawns nothing", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [{ event: "Stop", command: "true" }]);
    const engine = createHookEngine({
      cwd,
      config: makeConfig({ hooks: { enabled: false } }),
      env: testEnv(),
    });

    const outcomes = await engine.fire(makePayload("Stop", cwd));

    expect(outcomes).toEqual([]);
    expect(spawnCalls).toHaveLength(0);
  });

  it("R10.2: all matching hooks run — and their outcomes are returned — even after an earlier one blocks", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [
      { event: "PreToolUse", command: "exit 2" },
      { event: "PreToolUse", command: "printf 'still ran'" },
    ]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("PreToolUse", cwd, { toolName: "bash" }));

    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]?.action).toBe("block");
    expect(outcomes[1]?.hook).toBe("printf 'still ran'");
    expect(outcomes[1]?.action).toBe("continue");
  });

  it("R10.3: outcome order is execution order, so multiple PreModelCall tierOverride outputs have a well-defined 'last one'", async () => {
    const cwd = await makeTmpCwd();
    await writeHooksJson(cwd, [
      { event: "PreModelCall", command: `printf '%s' '${JSON.stringify({ tierOverride: "scout" })}'` },
      {
        event: "PreModelCall",
        command: `printf '%s' '${JSON.stringify({ tierOverride: "architect" })}'`,
      },
    ]);
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const outcomes = await engine.fire(makePayload("PreModelCall", cwd));

    expect(outcomes.map((o) => o.output?.tierOverride)).toEqual(["scout", "architect"]);
    const lastOverride = outcomes.reduce<string | undefined>(
      (acc, o) => (o.output?.tierOverride ? String(o.output.tierOverride) : acc),
      undefined,
    );
    expect(lastOverride).toBe("architect");
  });

  it("R10.4: load warnings ride along on the first fire() only, then clear", async () => {
    const cwd = await makeTmpCwd();
    await writeTextFile(join(cwd, ".cox", "hooks.json"), "not valid json");
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const first = await engine.fire(makePayload("Stop", cwd));
    const second = await engine.fire(makePayload("Stop", cwd));

    expect(
      first.some((o) => o.action === "continue" && o.stderr?.includes("malformed JSON")),
    ).toBe(true);
    expect(second).toEqual([]);
  });

  it("R10.4: load warnings are keyed to their source file path as the outcome's `hook`", async () => {
    const cwd = await makeTmpCwd();
    const hooksJsonPath = join(cwd, ".cox", "hooks.json");
    await writeTextFile(hooksJsonPath, "{ broken");
    const engine = createHookEngine({ cwd, config: makeConfig(), env: testEnv() });

    const [outcome] = await engine.fire(makePayload("SessionStart", cwd));

    expect(outcome?.hook).toBe(hooksJsonPath);
    expect(outcome?.action).toBe("continue");
  });
});
