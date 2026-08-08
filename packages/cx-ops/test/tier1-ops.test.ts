import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyProposal,
  appendAuditEvent,
  appendDeployHistory,
  createCxSpec,
  exportBoardSync,
  importBoardSync,
  loadAuditEvents,
  loadDeployHistory,
  loadProposals,
  loadCxTasks,
  notifyWebhook,
  resolveCxRoot,
  seedOperateDrill,
  transitionTask,
} from "../src/index";

describe("tier1 ops: identity, seed, notify, sync, env, deploy history", () => {
  let cxRoot: string;
  const now = () => "2026-08-08T12:00:00Z";

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-t1-"));
  });
  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("resolveCxRoot multi-env", () => {
    expect(resolveCxRoot("/w")).toContain(".cox/cx");
    expect(resolveCxRoot("/w", "stage")).toContain("cx-stage");
  });

  it("seedOperateDrill adds open proposals", async () => {
    await createCxSpec({ cxRoot, now }, "t", "telco drill");
    const r = await seedOperateDrill({ cxRoot, now }, "t");
    expect(r.added.length).toBe(3);
    const again = await seedOperateDrill({ cxRoot, now }, "t");
    expect(again.added.length).toBe(0);
    expect(again.skipped).toBe(3);
  });

  it("apply and task done record actor + evidence", async () => {
    await createCxSpec({ cxRoot, now }, "t", "x");
    await seedOperateDrill({ cxRoot, now }, "t");
    const props = await loadProposals({ cxRoot, now }, "t");
    const r = await applyProposal({ cxRoot, now }, "t", props[0]!, {
      actor: "ops@example.com",
    });
    expect(r.task.assignedTo).toBe("ops@example.com");
    const claimed = (await loadProposals({ cxRoot, now }, "t")).find((p) => p.id === props[0]!.id);
    expect(claimed?.status).toBe("claimed");
    expect(claimed?.claimedBy).toBe("ops@example.com");

    const done = await transitionTask({ cxRoot, now }, "t", r.task.id, "done", {
      actor: "ops@example.com",
      evidence: "checked billing queue; AHT normal",
    });
    expect(done?.closedBy).toBe("ops@example.com");
    expect(done?.evidence?.[0]?.note).toMatch(/billing queue/);
  });

  it("audit stores actor", async () => {
    await createCxSpec({ cxRoot, now }, "t", "x");
    await appendAuditEvent(
      { cxRoot, now },
      { kind: "test", specName: "t", message: "hi", actor: "a@b" },
    );
    const ev = await loadAuditEvents({ cxRoot, now }, "t");
    expect(ev[0]!.actor).toBe("a@b");
  });

  it("notifyWebhook no-ops without URL", async () => {
    const prev = process.env.CX_WEBHOOK_URL;
    delete process.env.CX_WEBHOOK_URL;
    const r = await notifyWebhook({ event: "x", message: "m" });
    expect(r.sent).toBe(false);
    if (prev !== undefined) process.env.CX_WEBHOOK_URL = prev;
  });

  it("notifyWebhook posts when URL set", async () => {
    let body = "";
    const r = await notifyWebhook(
      { event: "proposal.opened", message: "m", specName: "t" },
      {
        url: "https://example.invalid/hook",
        fetchImpl: async (_u, init) => {
          body = String(init?.body ?? "");
          return { status: 204 } as Response;
        },
      },
    );
    expect(r.sent).toBe(true);
    expect(r.status).toBe(204);
    expect(body).toContain("proposal.opened");
  });

  it("board sync export/import", async () => {
    await createCxSpec({ cxRoot, now }, "a", "a");
    await seedOperateDrill({ cxRoot, now }, "a");
    const outBase = await mkdtemp(join(tmpdir(), "sync-"));
    const file = join(outBase, "sync.json");
    await exportBoardSync({ cxRoot, now }, file, outBase);
    const raw = await readFile(file, "utf8");
    expect(raw).toContain("proposals");

    const cxRoot2 = await mkdtemp(join(tmpdir(), "cox-t1b-"));
    await createCxSpec({ cxRoot: cxRoot2, now }, "a", "a");
    const imp = await importBoardSync({ cxRoot: cxRoot2, now }, file, outBase);
    expect(imp.specs).toBe(1);
    expect((await loadProposals({ cxRoot: cxRoot2, now }, "a")).length).toBeGreaterThan(0);
    await rm(outBase, { recursive: true, force: true });
    await rm(cxRoot2, { recursive: true, force: true });
  });

  it("deploy history append/load", async () => {
    await createCxSpec({ cxRoot, now }, "t", "x");
    await appendDeployHistory(
      { cxRoot, now },
      "t",
      { targets: ["artifacts"], ok: true, actor: "ci" },
    );
    const h = await loadDeployHistory({ cxRoot, now }, "t");
    expect(h).toHaveLength(1);
    expect(h[0]!.actor).toBe("ci");
  });
});
