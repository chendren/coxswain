/**
 * VERBATIM product surface (task 8 copies these exactly from
 * design.md §Generation prompts; snapshot-tested so drift is a conscious
 * diff, never an accidental one).
 */
import type { SpecTask } from "@cox/core";

// TODO(task 8): fill in verbatim from design.md.
export const SPEC_SYSTEM = "";

export function requirementsPrompt(name: string, idea: string): string {
  throw new Error("not implemented");
}

export function designPrompt(name: string, idea: string, requirementsMd: string): string {
  throw new Error("not implemented");
}

export function tasksPrompt(name: string, requirementsMd: string, designMd: string): string {
  throw new Error("not implemented");
}

export function execPrompt(
  task: SpecTask,
  requirementExcerpts: string,
  designMd: string,
): string {
  throw new Error("not implemented");
}
