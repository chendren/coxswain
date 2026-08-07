/**
 * Offline CXOS surface coverage: init, run, board, catalog, graph-find,
 * dashboard write, queue. Temp cwd; no cloud LLM keys.
 */
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  runCxBoard,
  runCxCatalog,
  runCxDashboard,
  runCxGraphFind,
  runCxInit,
  runCxQueue,
  runCxRun,
  type CxCommandContext,
} from "../src/commands/cx";

function clearCloudKeys(): void {
  process.env.OPENAI_API_KEY = "";
  process.env.XAI_API_KEY = "";
  process.env.ANTHROPIC_API_KEY = "";
  delete process.env.CX_AUTO_LIVE;
}

describe("CXOS offline surface", () => {
  let cwd: string;

  beforeAll(() => {
    clearCloudKeys();
  });

  beforeEach(async () => {
    clearCloudKeys();
    cwd = await mkdtemp(join(tmpdir(), "cox-cx-surface-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  function lines(): { write: (line: string) => void; out: string[] } {
    const out: string[] = [];
    return {
      out,
      write: (line: string) => {
        out.push(line);
      },
    };
  }

  function ctx(write: (line: string) => void): CxCommandContext {
    return {
      cwd,
      write,
      mode: "offline",
      pack: "local",
    };
  }

  it("init → run → board → catalog → graph-find → dashboard → queue", async () => {
    const { write, out } = lines();
    const c = ctx(write);

    // init: seed workspace + starter spec when empty
    expect(await runCxInit(c)).toBe(0);
    expect(out.join("\n")).toMatch(/CXOS workspace ready/);
    expect(out.join("\n")).toMatch(/seeded sample spec "starter"/);

    // run: create/approve/build path for a named program
    out.length = 0;
    expect(await runCxRun(c, "surface-demo", ["surface test idea"], "all")).toBe(0);
    const runOut = out.join("\n");
    expect(runOut).toMatch(/creating CX spec|already exists/);
    expect(runOut).toMatch(/build artifacts: ok/);
    expect(runOut).toMatch(/ok=true/);

    // board: multi-spec ops board lists specs
    out.length = 0;
    expect(await runCxBoard(c)).toBe(0);
    const boardOut = out.join("\n");
    expect(boardOut).toMatch(/CXOS board/);
    expect(boardOut).toMatch(/starter|surface-demo/);

    // catalog: closed ontology inventory
    out.length = 0;
    expect(await runCxCatalog(c, "all", "local")).toBe(0);
    const catOut = out.join("\n");
    expect(catOut).toMatch(/CXOS catalog/);
    expect(catOut).toMatch(/domain /);
    expect(catOut).toMatch(/kpis/);
    expect(catOut).toMatch(/nbaRules|channels/);

    // graph-find: strong-graph node lookup
    out.length = 0;
    expect(await runCxGraphFind(c, "billing", "local")).toBe(0);
    const gfOut = out.join("\n");
    expect(gfOut).toMatch(/CXOS graph-find/);
    expect(gfOut).toMatch(/query="billing"/);
    expect(gfOut).toMatch(/hits=\d+/);

    // dashboard: write self-contained HTML
    out.length = 0;
    const dashFile = "cxos-dashboard.html";
    expect(await runCxDashboard(c, dashFile)).toBe(0);
    expect(out.join("\n")).toMatch(/wrote CXOS dashboard/);
    const dashPath = join(cwd, dashFile);
    await access(dashPath);
    const html = await readFile(dashPath, "utf8");
    expect(html).toMatch(/<!DOCTYPE html>|<html/i);
    expect(html.length).toBeGreaterThan(100);

    // queue: cross-spec work queue (may be empty after build-only path)
    out.length = 0;
    expect(await runCxQueue(c)).toBe(0);
    expect(out.join("\n")).toMatch(/CXOS queue/);
  });

  it("init is idempotent when specs already exist", async () => {
    const { write, out } = lines();
    const c = ctx(write);
    expect(await runCxInit(c)).toBe(0);
    out.length = 0;
    expect(await runCxInit(c)).toBe(0);
    const joined = out.join("\n");
    expect(joined).toMatch(/existing specs: starter/);
    expect(joined).not.toMatch(/seeded sample spec/);
  });

  it("catalog sections and graph-find miss path", async () => {
    const { write, out } = lines();
    const c = ctx(write);

    expect(await runCxCatalog(c, "kpis", "local")).toBe(0);
    expect(out.join("\n")).toMatch(/kpis \(/);

    out.length = 0;
    expect(await runCxGraphFind(c, "zzz-no-such-node-xyz", "local")).toBe(0);
    expect(out.join("\n")).toMatch(/hits=0/);
    expect(out.join("\n")).toMatch(/no matches/);
  });

  it("dashboard default filename and queue empty message", async () => {
    const { write, out } = lines();
    const c = ctx(write);

    expect(await runCxInit(c)).toBe(0);

    out.length = 0;
    expect(await runCxDashboard(c)).toBe(0);
    expect(out.join("\n")).toMatch(/cxos-dashboard\.html/);
    await access(join(cwd, "cxos-dashboard.html"));

    out.length = 0;
    expect(await runCxQueue(c)).toBe(0);
    expect(out.join("\n")).toMatch(/CXOS queue/);
    // Fresh init has no open proposals/tasks from operate/console
    expect(out.join("\n")).toMatch(/queue empty|proposals=0/);
  });

  it("board --json emits only OpsBoard JSON", async () => {
    const { write, out } = lines();
    const c = ctx(write);
    expect(await runCxInit(c)).toBe(0);

    out.length = 0;
    expect(await runCxBoard(c, { json: true })).toBe(0);
    expect(out).toHaveLength(1);
    const board = JSON.parse(out[0]!) as {
      rows: unknown[];
      totals: { specs: number };
      path: string[];
    };
    expect(board.totals.specs).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(board.rows)).toBe(true);
    expect(board.path).toEqual(["list_specs", "load_each", "rollup", "emit"]);
    expect(out[0]).not.toMatch(/CXOS board/);
  });
});
