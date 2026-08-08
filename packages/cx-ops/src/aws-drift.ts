/**
 * Read-only AWS drift check: plan template on disk vs optional live stack summary.
 * Never CreateStack / UpdateStack / DeleteStack.
 */
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface AwsDriftResult {
  path: string[];
  hasLocalTemplate: boolean;
  localTemplatePath?: string;
  localHasAwsTemplateFormatVersion: boolean;
  stackName: string;
  liveChecked: boolean;
  liveExists?: boolean;
  liveStatus?: string;
  drift?: "unknown" | "no_live" | "live_present" | "cli_error";
  message: string;
  error?: string;
}

export async function checkAwsDrift(
  cxRoot: string,
  specName: string,
  opts?: { stackName?: string; skipLive?: boolean },
): Promise<AwsDriftResult> {
  const path = ["load_local_template", "optional_describe_stacks", "emit"];
  const templatePath = join(cxRoot, specName, "aws", "template.yaml");
  const stackName = opts?.stackName ?? `cxos-${specName}`;
  let hasLocalTemplate = false;
  let localHasAwsTemplateFormatVersion = false;
  try {
    await access(templatePath);
    hasLocalTemplate = true;
    const yaml = await readFile(templatePath, "utf8");
    localHasAwsTemplateFormatVersion = yaml.includes("AWSTemplateFormatVersion");
  } catch {
    /* missing */
  }

  if (!hasLocalTemplate) {
    return {
      path,
      hasLocalTemplate: false,
      localHasAwsTemplateFormatVersion: false,
      stackName,
      liveChecked: false,
      drift: "unknown",
      message: `no local plan template at ${templatePath} (run build --target aws)`,
    };
  }

  if (opts?.skipLive || process.env.CX_SKIP_AWS_LIVE === "1") {
    return {
      path,
      hasLocalTemplate: true,
      localTemplatePath: templatePath,
      localHasAwsTemplateFormatVersion,
      stackName,
      liveChecked: false,
      drift: "unknown",
      message: "local plan present; live check skipped",
    };
  }

  try {
    const { stdout } = await execFileAsync(
      "aws",
      ["cloudformation", "describe-stacks", "--stack-name", stackName, "--output", "json"],
      { timeout: 15_000, env: process.env },
    );
    const data = JSON.parse(stdout) as {
      Stacks?: { StackStatus?: string }[];
    };
    const st = data.Stacks?.[0]?.StackStatus ?? "UNKNOWN";
    return {
      path,
      hasLocalTemplate: true,
      localTemplatePath: templatePath,
      localHasAwsTemplateFormatVersion,
      stackName,
      liveChecked: true,
      liveExists: true,
      liveStatus: st,
      drift: "live_present",
      message: `local plan OK; live stack ${stackName} status=${st} (read-only; no mutate)`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const notFound =
      msg.includes("does not exist") ||
      msg.includes("ValidationError") ||
      msg.includes("Stack with id");
    if (notFound) {
      return {
        path,
        hasLocalTemplate: true,
        localTemplatePath: templatePath,
        localHasAwsTemplateFormatVersion,
        stackName,
        liveChecked: true,
        liveExists: false,
        drift: "no_live",
        message: `local plan OK; live stack ${stackName} not found (expected until human apply)`,
      };
    }
    return {
      path,
      hasLocalTemplate: true,
      localTemplatePath: templatePath,
      localHasAwsTemplateFormatVersion,
      stackName,
      liveChecked: false,
      drift: "cli_error",
      message: "local plan OK; live check failed (aws CLI / credentials)",
      error: msg.slice(0, 200),
    };
  }
}
