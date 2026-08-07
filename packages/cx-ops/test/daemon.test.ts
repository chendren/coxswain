import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  daemonPaths,
  readDaemonMeta,
  recordDaemonLastTick,
  writeDaemonMeta,
  type DaemonMeta,
} from "../src/daemon";

describe("daemon meta last tick", () => {
  let cxRoot: string;

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-daemon-"));
  });
  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("recordDaemonLastTick updates lastTick and lastTickAt", async () => {
    const meta: DaemonMeta = {
      specName: "demo",
      pid: 1,
      startedAt: "2026-08-06T00:00:00.000Z",
      intervalMs: 1000,
      maxTicks: 10,
      targets: ["local"],
      path: ["daemon_start"],
    };
    await writeDaemonMeta(cxRoot, "demo", meta);

    await recordDaemonLastTick(cxRoot, "demo", 3, "2026-08-06T00:01:00.000Z");

    const next = await readDaemonMeta(cxRoot, "demo");
    expect(next).not.toBeNull();
    expect(next!.lastTick).toBe(3);
    expect(next!.lastTickAt).toBe("2026-08-06T00:01:00.000Z");
    expect(next!.pid).toBe(1);
  });

  it("recordDaemonLastTick no-ops when meta is absent", async () => {
    await recordDaemonLastTick(cxRoot, "missing", 1, "2026-08-06T00:00:00.000Z");
    const paths = daemonPaths(cxRoot, "missing");
    await expect(readDaemonMeta(cxRoot, "missing")).resolves.toBeNull();
    await writeFile(paths.pidFile, "1", "utf8").catch(() => undefined);
    // still null without daemon.json
    await expect(readDaemonMeta(cxRoot, "missing")).resolves.toBeNull();
  });
});
