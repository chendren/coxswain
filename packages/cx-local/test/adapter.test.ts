import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalAdapter, type LocalAdapterDeps } from "../src/adapter";
import type { CxSpec } from "@cox/cx-core";

const journeyMap = {
  kind: "journeyMap" as const,
  id: "journeyMap",
  provenance: { specName: "billing-dispute", phase: "design" as const, targetId: "artifacts" as const },
  name: "Dispute resolution",
  stages: [],
};

const spec: CxSpec = {
  state: {
    name: "billing-dispute",
    createdAt: "2026-07-22T00:00:00Z",
    phases: { requirements: "approved", design: "approved", tasks: "approved" },
    tasks: [],
    approvals: [],
  },
  requirements: [],
  design: { journeyMaps: [journeyMap], personas: [] },
};

describe("createLocalAdapter", () => {
  let server: Server;
  let cxRoot: string;
  let deps: LocalAdapterDeps;
  let posted: { path: string; body: unknown }[];

  beforeEach(async () => {
    posted = [];
    server = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/api/journeys/definitions") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ billing_dispute: { label: "Billing Dispute Resolution" } }));
        return;
      }
      if (req.method === "GET" && req.url === "/api/health/ready") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "healthy" }));
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/api/journeys")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ stats: { billing_dispute: { active: 3 } } }));
        return;
      }
      if (req.method === "POST" && req.url === "/api/events/batch") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          posted.push({ path: "/api/events/batch", body: JSON.parse(body) });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ processed: 2, results: [] }));
        });
        return;
      }
      if (req.method === "GET" && req.url === "/api/dashboard/kpis") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ "handle-time": 280 }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as AddressInfo;
    cxRoot = await mkdtemp(join(tmpdir(), "cox-cx-local-adapter-"));
    deps = {
      cxRoot,
      baseUrl: `http://127.0.0.1:${addr.port}`,
      now: () => "2026-07-22T00:00:00Z",
      randomFn: () => 0,
      generate: async (prompt) => {
        if (prompt.includes("Which of these journey types")) {
          return JSON.stringify({ journeyType: "billing_dispute" });
        }
        return JSON.stringify({ metrics: [{ name: "handle-time", target: 300, unit: "seconds" }] });
      },
    };
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("has id 'local' and capabilities including simulate", () => {
    const adapter = createLocalAdapter(deps);
    expect(adapter.id).toBe("local");
    expect(adapter.capabilities()).toEqual(["build", "deploy", "status", "simulate", "teardown"]);
  });

  it("plan() -> build() -> deploy() -> status() binds to billing_dispute and reports healthy", async () => {
    const adapter = createLocalAdapter(deps);
    const plan = await adapter.plan(spec);
    const artifacts = await adapter.build(plan);
    expect(artifacts.map((a) => a.kind).sort()).toEqual(["agentDefinition", "journeyMap", "kpiFrame"]);
    const dep = await adapter.deploy(artifacts);
    expect(dep.resources).toHaveLength(3);
    const health = await adapter.status(dep);
    expect(health.level).toBe("healthy");
  });

  it("simulate() posts synthetic events and reports outcomes against the recovered KPI target", async () => {
    const adapter = createLocalAdapter(deps);
    const plan = await adapter.plan(spec);
    const artifacts = await adapter.build(plan);
    const dep = await adapter.deploy(artifacts);
    const report = await adapter.simulate(dep, {
      name: "peak",
      volumePerMinute: 2,
      personaWeights: { alex: 1 },
      durationMinutes: 1,
    });
    expect(posted).toHaveLength(1);
    expect((posted[0]!.body as { events: unknown[] }).events).toHaveLength(2);
    expect(report.outcomes).toEqual([{ kpiName: "handle-time", achieved: 280, target: 300 }]);
  });

  it("teardown() removes what deploy() created", async () => {
    const adapter = createLocalAdapter(deps);
    const plan = await adapter.plan(spec);
    const artifacts = await adapter.build(plan);
    const dep = await adapter.deploy(artifacts);
    await adapter.teardown(dep);
    await expect(adapter.status(dep)).rejects.toThrow();
  });
});
