/**
 * session.ts — SessionControllerImpl (R8.4; R8.5's command dispatch table
 * is a stub here and fully lands in task 14). Takes an already-built
 * `LoadedDeps` (never calls loadDeps/dynamic import itself), so it's
 * testable with fully local fakes for every engine.
 */
import type {
  BudgetConfig,
  ChatMessage,
  CoxConfig,
  EventBus,
  PermissionDecision,
  SessionController,
  Tier,
} from "@cox/core";
import type { LoadedDeps } from "./deps";
import type { SnapshotStore } from "./snapshot";
import { COX_IDENTITY } from "./identity";

export interface CreateSessionControllerOpts {
  deps: LoadedDeps;
  bus: EventBus;
  cfg: CoxConfig;
  cwd: string;
  snapshot: SnapshotStore;
  /** Retained mutable object — /budget extend (task 14) mutates it in place. */
  budgets: BudgetConfig;
  /** -m/--model <tier> at startup; lowest precedence, /model overrides it. */
  cliFlagTier?: Tier;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createSessionController(opts: CreateSessionControllerOpts): SessionController {
  const { deps, bus, cwd } = opts;

  // Internal state per design.md's session.ts section.
  let history: ChatMessage[] = [];
  let modelOverride: Tier | null = null;
  const manualSteering: string[] = [];
  let abort: AbortController | null = null;

  async function submitPromptAsync(text: string): Promise<void> {
    // Rendered regardless of what happens next — the user should see what
    // they typed even if a hook goes on to block the turn.
    bus.emit({ type: "user_prompt", text });

    const hookOutcomes = await deps.hooks.fire({
      event: "UserPromptSubmit",
      sessionId: deps.sessionId,
      cwd,
      data: { text },
    });
    if (hookOutcomes.length > 0) {
      bus.emit({ type: "hook_fired", event: "UserPromptSubmit", outcomes: hookOutcomes });
    }
    if (hookOutcomes.some((o) => o.action === "block")) return;

    // Stable-first assembly (docs/01): identity + always-steering docs go
    // in `system` (cacheable prefix); fileMatch/manual steering docs are
    // volatile context, prefixed to *this turn's* user content instead.
    const docs = await deps.steering.loadAll(cwd);
    const sel = deps.steering.select(docs, [], manualSteering);
    const system =
      sel.systemDocs.length > 0
        ? `${COX_IDENTITY}\n\n${sel.systemDocs.map((d) => d.body).join("\n\n")}`
        : COX_IDENTITY;
    const contextPrefix = sel.contextDocs
      .map((d) => `<steering name="${d.name}">${d.body}</steering>`)
      .join("\n\n");
    const prompt = contextPrefix ? `${contextPrefix}\n\n${text}` : text;

    const controller = new AbortController();
    abort = controller;
    try {
      const result = await deps.agent.run(
        {
          kind: "chat",
          prompt,
          system,
          history,
          cwd,
          sessionId: deps.sessionId,
          userOverrideTier: modelOverride ?? opts.cliFlagTier,
          maxTurns: 40,
        },
        (e) => bus.emit(e),
        controller.signal,
      );
      history = result.history;
    } finally {
      if (abort === controller) abort = null;
    }
  }

  function submitCommand(command: string, _args: string[]): void {
    // Full /spec /steer /model /context /ledger /budget dispatch table
    // lands in task 14. For now every command is consistently "not
    // implemented" rather than silently doing nothing, so callers always
    // see *something* in the transcript.
    bus.emit({ type: "error", message: `not implemented yet: /${command}` });
  }

  function resolvePermission(decision: PermissionDecision): void {
    deps.resolvePermission(decision);
  }

  function interrupt(): void {
    abort?.abort();
  }

  return {
    sessionId: deps.sessionId,
    submitPrompt(text) {
      submitPromptAsync(text).catch((err: unknown) => {
        bus.emit({ type: "error", message: errorMessage(err) });
      });
    },
    submitCommand,
    resolvePermission,
    interrupt,
  };
}
