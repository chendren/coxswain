import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEventLines, runReplay } from "../src/commands/replay";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const fixturePath = join(repoRoot, "fixtures", "events-sample.jsonl");

/**
 * runReplay mounts the real Ink TUI against real process.stdout (design.md's
 * public startTui API has no stream-injection seam for tests to use
 * instead) — silence the actual terminal writes during the call so test
 * output stays readable; assertions are against the returned fold, not the
 * rendered frames.
 */
async function silentlyOnStdout<T>(fn: () => Promise<T>): Promise<T> {
  const realWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await fn();
  } finally {
    process.stdout.write = realWrite;
  }
}

describe("R5.1-R5.3: cox replay", () => {
  it("R5.1/R5.2: streams fixtures/events-sample.jsonl through the real App with a read-only stub controller", async () => {
    const result = await silentlyOnStdout(() =>
      runReplay(fixturePath, { cwd: repoRoot, intervalMs: 0, graceMs: 5 }),
    );
    expect(result.eventsPlayed).toBe(13);
    expect(result.skipped).toBe(0);
  });

  it("R5.3: the snapshot fold accumulates usage/cost from model_call_finished events", async () => {
    const result = await silentlyOnStdout(() =>
      runReplay(fixturePath, { cwd: repoRoot, intervalMs: 0, graceMs: 5 }),
    );
    const snapshot = result.fold.get();
    // fixtures/events-sample.jsonl has exactly one model_call_finished:
    // usage {inputTokens:11834, outputTokens:2110, cacheReadTokens:9200, cacheWriteTokens:2634}, costUsd 0.0721
    expect(snapshot.usage).toEqual({
      inputTokens: 11834,
      outputTokens: 2110,
      cacheReadTokens: 9200,
      cacheWriteTokens: 2634,
    });
    expect(snapshot.costUsd).toBeCloseTo(0.0721, 10);
    expect(snapshot.currentTier).toBe("builder");
    expect(snapshot.currentModel).toEqual({ provider: "anthropic", model: "claude-sonnet-5" });
  });

  it("R5.1: accepts a cwd-relative path", async () => {
    const result = await silentlyOnStdout(() =>
      runReplay(join("fixtures", "events-sample.jsonl"), { cwd: repoRoot, intervalMs: 0, graceMs: 5 }),
    );
    expect(result.eventsPlayed).toBe(13);
  });

  it("propagates a read error for a missing file (mapped to exit 1 by main.ts's generic error handling)", async () => {
    await expect(
      runReplay(join(repoRoot, "fixtures", "does-not-exist.jsonl"), { cwd: repoRoot, intervalMs: 0, graceMs: 0 }),
    ).rejects.toThrow();
  });
});

describe("R5.1: parseEventLines — unknown/invalid lines warn+skip", () => {
  it("skips a line with an unrecognized event type and warns, keeping known events", () => {
    const warnings: string[] = [];
    const raw = [
      JSON.stringify({ type: "session_started", sessionId: "s1", cwd: "/tmp" }),
      JSON.stringify({ type: "not_a_real_event", foo: "bar" }),
      JSON.stringify({ type: "turn_done", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0 }),
    ].join("\n");
    const { events, skipped } = parseEventLines(raw, (m) => warnings.push(m));
    expect(events.map((e) => e.type)).toEqual(["session_started", "turn_done"]);
    expect(skipped).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/not_a_real_event/);
  });

  it("skips an invalid JSON line and warns", () => {
    const warnings: string[] = [];
    const raw = ["not json at all", JSON.stringify({ type: "error", message: "boom" })].join("\n");
    const { events, skipped } = parseEventLines(raw, (m) => warnings.push(m));
    expect(events.map((e) => e.type)).toEqual(["error"]);
    expect(skipped).toBe(1);
    expect(warnings[0]).toMatch(/invalid JSON/);
  });

  it("ignores blank lines without warning or counting them as skipped", () => {
    const warnings: string[] = [];
    const raw = ["", JSON.stringify({ type: "error", message: "boom" }), "", ""].join("\n");
    const { events, skipped } = parseEventLines(raw, (m) => warnings.push(m));
    expect(events).toHaveLength(1);
    expect(skipped).toBe(0);
    expect(warnings).toHaveLength(0);
  });
});
