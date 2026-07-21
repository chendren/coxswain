/**
 * tasks.md grammar (R6). Human-owned lines (headings, prose, blank lines)
 * are ignored by the parser and never rewritten by it — only flipCheckbox
 * performs a surgical single-line edit; renderTasks is the "initial
 * writer" full-file form used right after generation/approval.
 *
 * Grammar (design.md §Parser grammar):
 *   task-line     := "- [" ("x"|" ") "] " id ". " title
 *   id            := \d+(\.\d+)?
 *   metadata-line := indent ("requirements: " r-id ("," ws r-id)*
 *                    | "complexity: " [1-5]
 *                    | key ": " rest)      ; unknown keys ignored
 *   r-id          := R\d+\.\d+
 *   indent        := two or more spaces
 */
import type { SpecTask } from "@cox/core";

export function parseTasks(md: string): { tasks: SpecTask[]; errors: string[] } {
  throw new Error("not implemented");
}

export function renderTasks(name: string, tasks: SpecTask[]): string {
  throw new Error("not implemented");
}

/** Surgical `- [ ]` → `- [x]` flip for exactly one task id (R6.5). Throws if
 * no line for that id exists; every other byte is untouched. */
export function flipCheckbox(md: string, taskId: string): string {
  throw new Error("not implemented");
}

/** Pulls the "- R<id>: ..." line (plus indented continuation lines) for each
 * id out of a requirements.md body, in the order given; notes missing ids
 * inline instead of throwing (R7.4). */
export function extractRequirementExcerpts(reqMd: string, ids: string[]): string {
  throw new Error("not implemented");
}
