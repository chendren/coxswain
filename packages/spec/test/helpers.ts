/**
 * Shared test scaffolding: a scripted FakeAgentRunner (no @cox/agent or
 * @cox/providers import — engine tests only ever see the AgentRunner
 * contract) and fs.mkdtemp project dirs.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  ZERO_USAGE,
  type AgentEvent,
  type AgentRunner,
  type AgentRunResult,
  type AgentTask,
} from "@cox/core";

export interface ScriptedRun {
  finalText?: string;
  stopReason?: AgentRunResult["stopReason"];
  events?: AgentEvent[];
}

/**
 * Returns a fresh AgentRunner each call; consumes `script` in order (one
 * entry per `run()` call), repeating the last entry if `run` is called more
 * times than the script has entries. Records every AgentTask it was given
 * so tests can assert routing-relevant fields (kind, complexityHint,
 * sessionId, prompt content, ...).
 */
export function fakeRunner(script: ScriptedRun[]): AgentRunner & { calls: AgentTask[] } {
  const calls: AgentTask[] = [];
  let cursor = 0;

  async function run(
    task: AgentTask,
    onEvent: (e: AgentEvent) => void,
  ): Promise<AgentRunResult> {
    calls.push(task);
    const step = script[cursor] ?? script[script.length - 1];
    cursor++;
    if (!step) {
      throw new Error("fakeRunner: run() called but script is empty");
    }
    for (const e of step.events ?? []) {
      onEvent(e);
    }
    const stopReason = step.stopReason ?? "end_turn";
    const finalText = step.finalText ?? "";
    return {
      finalText,
      history: [
        ...task.history,
        { role: "assistant", content: [{ type: "text", text: finalText }] },
      ],
      usage: ZERO_USAGE,
      costUsd: 0,
      stopReason,
    };
  }

  return { calls, run };
}

export async function tmpProject(): Promise<{ cwd: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cox-spec-"));
  return {
    cwd: dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

/** 3-task fixture in the exact tasks.md grammar (R6). */
export const VALID_TASKS_MD = `# Tasks — fixture

- [ ] 1. Scaffold the module
  requirements: R1.1
  complexity: 1

- [ ] 2. Implement core logic
  requirements: R1.2, R2.1
  complexity: 3

- [ ] 3. Wire up integration
  requirements: R2.2
  complexity: 2
`;

/** Requirements fixture covering R1.1–R2.2, including multi-line criteria
 * for continuation-line extraction tests (extractRequirementExcerpts). */
export const REQ_FIXTURE_MD = `# Requirements — fixture

One short paragraph restating the idea as a goal.

## Story 1: Example story
As a developer, I want an example, so that tests have fixtures.

Acceptance criteria:
- R1.1: WHEN the fixture is loaded, THE engine SHALL provide criterion text
  that spans two lines, to exercise continuation-line extraction.
- R1.2: IF the fixture is malformed, THEN THE engine SHALL reject it.

## Story 2: Second story
As a developer, I want a second story, so that multiple stories are covered.

Acceptance criteria:
- R2.1: WHEN something happens, THE engine SHALL respond.
- R2.2: IF an edge case occurs, THEN THE engine SHALL handle it, and this
  criterion also continues onto a second indented line.
`;
