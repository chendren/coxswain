import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHookEngine } from "../src/engine";
import {
  makeConfig,
  makePayload,
  makeTmpCwd,
  makeTmpHome,
  testEnv,
  writeHooksJson,
  writeJsonFile,
} from "./helpers";

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
