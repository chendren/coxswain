/**
 * cox hook run <name> / `/hook run <name>` (docs/00, R8.5): finds the named
 * agent hook and runs it on its configured tier.
 */
import type { AgentEvent, AgentRunner, HookEngine } from "@cox/core";

export interface HookRunDeps {
  hooks: HookEngine;
  agent: AgentRunner;
  cwd: string;
  sessionId: string;
  write: (line: string) => void;
  onEvent?: (e: AgentEvent) => void;
}

export async function runHookRun(deps: HookRunDeps, name: string): Promise<void> {
  const hook = deps.hooks.agentHooks().find((h) => h.name === name);
  if (!hook) {
    throw new Error(`hook not found: ${name}`);
  }
  const result = await deps.agent.run(
    {
      kind: "hook",
      prompt: hook.prompt,
      system: "You are Coxswain running an agent hook automation.",
      history: [],
      cwd: deps.cwd,
      sessionId: deps.sessionId,
      userOverrideTier: hook.tier,
      maxTurns: 40,
    },
    deps.onEvent ?? (() => {}),
  );
  deps.write(result.finalText);
}
