/**
 * session.ts — SessionControllerImpl (R8.4, R8.5). Takes an already-built
 * `LoadedDeps` (never calls loadDeps/dynamic import itself), so it's
 * testable with fully local fakes for every engine.
 */
import { renderLedgerTable } from "@cox/tui";
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
import { runSpecApprove, runSpecGenerate, runSpecNew, runSpecRunTask, runSpecStatus } from "./commands/spec";
import { runSteerInit } from "./commands/steer";

export interface CreateSessionControllerOpts {
  deps: LoadedDeps;
  bus: EventBus;
  cfg: CoxConfig;
  cwd: string;
  snapshot: SnapshotStore;
  /** Retained mutable object — /budget extend mutates it in place. */
  budgets: BudgetConfig;
  /** -m/--model <tier> at startup; lowest precedence, /model overrides it. */
  cliFlagTier?: Tier;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const TIER_NAMES = new Set(["scout", "builder", "architect"]);

export function createSessionController(opts: CreateSessionControllerOpts): SessionController {
  const { deps, bus, cwd } = opts;

  // Internal state per design.md's session.ts section.
  let history: ChatMessage[] = [];
  let modelOverride: Tier | null = null;
  const manualSteering: string[] = [];
  let abort: AbortController | null = null;

  function emitAgentMessage(text: string): void {
    bus.emit({ type: "agent_message", text });
  }

  function emitError(message: string): void {
    bus.emit({ type: "error", message });
  }

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

  // -- /model scout|builder|architect|auto ----------------------------------
  async function handleModel(args: string[]): Promise<void> {
    const [tier] = args;
    if (tier === "auto") {
      modelOverride = null;
    } else if (tier && TIER_NAMES.has(tier)) {
      modelOverride = tier as Tier;
    } else {
      emitError("usage: /model scout|builder|architect|auto");
      return;
    }
    emitAgentMessage(`model override: ${modelOverride ?? "auto (routed per turn)"}`);
  }

  // -- /context: steering docs with token weights + system prompt size ------
  async function handleContext(): Promise<void> {
    const docs = await deps.steering.loadAll(cwd);
    const sel = deps.steering.select(docs, [], manualSteering);
    const systemTokens = Math.ceil(COX_IDENTITY.length / 4) + sel.systemDocs.reduce((n, d) => n + d.tokens, 0);
    const lines = [`system prompt: ~${systemTokens} tokens (identity + ${sel.systemDocs.length} always-doc(s))`];
    for (const d of docs) {
      const marker = d.inclusion === "always" ? "●" : d.inclusion === "fileMatch" ? "○" : "·";
      lines.push(`  ${marker} ${d.name} — ~${d.tokens} tok, ${d.inclusion}${d.imported ? ", imported" : ""}`);
    }
    if (docs.length === 0) lines.push("  (no steering docs — try /steer init)");
    emitAgentMessage(lines.join("\n"));
  }

  // -- /ledger [spec <name>] -------------------------------------------------
  async function handleLedger(args: string[]): Promise<void> {
    const specIdx = args.indexOf("spec");
    const specName = specIdx >= 0 ? args[specIdx + 1] : undefined;
    const summary = await deps.ledger.summary({ sessionId: deps.sessionId, specName });
    const label = specName ? `spec ${specName}` : `session ${deps.sessionId}`;
    emitAgentMessage(renderLedgerTable(summary, label));
  }

  // -- /budget extend <usd> --------------------------------------------------
  async function handleBudget(args: string[]): Promise<void> {
    const [sub, amountStr] = args;
    if (sub !== "extend" || !amountStr) {
      emitError("usage: /budget extend <usd>");
      return;
    }
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      emitError(`invalid amount: ${amountStr}`);
      return;
    }
    // Mutate in place — `opts.budgets` is the retained object shared with
    // whatever else holds a reference to it (e.g. the real ledger's config).
    opts.budgets.sessionUsd = (opts.budgets.sessionUsd ?? 0) + amount;
    emitAgentMessage(`session budget extended to $${opts.budgets.sessionUsd.toFixed(2)}`);
  }

