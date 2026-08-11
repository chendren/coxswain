import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startConsoleServer } from "../src/server";

describe("startConsoleServer", () => {
  let close: (() => Promise<void>) | undefined;
  let port = 0;
  let cwd = "";

  afterAll(async () => {
    if (close) await close();
    if (cwd) await rm(cwd, { recursive: true, force: true });
  });

  it("serves console and api health", async () => {
    cwd = await mkdtemp(join(tmpdir(), "cx-console-"));
    const logs: string[] = [];
    const s = await startConsoleServer({
      port: 0,
      cwd,
      write: (m) => logs.push(m),
    });
    close = s.close;
    port = s.port;
    expect(port).toBeGreaterThan(0);

    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(health.status).toBe(200);
    const hj = (await health.json()) as { ok: boolean };
    expect(hj.ok).toBe(true);

    const page = await fetch(`http://127.0.0.1:${port}/console/graph?pack=default`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("CX Graph Console");
    expect(html).toContain("Graph explorer");
    expect(html).not.toMatch(/cdn\./i);
    expect(logs.some((l) => l.includes("Graph Console"))).toBe(true);
  });
});
