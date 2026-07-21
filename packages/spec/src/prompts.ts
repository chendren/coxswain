/**
 * VERBATIM product surface (task 8 copies these exactly from
 * design.md §Generation prompts; snapshot-tested so drift is a conscious
 * diff, never an accidental one).
 */
import type { SpecTask } from "@cox/core";

export const SPEC_SYSTEM = `You are Coxswain's spec author. You produce precise, testable
software specification documents. Follow the requested output format exactly: your final
message must contain ONLY the completed markdown document — no preamble, no commentary,
no code fences around the whole document. Be concrete and specific to THIS project; never
emit placeholder text like "TBD" or "as appropriate". British understatement over marketing
prose. Documents must be self-contained: a reader who has only your output can act on it.`;

export function requirementsPrompt(name: string, idea: string): string {
  return `Write the requirements document for a feature named "${name}".

The feature idea, verbatim from the user:
<idea>
${idea}
</idea>

Output format — follow it exactly:

# Requirements — ${name}

One short paragraph restating the idea as a goal (no marketing language).

Then 2–6 stories. Each story:

## Story <n>: <short title>
As a <role>, I want <capability>, so that <benefit>.

Acceptance criteria:
- R<n>.1: WHEN <trigger>, THE SYSTEM SHALL <observable response>.
- R<n>.2: IF <error or edge condition>, THEN THE SYSTEM SHALL <response>.
  (EARS keywords: WHEN, WHILE, WHERE, IF/THEN. Every criterion gets a stable
  id R<story>.<criterion> — these ids are referenced by design and tasks and
  must never be renumbered in later edits.)

Rules: every criterion independently checkable; no criterion may bundle two
behaviors ("and" is a smell); cover the unhappy paths (invalid input, missing
files, failures) — a spec with only happy paths is incomplete.`;
}

export function designPrompt(name: string, idea: string, requirementsMd: string): string {
  return `Write the technical design for feature "${name}". The requirements below are
approved and binding — the design must satisfy every R-id and reference them inline.

<requirements>
${requirementsMd}
</requirements>

You may read the repository with your tools first to ground the design in the real
codebase (existing patterns, file layout, naming). Prefer extending existing modules
over inventing new ones.

Output format — follow it exactly:

# Design — ${name}

## Overview
One paragraph: approach and why, plus rejected alternative in one sentence.

## Files
Table or list of every file to create or modify, with a one-line purpose each.

## Interfaces
The exact signatures/types/schemas to add or change, as code blocks. Cite the
R-ids each interface serves.

## Sequence
A mermaid sequenceDiagram of the main flow (and the key failure flow if it differs).

## Risks
2–5 bullets: what could go wrong technically, and the mitigation. Cite R-ids.

The original idea, for context only (requirements win on conflict):
<idea>${idea}</idea>`;
}

export function tasksPrompt(name: string, requirementsMd: string, designMd: string): string {
  return `Break the approved design for "${name}" into implementation tasks.

<requirements>
${requirementsMd}
</requirements>
<design>
${designMd}
</design>

Output format — follow it EXACTLY (it is machine-parsed; any deviation is rejected):

# Tasks — ${name}

- [ ] 1. <imperative task title>
  requirements: R1.1, R2.3
  complexity: 2

Rules:
- 5 to 15 tasks, ids sequential from 1 (sub-ids like 2.1 allowed).
- Every task lists the R-ids it satisfies; collectively the tasks must cover
  every R-id in the requirements (verify before answering).
- complexity is an integer 1–5: 1–2 mechanical (rename, boilerplate, config),
  3 routine implementation with tests, 4–5 cross-cutting or novel logic.
  Calibrate honestly — this drives which model executes the task.
- Order tasks so each depends only on earlier ones; task 1 is usually
  scaffolding, the last task is usually integration/verification.
- No prose outside the heading and the task list.`;
}

export function execPrompt(
  task: SpecTask, requirementExcerpts: string, designMd: string,
): string {
  return `Implement this task from the approved spec. It is one step of a larger plan —
do exactly this task: no more, no less.

Task ${task.id}: ${task.title}

It must satisfy these acceptance criteria:
<criteria>
${requirementExcerpts}
</criteria>

The approved design (binding — follow its file layout and interfaces):
<design>
${designMd}
</design>

Work to completion: implement, then verify (run the project's tests or the
narrowest relevant check). If verification fails, fix and re-verify before
finishing. Finish with a 2–4 sentence summary of what changed and how it was
verified. If the task cannot be completed as specified, say exactly what
blocks it instead of improvising around the design.`;
}
