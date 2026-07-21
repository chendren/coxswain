import type { PermissionMode, PermissionRequest } from "@cox/core";
import { resolveWithin } from "./paths";

/**
 * Shared permissionFor logic for path-mutating tools (write, edit) per the
 * design.md matrix: paths outside cwd always prompt (every mode, including
 * yolo); inside-cwd paths skip the prompt in acceptEdits/yolo.
 */
export function mutationPermission(
  cwd: string,
  path: string,
  mode: PermissionMode,
  toolName: string,
  verb: string,
  detail?: string,
): PermissionRequest | null {
  const { abs, outside } = resolveWithin(cwd, path);
  if (outside) {
    return { toolName, summary: `OUTSIDE PROJECT: ${verb} ${abs}`, detail };
  }
  if (mode === "acceptEdits" || mode === "yolo") return null;
  // mode is "default" or "plan" — plan-mode auto-deny happens at the runner.
  return { toolName, summary: `${verb} ${path}`, detail };
}
