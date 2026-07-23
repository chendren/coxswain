import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CxArtifact, CxDeployment, CxDeploymentResource, CxTargetId } from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

export interface DiskDeps {
  cxRoot: string;
  now: () => string;
}

function artifactsDir(deps: DiskDeps, specName: string): string {
  return join(deps.cxRoot, specName, "local", "artifacts");
}

function artifactPath(deps: DiskDeps, specName: string, artifactId: string): string {
  return join(artifactsDir(deps, specName), `${artifactId}.json`);
}

export async function writeArtifacts(
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
      message: `cx-local: failed to write artifacts for spec "${specName}": ${(err as Error).message}`,
      targetId,
      phase: "deploy",
      retryable: true,
    });
  }
}

export async function readArtifacts(deps: DiskDeps, dep: CxDeployment): Promise<CxArtifact[]> {
  try {
    const artifacts: CxArtifact[] = [];
    for (const resource of dep.resources) {
      const raw = await readFile(artifactPath(deps, dep.specName, resource.id), "utf8");
      artifacts.push(JSON.parse(raw) as CxArtifact);
    }
    return artifacts;
  } catch (err) {
    throw createCxAdapterError({
      message: `cx-local: failed to read artifacts for spec "${dep.specName}": ${(err as Error).message}`,
      targetId: dep.targetId,
      phase: "simulate",
      retryable: true,
    });
  }
}

export async function removeArtifacts(deps: DiskDeps, dep: CxDeployment): Promise<void> {
  try {
    await rm(join(deps.cxRoot, dep.specName, "local"), { recursive: true, force: true });
  } catch (err) {
    throw createCxAdapterError({
      message: `cx-local: failed to tear down artifacts for spec "${dep.specName}": ${(err as Error).message}`,
      targetId: dep.targetId,
      phase: "teardown",
      retryable: true,
    });
  }
}
