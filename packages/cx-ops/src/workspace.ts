/**
 * CX workspace on disk — strong graph of CXOS session state.
 *
 * Layout under `{cxRoot}/{specName}/`:
 *   spec.json          CxSpec + path audit
 *   deployments.json   Record<targetId, CxDeployment>
 *   artifacts/         written by adapters
 *   local/             local adapter disk
 *   aws/               aws adapter disk
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CxArtifact,
  CxDeployment,
  CxDesignDoc,
  CxRequirement,
  CxSpec,
  CxTargetId,
  JourneyMap,
  Persona,
} from "@cox/cx-core";
import { CX_TARGET_IDS } from "@cox/cx-core";

export type CxPhase = "requirements" | "design" | "tasks";

export interface CxWorkspaceRecord {
  spec: CxSpec;
  /** Graph-node control-flow audit for the whole workspace. */
  path: string[];
  idea: string;
  updatedAt: string;
}

export interface CxDeploymentsFile {
  deployments: Partial<Record<CxTargetId, CxDeployment>>;
  updatedAt: string;
}

export interface CxWorkspaceDeps {
  cxRoot: string;
  now: () => string;
}

export function defaultCxRoot(cwd: string): string {
  return join(cwd, ".cox", "cx");
}

function specDir(deps: CxWorkspaceDeps, name: string): string {
  return join(deps.cxRoot, name);
}

function specPath(deps: CxWorkspaceDeps, name: string): string {
  return join(specDir(deps, name), "spec.json");
}

function deploymentsPath(deps: CxWorkspaceDeps, name: string): string {
  return join(specDir(deps, name), "deployments.json");
}

function assertName(name: string): void {
  if (!name || name.includes("/") || name.includes("..") || name.includes("\\")) {
    throw new Error(`invalid CX spec name "${name}"`);
  }
}

export async function createCxSpec(
  deps: CxWorkspaceDeps,
  name: string,
  idea: string,
  requirements?: CxRequirement[],
): Promise<CxWorkspaceRecord> {
  assertName(name);
  const now = deps.now();
  const reqs =
    requirements && requirements.length > 0
      ? requirements
      : [
          {
            id: "R1.1",
            text: `WHEN a customer engages about "${idea}", THE SYSTEM SHALL resolve within closed ontology journeys with measurable KPIs`,
          },
          {
            id: "R1.2",
            text: `WHEN handle time or SLA degrades, THE SYSTEM SHALL surface graph-grounded next-best-actions rather than free-form advice`,
          },
        ];

  const record: CxWorkspaceRecord = {
    idea,
    path: ["create_spec", "seed_requirements", "emit"],
    updatedAt: now,
    spec: {
      state: {
        name,
        createdAt: now,
        phases: {
          requirements: "draft",
          design: "missing",
          tasks: "missing",
        },
        tasks: [],
        approvals: [],
      },
      requirements: reqs,
    },
  };

  await mkdir(specDir(deps, name), { recursive: true });
  await writeFile(specPath(deps, name), JSON.stringify(record, null, 2), "utf8");
  await writeFile(
    deploymentsPath(deps, name),
    JSON.stringify({ deployments: {}, updatedAt: now } satisfies CxDeploymentsFile, null, 2),
    "utf8",
  );
  return record;
}

export async function loadCxWorkspace(
  deps: CxWorkspaceDeps,
  name: string,
): Promise<CxWorkspaceRecord | null> {
  assertName(name);
  try {
    const raw = await readFile(specPath(deps, name), "utf8");
    return JSON.parse(raw) as CxWorkspaceRecord;
  } catch {
    return null;
  }
}

export async function saveCxWorkspace(
  deps: CxWorkspaceDeps,
  record: CxWorkspaceRecord,
): Promise<void> {
  const name = record.spec.state.name;
  record.updatedAt = deps.now();
  await mkdir(specDir(deps, name), { recursive: true });
  await writeFile(specPath(deps, name), JSON.stringify(record, null, 2), "utf8");
}