  // -- /spec new|approve|design|tasks|run|status -----------------------------
  async function handleSpec(args: string[]): Promise<void> {
    const [sub, name, ...rest] = args;
    const specDeps = { specs: deps.specs, write: emitAgentMessage };
    if (sub === "status") {
      await runSpecStatus(specDeps, name);
      return;
    }
    if (!sub || !name) {
      emitError("usage: /spec new|approve|design|tasks|run|status <name> ...");
      return;
    }
    switch (sub) {
      case "new":
        await runSpecNew(specDeps, name, rest.join(" "));
        return;
      case "approve":
        await runSpecApprove(specDeps, name, rest[0]);
        return;
      case "design":
        await runSpecGenerate(specDeps, name, "design");
        return;
      case "tasks":
        await runSpecGenerate(specDeps, name, "tasks");
        return;
      case "run":
        await runSpecRunTask(specDeps, name, rest[0]);
        return;
      default:
        emitError(`unknown /spec subcommand: ${sub}`);
    }
  }

  // -- /steer init|list|use <name> -------------------------------------------
  async function handleSteer(args: string[]): Promise<void> {
    const [sub, name] = args;
    switch (sub) {
      case "init":
        await runSteerInit({
          cwd,
          templates: deps.steeringTemplates,
          sessionId: deps.sessionId,
          write: emitAgentMessage,
          isTTY: false, // in-session fill-in offer needs a TUI confirm flow not built yet — see NOTES.md
        });
        return;
      case "list": {
        const docs = await deps.steering.loadAll(cwd);
        emitAgentMessage(
          docs.length > 0
            ? docs.map((d) => `${d.name} (${d.inclusion}${d.imported ? ", imported" : ""})`).join("\n")
            : "(no steering docs — try /steer init)",
        );
        return;
      }
      case "use":
        if (!name) {
          emitError("usage: /steer use <name>");
          return;
        }
        if (!manualSteering.includes(name)) manualSteering.push(name);
        emitAgentMessage(`using steering doc "${name}" as manual context for future turns`);
        return;
      default:
        emitError(`unknown /steer subcommand: ${sub}`);
    }
  }

  // -- /hook run <name> --------------------------------------------------------
  async function handleHook(args: string[]): Promise<void> {
    const [sub, name] = args;
    if (sub !== "run" || !name) {
      emitError("usage: /hook run <name>");
      return;
    }
    const hook = deps.hooks.agentHooks().find((h) => h.name === name);
    if (!hook) {
      emitError(`hook not found: ${name}`);
      return;
    }
    const result = await deps.agent.run(
      {
        kind: "hook",
        prompt: hook.prompt,
        system: "You are Coxswain running an agent hook automation.",
        history: [],
        cwd,
        sessionId: deps.sessionId,
        userOverrideTier: hook.tier,
        maxTurns: 40,
      },
      (e) => bus.emit(e),
    );
    emitAgentMessage(result.finalText);
  }

  async function handleCommand(command: string, args: string[]): Promise<void> {
    switch (command) {
      case "model":
        return handleModel(args);
      case "context":
        return handleContext();
      case "ledger":
        return handleLedger(args);
      case "budget":
        return handleBudget(args);
      case "spec":
        return handleSpec(args);
      case "steer":
        return handleSteer(args);
      case "hook":
        return handleHook(args);
      default:
        emitError(`unknown command: /${command}`);
    }
  }

  function submitCommand(command: string, args: string[]): void {
    handleCommand(command, args).catch((err: unknown) => {
      emitError(errorMessage(err));
    });
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
        emitError(errorMessage(err));
      });
    },
    submitCommand,
    resolvePermission,
    interrupt,
  };
}
