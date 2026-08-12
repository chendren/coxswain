import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startConsoleServer } from "../src/server";
import { renderShell } from "../src/shell";
import { renderQueuePage } from "../src/pages/queue";
import type { WorkQueue } from "@cox/cx-ops";
import { renderFleetPage } from "../src/pages/fleet";
import type { OpsBoard } from "@cox/cx-ops";

/** External absolute asset references (CDN / remote). Relative and # ok. */
function externalAssetHits(html: string): string[] {
  const hits: string[] = [];
  const re = /\b(?:src|href)=["'](https?:\/\/[^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1]!;
    // allow only nothing external for offline cathedral
    hits.push(url);
  }
  return hits;
}

describe("proof.cdn offline cathedral", () => {
  it("shell and queue HTML have no external src/href hosts", () => {
    const shell = renderShell({
      title: "Proof",
      active: "fleet",
      pack: "default",
      controlPath: ["load_strong", "emit"],
      bodyHtml: "<p>ok</p>",
    });
    expect(externalAssetHits(shell)).toEqual([]);

    const queue: WorkQueue = {
      proposals: [],
      tasks: [],
      totals: { proposals: 0, tasks: 0, specsWithWork: 0 },
      path: ["build_queue", "emit"],
      pathDisplay: "build_queue → emit",
    };
    expect(externalAssetHits(renderQueuePage(queue, "default"))).toEqual([]);

    const board: OpsBoard = {
      rows: [],
      totals: {
        specs: 0,
        proposalsOpen: 0,
        tasksOpen: 0,
        daemonsRunning: 0,
        deployedSpecs: 0,
      },
      path: ["build_board", "emit"],
    };
    expect(externalAssetHits(renderFleetPage(board, "default"))).toEqual([]);
  });
});

describe("proof.path control audit", () => {
  it("every shell render includes path-audit control footer", () => {
    const html = renderShell({
      title: "Path",
      active: "health",
      pack: "local",
      controlPath: ["serve", "route_retrieval", "emit"],
      bodyHtml: "<div/>",
    });
    expect(html).toContain('class="path-audit"');
    expect(html).toMatch(/control:\s*serve/);
  });
});

describe("proof.serve smoke", () => {
  let close: (() => Promise<void>) | undefined;
  let cwd = "";

  afterAll(async () => {
    if (close) await close();
    if (cwd) await rm(cwd, { recursive: true, force: true });
  });

  it("GET /api/health and /console/fleet return 200", async () => {
    cwd = await mkdtemp(join(tmpdir(), "cx-console-proof-"));
    const s = await startConsoleServer({
      port: 0,
      cwd,
      host: "127.0.0.1",
      write: () => undefined,
    });
    close = s.close;
    const port = s.port;

    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(health.status).toBe(200);
    const hj = (await health.json()) as { ok: boolean };
    expect(hj.ok).toBe(true);

    const fleet = await fetch(`http://127.0.0.1:${port}/console/fleet?pack=default`);
    expect(fleet.status).toBe(200);
    const html = await fleet.text();
    expect(html).toContain("CX Graph Console");
    expect(html).toContain('class="path-audit"');
    expect(externalAssetHits(html)).toEqual([]);
  });
});
