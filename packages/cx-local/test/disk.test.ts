import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readArtifacts, removeArtifacts, writeArtifacts, type DiskDeps } from "../src/disk";
import type { CxArtifact } from "@cox/cx-core";

const artifacts: CxArtifact[] = [
  {
    kind: "agentDefinition",
    id: "agentDefinition",
    provenance: { specName: "billing-dispute", phase: "design", targetId: "local" },
    name: "billing_dispute agent",
    systemPrompt: "You handle the billing_dispute journey.",
    tools: [],
  },
  {
    kind: "kpiFrame",
    id: "kpiFrame",
    provenance: { specName: "billing-dispute", phase: "design", targetId: "local" },
    metrics: [{ name: "handle-time", target: 300, unit: "seconds" }],
  },
];

describe("disk", () => {
  let cxRoot: string;
  let deps: DiskDeps;

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-cx-local-"));
    deps = { cxRoot, now: () => "2026-07-22T00:00:00Z" };
  });

  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("writeArtifacts writes one JSON file per artifact under local/artifacts/", async () => {
    const dep = await writeArtifacts(deps, "local", "billing-dispute", artifacts);
    expect(dep.resources).toEqual([
      { id: "agentDefinition", kind: "artifact-file", createdAt: "2026-07-22T00:00:00Z" },
      { id: "kpiFrame", kind: "artifact-file", createdAt: "2026-07-22T00:00:00Z" },
    ]);
    const written = await readFile(join(cxRoot, "billing-dispute", "local", "artifacts", "kpiFrame.json"), "utf8");
    expect(JSON.parse(written)).toEqual(artifacts[1]);
  });

  it("readArtifacts recovers exactly what writeArtifacts wrote", async () => {
    const dep = await writeArtifacts(deps, "local", "billing-dispute", artifacts);
    const recovered = await readArtifacts(deps, dep);
    expect(recovered).toEqual(artifacts);
  });

  it("removeArtifacts deletes the spec's local artifacts directory", async () => {
    const dep = await writeArtifacts(deps, "local", "billing-dispute", artifacts);
    await removeArtifacts(deps, dep);
    await expect(readFile(join(cxRoot, "billing-dispute", "local", "artifacts", "kpiFrame.json"), "utf8")).rejects.toThrow();
  });
});
