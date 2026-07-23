import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CxArtifact, CxDeployment, CxDeploymentResource, CxHealth, CxTargetId } from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

export interface DiskDeps {
  /** Root directory artifacts are written under. Tests inject an `fs.mkdtemp` dir. */
  cxRoot: string;
  now: () => string;
}

// `specName` is trusted here: it originates from `spec.state.name`, which is
// validated at spec-creation time elsewhere in the system (not sanitized in
// this file). If this pattern gets copied into `cx-local`/`cx-aws`, make that
// trust call deliberately rather than by accident.
function artifactsDir(deps: DiskDeps, specName: string): string {
  return join(deps.cxRoot, specName, "artifacts");
}

function artifactPath(deps: DiskDeps, specName: string, artifactId: string): string {
  return join(artifactsDir(deps, specName), `${artifactId}.json`);
}

export async function deployArtifacts(
  deps: DiskDeps,
  targetId: CxTargetId,
  specName: string,
  artifacts: CxArtifact[],
): Promise<CxDeployment> {
  try {
    await mkdir(artifactsDir(deps, specName), { recursive: true });
    const resources: CxDeploymentResource[] = [];
    for (const artifact of artifacts) {
      await writeFile(artifactPath(deps, specName, artifact.id), JSON.stringify(artifact, null, 2), "utf8");
      resources.push({ id: artifact.id, kind: "artifact-file", createdAt: deps.now() });
    }
    return { targetId, specName, deployedAt: deps.now(), resources };
  } catch (err) {
    throw createCxAdapterError({
      message: `cx-artifacts: failed to write artifacts for spec "${specName}": ${(err as Error).message}`,
      targetId,
      phase: "deploy",
      retryable: true,
    });
  }
}

export async function statusFromDisk(deps: DiskDeps, dep: CxDeployment): Promise<CxHealth> {
  let missing = 0;
  for (const resource of dep.resources) {
    try {
      await readFile(artifactPath(deps, dep.specName, resource.id), "utf8");
    } catch {
      missing++;
    }
  }
  const total = dep.resources.length;
  const level = missing === 0 ? "healthy" : missing === total ? "down" : "degraded";
  return {
    targetId: dep.targetId,
    level,
    metrics: [
      { name: "artifactCount", value: total - missing, unit: "count" },
      { name: "missingCount", value: missing, unit: "count" },
    ],
    checkedAt: deps.now(),
  };
}

export async function teardownFromDisk(deps: DiskDeps, dep: CxDeployment): Promise<void> {
  try {
    await rm(artifactsDir(deps, dep.specName), { recursive: true, force: true });
  } catch (err) {
    throw createCxAdapterError({
      message: `cx-artifacts: failed to tear down artifacts for spec "${dep.specName}": ${(err as Error).message}`,
      targetId: dep.targetId,
      phase: "teardown",
      retryable: true,
    });
  }
}
