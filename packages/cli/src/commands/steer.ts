/**
 * cox steer init / `/steer init` (R12.1): writes the three steering
 * templates into .cox/steering/, skipping files that already exist, then
 * — only in interactive TTY mode — offers an architect-tier agent fill-in
 * after explicit y/N confirmation.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRunner } from "@cox/core";

export interface SteerInitDeps {
  cwd: string;
  templates: Record<string, string>;
  sessionId: string;
  write: (line: string) => void;
  /** Offer the agent fill-in only when both are true/present (R12.1). */
  isTTY: boolean;
  agent?: AgentRunner;
  /** Injected for tests; defaults to a real stdin y/N prompt. */
  confirm?: (message: string) => Promise<boolean>;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function defaultConfirm(message: string): Promise<boolean> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(message);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export async function runSteerInit(deps: SteerInitDeps): Promise<void> {
  const dir = join(deps.cwd, ".cox", "steering");
  await mkdir(dir, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];
  for (const [name, body] of Object.entries(deps.templates)) {
    const path = join(dir, `${name}.md`);
    if (await fileExists(path)) {
      skipped.push(name);
      continue;
    }
    await writeFile(path, body, "utf8");
    written.push(name);
  }

  for (const name of written) deps.write(`✓ wrote .cox/steering/${name}.md`);
  for (const name of skipped) deps.write(`· .cox/steering/${name}.md already exists — skipped`);

  if (!deps.isTTY || written.length === 0 || !deps.agent) return;

  const confirm = deps.confirm ?? defaultConfirm;
  const proceed = await confirm(
    `Fill in the new steering doc${written.length > 1 ? "s" : ""} now using the architect model? [y/N] `,
  );
  if (!proceed) return;

  const files = written.map((n) => `.cox/steering/${n}.md`).join(", ");
  await deps.agent.run(
    {
      kind: "chat",
      prompt: `Explore this repository (read package manifests, top-level directories, and any existing docs) and fill in ${files} with concrete, project-specific content, replacing the bracketed prompts. Preserve each file's existing front matter exactly.`,
      system:
        "You are Coxswain's steering-doc author. Be concrete and specific to this project; never leave placeholder text.",
      history: [],
      cwd: deps.cwd,
      sessionId: deps.sessionId,
      userOverrideTier: "architect",
      maxTurns: 10,
    },
    () => {},
  );
}
