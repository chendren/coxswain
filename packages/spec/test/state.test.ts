import * as fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  createInitialState,
  readRuns,
  readSpecState,
  runsJsonPath,
  specDir,
  specJsonPath,
  writeRuns,
  writeSpecState,
} from "../src/state.js";
import { tmpProject } from "./helpers.js";

describe("state persistence", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  async function project() {
    const p = await tmpProject();
    cleanups.push(p.cleanup);
    return p;
  }

  it("R1.1: writeSpecState/readSpecState round-trips a SpecState", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    const state = createInitialState("widget", "2026-01-01T00:00:00.000Z");

    await writeSpecState(dir, state);
    const loaded = await readSpecState(dir);

    expect(loaded).toEqual(state);
  });

  it("R1.1: writeSpecState leaves no .tmp file behind (temp-then-rename)", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    await writeSpecState(dir, createInitialState("widget", "2026-01-01T00:00:00.000Z"));

    await expect(fs.access(`${specJsonPath(dir)}.tmp`)).rejects.toThrow();
    await expect(fs.access(specJsonPath(dir))).resolves.toBeUndefined();
  });

  it("R8.3: readSpecState throws naming the file path when spec.json is corrupt", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(specJsonPath(dir), "{ not json", "utf8");

    await expect(readSpecState(dir)).rejects.toThrow(specJsonPath(dir));
  });

  it("R8.3: a corrupt spec.json is never overwritten by a failed read", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(specJsonPath(dir), "{ not json", "utf8");

    await expect(readSpecState(dir)).rejects.toThrow();

    const stillRaw = await fs.readFile(specJsonPath(dir), "utf8");
    expect(stillRaw).toBe("{ not json");
  });

  it("R8.3: readSpecState throws naming the path when spec.json is missing", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "ghost");

    await expect(readSpecState(dir)).rejects.toThrow(specJsonPath(dir));
  });

  it("runs.json: readRuns returns {} when the file does not exist", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");

    expect(await readRuns(dir)).toEqual({});
  });

  it("runs.json: write/read round-trips consecutive-failure counters", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    const runs = { "2.1": { consecutiveFailures: 1, lastStopReason: "max_tokens", lastRunAt: "2026-01-01T00:00:00.000Z" } };

    await writeRuns(dir, runs);

    expect(await readRuns(dir)).toEqual(runs);
    await expect(fs.access(`${runsJsonPath(dir)}.tmp`)).rejects.toThrow();
  });

  it("runs.json: a corrupt file resets to {} (disposable telemetry, not spec state)", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(runsJsonPath(dir), "not json at all", "utf8");

    expect(await readRuns(dir)).toEqual({});
  });
});
