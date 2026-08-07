/**
 * CAB / change-package export: CFN + remediations + proposals/tasks + brief.
 * Never mutates AWS — filesystem package for human change boards.
 */
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderExecBrief } from "./brief";
import { loadProposals } from "./proposals";
import { loadCxTasks } from "./tasks";
import {
  loadCxWorkspace,
  loadDeployments,
  type CxWorkspaceDeps,
} from "./workspace";

const AWS_FILES = [
  "template.yaml",
  "APPLY.md",
  "architectureDoc.json",
  "agentDefinition.json",
] as const;

export interface CabExportResult {
  outDir: string;
  files: string[];
  path: string[];
}

export async function exportCabPackage(
  deps: CxWorkspaceDeps,
  specName: string,
  outDirRaw: string,
  cwd: string,
): Promise<CabExportResult> {
  const path = ["load_workspace", "copy_aws", "copy_remediations", "write_state", "write_brief", "emit"];
  const record = await loadCxWorkspace(deps, specName);
  if (!record) {
    throw new Error(`CX spec "${specName}" not found`);
  }

  const outDir = resolve(cwd, outDirRaw);
  await mkdir(outDir, { recursive: true });
  const files: string[] = [];

  const awsSrc = join(deps.cxRoot, specName, "aws");
  const awsDst = join(outDir, "aws");
  await mkdir(awsDst, { recursive: true });
  for (const f of AWS_FILES) {
    try {
      await cp(join(awsSrc, f), join(awsDst, f));
      files.push(`aws/${f}`);
    } catch {
      /* optional */
    }
  }

  const remSrc = join(deps.cxRoot, specName, "remediations");
  const remDst = join(outDir, "remediations");
  try {
    await mkdir(remDst, { recursive: true });
    const ents = await readdir(remSrc);
    for (const e of ents) {
      if (!e.endsWith(".md")) continue;
      await cp(join(remSrc, e), join(remDst, e));
      files.push(`remediations/${e}`);
    }
  } catch {
    /* no remediations yet */
  }

  const proposals = await loadProposals(deps, specName);
  const tasks = await loadCxTasks(deps, specName);
  const depsFile = await loadDeployments(deps, specName);

  await writeFile(
    join(outDir, "proposals.json"),
    JSON.stringify({ proposals, exportedAt: deps.now() }, null, 2),
    "utf8",
  );
  files.push("proposals.json");

  await writeFile(
    join(outDir, "tasks.json"),
    JSON.stringify({ tasks, exportedAt: deps.now() }, null, 2),
    "utf8",
  );
  files.push("tasks.json");

  await writeFile(
    join(outDir, "deployments.json"),
    JSON.stringify(depsFile, null, 2),
    "utf8",
  );
  files.push("deployments.json");

  const brief = renderExecBrief({
    name: specName,
    record,
    deployments: depsFile.deployments,
    proposals,
    tasks,
    generatedAt: deps.now(),
  });
  await writeFile(join(outDir, "BRIEF.md"), brief, "utf8");
  files.push("BRIEF.md");

  const manifest = [
    `# CAB package: ${specName}`,
    ``,
    `Exported: ${deps.now()}`,
    ``,
    `## Contents`,
    ``,
    ...files.map((f) => `- ${f}`),
    ``,
    `## Human apply (AWS)`,
    ``,
    `Review \`aws/template.yaml\` and \`aws/APPLY.md\`.`,
    `Coxswain does **not** run CreateStack. Apply with scoped credentials only after change approval.`,
    ``,
    `## Controls`,
    ``,
    `- Proposals/tasks are human-gated operate artifacts.`,
    `- Remediations describe operator steps outside auto-mutation.`,
    ``,
  ].join("\n");
  await writeFile(join(outDir, "MANIFEST.md"), manifest, "utf8");
  files.push("MANIFEST.md");

  // Include audit trail if present
  try {
    const auditRaw = await readFile(join(deps.cxRoot, specName, "audit.jsonl"), "utf8");
    await writeFile(join(outDir, "audit.jsonl"), auditRaw, "utf8");
    files.push("audit.jsonl");
  } catch {
    /* optional */
  }

  return { outDir, files, path };
}