export async function listCxSpecs(deps: CxWorkspaceDeps): Promise<string[]> {
  try {
    const entries = await readdir(deps.cxRoot, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export async function approveCxPhase(
  deps: CxWorkspaceDeps,
  name: string,
  phase?: CxPhase,
): Promise<CxWorkspaceRecord> {
  const record = await loadCxWorkspace(deps, name);
  if (!record) throw new Error(`CX spec "${name}" not found`);

  const order: CxPhase[] = ["requirements", "design", "tasks"];
  let target = phase;
  if (!target) {
    target = order.find((p) => record.spec.state.phases[p] !== "approved");
  }
  if (!target) {
    record.path = [...record.path, "approve:noop"];
    await saveCxWorkspace(deps, record);
    return record;
  }

  // Gate: cannot approve design before requirements, tasks before design
  const idx = order.indexOf(target);
  for (let i = 0; i < idx; i++) {
    const prior = order[i]!;
    if (record.spec.state.phases[prior] !== "approved") {
      throw new Error(`cannot approve "${target}" until "${prior}" is approved`);
    }
  }

  record.spec.state.phases[target] = "approved";
  record.spec.state.approvals.push({ phase: target, at: deps.now() });
  record.path = [...record.path, `approve:${target}`, "emit"];
  await saveCxWorkspace(deps, record);
  return record;
}

/** Merge design artifacts into the workspace (after artifacts build). */
export async function mergeDesignFromArtifacts(
  deps: CxWorkspaceDeps,
  name: string,
  artifacts: CxArtifact[],
): Promise<CxWorkspaceRecord> {
  const record = await loadCxWorkspace(deps, name);
  if (!record) throw new Error(`CX spec "${name}" not found`);

  const journeyMaps = artifacts.filter((a): a is JourneyMap => a.kind === "journeyMap");
  const personas = artifacts.filter((a): a is Persona => a.kind === "persona");
  const intentTaxonomy = artifacts.find((a) => a.kind === "intentTaxonomy");
  const nbaRuleSet = artifacts.find((a) => a.kind === "nbaRuleSet");

  const design: CxDesignDoc = {
    journeyMaps,
    personas,
    intentTaxonomy: intentTaxonomy?.kind === "intentTaxonomy" ? intentTaxonomy : undefined,
    nbaRuleSet: nbaRuleSet?.kind === "nbaRuleSet" ? nbaRuleSet : undefined,
  };
  record.spec.design = design;
  if (record.spec.state.phases.design === "missing") {
    record.spec.state.phases.design = "draft";
  }
  record.path = [...record.path, "merge_design", "emit"];
  await saveCxWorkspace(deps, record);
  return record;
}

export async function loadDeployments(
  deps: CxWorkspaceDeps,
  name: string,
): Promise<CxDeploymentsFile> {
  try {
    const raw = await readFile(deploymentsPath(deps, name), "utf8");
    return JSON.parse(raw) as CxDeploymentsFile;
  } catch {
    return { deployments: {}, updatedAt: deps.now() };
  }
}

export async function saveDeployment(
  deps: CxWorkspaceDeps,
  name: string,
  dep: CxDeployment,
): Promise<CxDeploymentsFile> {
  const file = await loadDeployments(deps, name);
  file.deployments[dep.targetId] = dep;
  file.updatedAt = deps.now();
  await writeFile(deploymentsPath(deps, name), JSON.stringify(file, null, 2), "utf8");
  return file;
}

export async function clearDeployment(
  deps: CxWorkspaceDeps,
  name: string,
  targetId: CxTargetId,
): Promise<void> {
  const file = await loadDeployments(deps, name);
  delete file.deployments[targetId];
  file.updatedAt = deps.now();
  await writeFile(deploymentsPath(deps, name), JSON.stringify(file, null, 2), "utf8");
}

export function parseTargets(raw: string | undefined): CxTargetId[] {
  if (!raw || raw === "all") return [...CX_TARGET_IDS];
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const out: CxTargetId[] = [];
  for (const p of parts) {
    if (!(CX_TARGET_IDS as readonly string[]).includes(p)) {
      throw new Error(`unknown target "${p}" (use artifacts|local|aws)`);
    }
    out.push(p as CxTargetId);
  }
  // Ordering rule: artifacts first
  return out.sort((a, b) => {
    if (a === "artifacts") return -1;
    if (b === "artifacts") return 1;
    return a.localeCompare(b);
  });
}

export function adapterDiskRoot(deps: CxWorkspaceDeps, name: string, target: CxTargetId): string {
  return join(specDir(deps, name), target);
}
