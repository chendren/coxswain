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

const TASK_LINE_RE = /^- \[([ x])\] (\d+(?:\.\d+)?)\. (.+)$/;
const METADATA_LINE_RE = /^\s{2,}(\S[^:]*):\s*(.*)$/;
const R_ID_RE = /^R\d+\.\d+$/;

interface Candidate {
  id: string;
  title: string;
  checked: boolean;
  requirements?: string[];
  complexity?: string;
}

/** R6.1/R6.2 — parses task-lines + their indented metadata, ignoring (but
 * never touching) any other line. Always returns a best-effort task list
 * AND the R6.3 validation errors for it; callers decide whether errors are
 * fatal (generate/approve("tasks")) or tolerated (load — R1.4). */
export function parseTasks(md: string): { tasks: SpecTask[]; errors: string[] } {
  const lines = md.split("\n");
  const candidates: Candidate[] = [];
  let current: Candidate | null = null;

  const finalize = () => {
    if (current) {
      candidates.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    const taskMatch = TASK_LINE_RE.exec(line);
    if (taskMatch) {
      finalize();
      const [, checkbox, id, title] = taskMatch;
      current = { id: id ?? "", title: title ?? "", checked: checkbox === "x" };
      continue;
    }
    if (current && /^\s{2,}\S/.test(line)) {
      const metaMatch = METADATA_LINE_RE.exec(line);
      if (metaMatch) {
        const [, key, value] = metaMatch;
        if (key === "requirements") {
          current.requirements = (value ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        } else if (key === "complexity") {
          current.complexity = (value ?? "").trim();
        }
        // unknown metadata keys are preserved on disk but otherwise ignored.
      }
      continue;
    }
    // blank line, heading, prose, or dedented content: ends the current
    // task's metadata block (if any) and is otherwise human-owned (R6.2).
    finalize();
  }
  finalize();

  const errors: string[] = [];
  const seenIds = new Set<string>();
  const tasks: SpecTask[] = [];

  for (const c of candidates) {
    if (seenIds.has(c.id)) {
      errors.push(`duplicate task id "${c.id}"`);
    }
    seenIds.add(c.id);

    if (c.requirements === undefined) {
      errors.push(`task ${c.id}: missing "requirements:" metadata line`);
    } else if (c.requirements.length === 0) {
      errors.push(`task ${c.id}: "requirements:" line lists no requirement ids`);
    } else {
      for (const r of c.requirements) {
        if (!R_ID_RE.test(r)) {
          errors.push(`task ${c.id}: requirement id "${r}" does not match R<n>.<n>`);
        }
      }
    }

    let complexity = 0;
    if (c.complexity === undefined) {
      errors.push(`task ${c.id}: missing "complexity:" metadata line`);
    } else if (!/^[1-5]$/.test(c.complexity)) {
      errors.push(`task ${c.id}: complexity "${c.complexity}" is not an integer 1-5`);
    } else {
      complexity = Number(c.complexity);
    }

    tasks.push({
      id: c.id,
      title: c.title,
      requirements: c.requirements ?? [],
      complexity,
      status: c.checked ? "done" : "pending",
    });
  }

  if (tasks.length === 0) {
    errors.push("no tasks found");
  }

  return { tasks, errors };
}

/** The "initial writer" — strict canonical form. Always renders a checkbox
 * as checked only for status "done" (in_progress/blocked are spec.json-only
 * states that never reach tasks.md — see NOTES.md). */
export function renderTasks(name: string, tasks: SpecTask[]): string {
  const lines: string[] = [`# Tasks — ${name}`, ""];
  for (const t of tasks) {
    const box = t.status === "done" ? "x" : " ";
    lines.push(`- [${box}] ${t.id}. ${t.title}`);
    lines.push(`  requirements: ${t.requirements.join(", ")}`);
    lines.push(`  complexity: ${t.complexity}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Surgical `- [ ]` / `- [x]` → `- [x]` flip for exactly one task id (R6.5).
 * Only the checkbox character changes; the id/title/every other line is
 * byte-identical, so hand-edited titles (R8.1) survive. Throws if no task
 * line for that id exists. Idempotent if already checked. */
export function flipCheckbox(md: string, taskId: string): string {
  const linePattern = new RegExp(`^(- \\[)([ x])(\\] ${escapeRegExp(taskId)}\\. )`);
  const lines = md.split("\n");
  const idx = lines.findIndex((l) => linePattern.test(l));
  if (idx === -1) {
    throw new Error(`flipCheckbox: no task line found for id "${taskId}"`);
  }
  const line = lines[idx];
  if (line === undefined) {
    throw new Error(`flipCheckbox: no task line found for id "${taskId}"`);
  }
  lines[idx] = line.replace(linePattern, "$1x$3");
  return lines.join("\n");
}

/** Pulls the "- R<id>: ..." line (plus indented continuation lines) for each
 * id out of a requirements.md body, in the order given; notes missing ids
 * inline instead of throwing (R7.4). */
export function extractRequirementExcerpts(reqMd: string, ids: string[]): string {
  const lines = reqMd.split("\n");
  const parts: string[] = [];

  for (const id of ids) {
    const startPattern = new RegExp(`^- ${escapeRegExp(id)}: `);
    const idx = lines.findIndex((l) => startPattern.test(l));
    if (idx === -1) {
      parts.push(`(${id}: not found in requirements.md)`);
      continue;
    }
    const first = lines[idx];
    if (first === undefined) {
      parts.push(`(${id}: not found in requirements.md)`);
      continue;
    }
    const excerpt: string[] = [first];
    let j = idx + 1;
    while (j < lines.length) {
      const l = lines[j];
      if (l === undefined || l.trim() === "" || !/^\s/.test(l)) {
        break;
      }
      excerpt.push(l);
      j++;
    }
    parts.push(excerpt.join("\n"));
  }

  return parts.join("\n\n");
}
