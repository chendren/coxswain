/**
 * Offline CXOS surface e2e: init, run, board, catalog, brief, cab-export,
 * status/health-history, snapshot, archive/restore. Temp cwd; no cloud LLM keys.
 */
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  runCxArchive,
  runCxBoard,
  runCxBrief,
  runCxCabExport,
  runCxCatalog,
  runCxDashboard,
  runCxGraphFind,
  runCxHealthHistory,
  runCxInit,
  runCxQueue,
  runCxRestore,
  runCxRun,
  runCxSnapshot,
  runCxStatus,
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

  it("init → run → board → catalog → brief → cab-export → health-history → snapshot → archive/restore", async () => {
    const { write, out } = lines();
    const c = ctx(write);
    const name = "surface-demo";

    // init: seed workspace + starter spec when empty
    expect(await runCxInit(c)).toBe(0);
    expect(out.join("\n")).toMatch(/CXOS workspace ready/);
    expect(out.join("\n")).toMatch(/seeded sample spec "starter"/);

    // run: create/approve/build path for a named program
    out.length = 0;
    expect(await runCxRun(c, name, ["surface test idea"], "all")).toBe(0);
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

    // brief: executive markdown (stdout + optional file)
    out.length = 0;
    expect(await runCxBrief(c, name)).toBe(0);
    const briefStdout = out.join("\n");
    expect(briefStdout).toMatch(/CXOS Executive Brief|Executive Brief|# /);
    expect(briefStdout).toMatch(/surface-demo|surface test idea|plan-only/);
    expect(briefStdout).toMatch(/path: load_workspace → render_brief → emit/);

    out.length = 0;
    const briefFile = "surface-brief.md";
    expect(await runCxBrief(c, name, briefFile)).toBe(0);
    expect(out.join("\n")).toMatch(/wrote brief/);
    const briefPath = join(cwd, briefFile);
    await access(briefPath);
    const briefMd = await readFile(briefPath, "utf8");
    expect(briefMd).toMatch(/surface-demo|surface test idea/);
    expect(briefMd.length).toBeGreaterThan(40);

    // cab-export: filesystem change package (no AWS mutate)
    out.length = 0;
    const cabDir = "cx-cab-out";
    expect(await runCxCabExport(c, name, cabDir)).toBe(0);
    const cabOut = out.join("\n");
    expect(cabOut).toMatch(/CAB package for "surface-demo"/);
    expect(cabOut).toMatch(/files: /);
    expect(cabOut).toMatch(/MANIFEST\.md|BRIEF\.md|proposals\.json/);
    await access(join(cwd, cabDir, "BRIEF.md"));
    await access(join(cwd, cabDir, "MANIFEST.md"));
    const cabBrief = await readFile(join(cwd, cabDir, "BRIEF.md"), "utf8");
    expect(cabBrief).toMatch(/surface-demo/);

    // status writes health-history; health-history lists samples
    out.length = 0;
    expect(await runCxStatus(c, name)).toBe(0);
    expect(out.join("\n")).toMatch(/summary score:/);

    out.length = 0;
    expect(await runCxHealthHistory(c, name)).toBe(0);
    const histOut = out.join("\n");
    expect(histOut).toMatch(/health history surface-demo/);
    expect(histOut).toMatch(/score=\d+/);
    expect(histOut).toMatch(/path: load_health_history → emit/);

    // snapshot: full program package
    out.length = 0;
    const snapDir = "cx-snap-out";
    expect(await runCxSnapshot(c, name, snapDir)).toBe(0);
    const snapOut = out.join("\n");
    expect(snapOut).toMatch(/snapshot "surface-demo"/);
    expect(snapOut).toMatch(/files: /);
    expect(snapOut).toMatch(/SNAPSHOT\.md|spec\.json|BRIEF\.md/);
    await access(join(cwd, snapDir, "SNAPSHOT.md"));
    await access(join(cwd, snapDir, "spec.json"));
    const snapMd = await readFile(join(cwd, snapDir, "SNAPSHOT.md"), "utf8");
    expect(snapMd.length).toBeGreaterThan(20);

    // archive / restore (soft rename; hide from board then bring back)
    out.length = 0;
    expect(await runCxArchive(c, name)).toBe(0);
    expect(out.join("\n")).toMatch(/archived surface-demo/);
    expect(out.join("\n")).toMatch(/next: cox cx restore surface-demo/);

    out.length = 0;
    expect(await runCxBoard(c)).toBe(0);
    expect(out.join("\n")).not.toMatch(/\bsurface-demo\b/);

    out.length = 0;
    expect(await runCxRestore(c, name)).toBe(0);
    expect(out.join("\n")).toMatch(/restored surface-demo/);

    out.length = 0;
    expect(await runCxBoard(c)).toBe(0);
    expect(out.join("\n")).toMatch(/\bsurface-demo\b/);
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

  it("health-history empty before status; brief missing spec fails", async () => {
    const { write, out } = lines();
    const c = ctx(write);
    expect(await runCxInit(c)).toBe(0);

    out.length = 0;
    expect(await runCxHealthHistory(c, "starter")).toBe(0);
    expect(out.join("\n")).toMatch(/no health history for starter/);

    out.length = 0;
    expect(await runCxBrief(c, "no-such-program")).toBe(1);
    expect(out.join("\n")).toMatch(/not found/);
  });
});
