import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deployArtifacts, statusFromDisk, teardownFromDisk, type DiskDeps } from "../src/disk";
import type { CxArtifact } from "@cox/cx-core";

const artifacts: CxArtifact[] = [
  {
    kind: "kpiFrame",
    id: "kpiFrame",
    provenance: { specName: "billing-dispute", phase: "design", targetId: "artifacts" },
    metrics: [{ name: "handle-time", target: 300, unit: "seconds" }],
  },
];

describe("disk", () => {
  let cxRoot: string;
  let deps: DiskDeps;

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-cx-artifacts-"));
    deps = { cxRoot, now: () => "2026-07-22T00:00:00Z" };
  });

  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("deploy() writes one JSON file per artifact and returns matching resources", async () => {
    const dep = await deployArtifacts(deps, "artifacts", "billing-dispute", artifacts);
    expect(dep.resources).toEqual([{ id: "kpiFrame", kind: "artifact-file", createdAt: "2026-07-22T00:00:00Z" }]);
    const written = await readFile(join(cxRoot, "billing-dispute", "artifacts", "kpiFrame.json"), "utf8");
    expect(JSON.parse(written)).toEqual(artifacts[0]);
  });

  it("status() reports healthy when every deployed file is present", async () => {
    const dep = await deployArtifacts(deps, "artifacts", "billing-dispute", artifacts);
    const health = await statusFromDisk(deps, dep);
    expect(health.level).toBe("healthy");
    expect(health.metrics).toEqual([
      { name: "artifactCount", value: 1, unit: "count" },
      { name: "missingCount", value: 0, unit: "count" },
    ]);
  });

  it("status() reports down when a deployed file is deleted", async () => {
    const dep = await deployArtifacts(deps, "artifacts", "billing-dispute", artifacts);
    await rm(join(cxRoot, "billing-dispute", "artifacts", "kpiFrame.json"));
    const health = await statusFromDisk(deps, dep);
    expect(health.level).toBe("down");
  });

  it("teardown() removes the spec's artifacts directory", async () => {
    const dep = await deployArtifacts(deps, "artifacts", "billing-dispute", artifacts);
    await teardownFromDisk(deps, dep);
    await expect(readFile(join(cxRoot, "billing-dispute", "artifacts", "kpiFrame.json"), "utf8")).rejects.toThrow();
  });
});
