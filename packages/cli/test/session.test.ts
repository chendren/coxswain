import { describe, expect, it, vi } from "vitest";
import { EventBus, configSchema } from "@cox/core";
import type {
  AgentEvent,
  AgentRunner,
  AgentTask,
  ChatMessage,
  HookEngine,
  HookOutcome,
  HookPayload,
  Ledger,
  LedgerEntry,
  PermissionDecision,
  SteeringSelection,
  SteeringStore,
} from "@cox/core";
import type { LoadedDeps } from "../src/deps";
import { createSessionController } from "../src/session";
import { attachLedgerWriter } from "../src/wire";
import { createSnapshotStore } from "../src/snapshot";

// ---------------------------------------------------------------------------
// Local fakes for every engine (design.md: NotWired/loadDeps paths untouched).
// ---------------------------------------------------------------------------

function fakeHooks(outcomes: HookOutcome[] = []): HookEngine & { firedEvents: HookPayload[] } {
  const firedEvents: HookPayload[] = [];
  return {
    firedEvents,
    async fire(payload) {
      firedEvents.push(payload);
      return outcomes;
    },
    agentHooks() {
      return [];
    },
  };
}

function fakeSteering(selection?: Partial<SteeringSelection>): SteeringStore {
  return {
    async loadAll() {
      return [];
    },
    select() {
      return {
        systemDocs: selection?.systemDocs ?? [],
        contextDocs: selection?.contextDocs ?? [],
        totalTokens: selection?.totalTokens ?? 0,
      };
    },
  };
}

interface FakeAgentScript {
  finalText?: string;
  history?: ChatMessage[];
}

function fakeAgent(script: FakeAgentScript = {}): AgentRunner & { calls: AgentTask[]; signals: (AbortSignal | undefined)[] } {
  const calls: AgentTask[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  return {
    calls,
    signals,
    async run(task, onEvent, signal) {
      calls.push(task);
      signals.push(signal);
      onEvent({ type: "turn_done", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0 });
      return {
        finalText: script.finalText ?? "done",
        history: script.history ?? [...task.history, { role: "user", content: [{ type: "text", text: task.prompt }] }],
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
        stopReason: "end_turn",
      };
    },
  };
}

function minimalLoadedDeps(over: Partial<LoadedDeps>): LoadedDeps {
  const notUsed = new Proxy(
    {},
    {
      get() {
        throw new Error("unexpected access on an engine not needed by this test");
      },
    },
  );
  return {
    registry: notUsed as never,
    router: notUsed as never,
    ledger: notUsed as never,
    agent: fakeAgent(),
    specs: notUsed as never,
    steering: fakeSteering(),
    hooks: fakeHooks(),
    tools: notUsed as never,
    sessionId: "ses_test",
    resolvePermission: vi.fn(),
    tierModel: () => notUsed as never,
    ...over,
  };
}

const cfg = configSchema.parse({});

describe("R8.4: session.ts submitPrompt", () => {
  it("emits user_prompt with the raw text, then calls agent.run with kind:chat and the assembled system prompt", async () => {
    const bus = new EventBus();
    const events: AgentEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const agent = fakeAgent();
    const deps = minimalLoadedDeps({ agent });

    const controller = createSessionController({
      deps,
      bus,
      cfg,
      cwd: "/proj",
      snapshot: createSnapshotStore({ sessionId: "ses_test", budgets: cfg.budgets }),
      budgets: cfg.budgets,
    });

    controller.submitPrompt("add tests");
    await new Promise((r) => setTimeout(r, 0));

    expect(events[0]).toEqual({ type: "user_prompt", text: "add tests" });
    expect(agent.calls).toHaveLength(1);
    const task = agent.calls[0]!;
    expect(task.kind).toBe("chat");
    expect(task.prompt).toBe("add tests");
    expect(task.system).toContain("Coxswain");
    expect(task.cwd).toBe("/proj");
    expect(task.sessionId).toBe("ses_test");
    expect(task.maxTurns).toBe(40);
  });

  it("hook gate: a UserPromptSubmit block aborts the turn before agent.run is called", async () => {
    const bus = new EventBus();
    const events: AgentEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const agent = fakeAgent();
    const hooks = fakeHooks([{ hook: "guard.sh", action: "block", stderr: "no prompts after 5pm" }]);
    const deps = minimalLoadedDeps({ agent, hooks });

    const controller = createSessionController({
      deps,
      bus,
      cfg,
      cwd: "/proj",
      snapshot: createSnapshotStore({ sessionId: "ses_test", budgets: cfg.budgets }),
      budgets: cfg.budgets,
    });

    controller.submitPrompt("do the thing");
    await new Promise((r) => setTimeout(r, 0));

    expect(agent.calls).toHaveLength(0);
    expect(events.some((e) => e.type === "hook_fired")).toBe(true);
  });

  it("stable-first steering assembly: always-docs join the system prompt, contextDocs prefix the user content", async () => {
    const bus = new EventBus();
    const agent = fakeAgent();
    const steering = fakeSteering({
      systemDocs: [
        { name: "tech", path: "/x", inclusion: "always", body: "Uses TypeScript.", tokens: 3, imported: false },
      ],
      contextDocs: [
        { name: "auth", path: "/y", inclusion: "fileMatch", body: "Auth uses JWT.", tokens: 3, imported: false },
      ],
    });
    const deps = minimalLoadedDeps({ agent, steering });

    const controller = createSessionController({
      deps,
      bus,
      cfg,
      cwd: "/proj",
      snapshot: createSnapshotStore({ sessionId: "ses_test", budgets: cfg.budgets }),
      budgets: cfg.budgets,
    });

    controller.submitPrompt("fix the login bug");
    await new Promise((r) => setTimeout(r, 0));

    const task = agent.calls[0]!;
    expect(task.system).toContain("Uses TypeScript.");
    expect(task.system.indexOf("Coxswain")).toBeLessThan(task.system.indexOf("Uses TypeScript."));
    expect(task.prompt).toContain('<steering name="auth">Auth uses JWT.</steering>');
    expect(task.prompt.endsWith("fix the login bug")).toBe(true);
  });

  it("history retention: the history returned by one turn seeds the next turn's task.history", async () => {
    const bus = new EventBus();
    const firstHistory: ChatMessage[] = [{ role: "user", content: [{ type: "text", text: "add tests" }] }];
    const agent = fakeAgent({ history: firstHistory });
    const deps = minimalLoadedDeps({ agent });

    const controller = createSessionController({
      deps,
      bus,
      cfg,
      cwd: "/proj",
      snapshot: createSnapshotStore({ sessionId: "ses_test", budgets: cfg.budgets }),
      budgets: cfg.budgets,
    });

    controller.submitPrompt("add tests");
    await new Promise((r) => setTimeout(r, 0));
    expect(agent.calls[0]!.history).toEqual([]);

    controller.submitPrompt("now run them");
    await new Promise((r) => setTimeout(r, 0));
    expect(agent.calls[1]!.history).toBe(firstHistory);
  });

  it("interrupt() aborts the AbortSignal passed to agent.run", async () => {
    const bus = new EventBus();
    let capturedSignal: AbortSignal | undefined;
    const agent: AgentRunner = {
      run(task, onEvent, signal) {
        capturedSignal = signal;
        return new Promise(() => {}); // never resolves — simulate an in-flight turn
      },
    };
    const deps = minimalLoadedDeps({ agent });

    const controller = createSessionController({
      deps,
      bus,
      cfg,
      cwd: "/proj",
      snapshot: createSnapshotStore({ sessionId: "ses_test", budgets: cfg.budgets }),
      budgets: cfg.budgets,
    });

    controller.submitPrompt("long task");
    await new Promise((r) => setTimeout(r, 0));
    expect(capturedSignal?.aborted).toBe(false);
    controller.interrupt();
    expect(capturedSignal?.aborted).toBe(true);
  });
});

describe("R8.4: resolvePermission bridging", () => {
  it("forwards the decision to deps.resolvePermission", () => {
    const bus = new EventBus();
    const resolvePermission = vi.fn();
    const deps = minimalLoadedDeps({ resolvePermission });
    const controller = createSessionController({
      deps,
      bus,
      cfg,
      cwd: "/proj",
      snapshot: createSnapshotStore({ sessionId: "ses_test", budgets: cfg.budgets }),
      budgets: cfg.budgets,
    });
    controller.resolvePermission("allow");
    expect(resolvePermission).toHaveBeenCalledTimes(1);
    expect(resolvePermission).toHaveBeenCalledWith("allow");
  });
});

describe("R8.3: attachLedgerWriter", () => {
  function fakeLedger(): { ledger: Ledger; entries: LedgerEntry[]; nextBudgetState: { level: "ok" | "warn" | "exceeded"; spentUsd: number; spentTokens: number } } {
    const entries: LedgerEntry[] = [];
    const state = { level: "ok" as const, spentUsd: 0, spentTokens: 0 };
    const ledger: Ledger = {
      async record(e) {
        entries.push(e);
      },
      async query() {
        return [];
      },
      async summary() {
        return {
          entries: 0,
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          costUsd: 0,
          byTier: {},
          byModel: {},
          baselineArchitectCostUsd: 0,
        };
      },
      async budgetState() {
        return state;
      },
    };
    return { ledger, entries, nextBudgetState: state };
  }

  it("pairs routing_decision + model_call_finished into one LedgerEntry", async () => {
    const bus = new EventBus();
    const { ledger, entries } = fakeLedger();
    attachLedgerWriter({ bus, ledger, sessionId: "ses_test" });

    bus.emit({
      type: "routing_decision",
      kind: "chat",
      decision: {
        tier: "builder",
        model: { provider: "anthropic", model: "claude-sonnet-5" },
        reasons: ["classified task-type=feature"],
        estimate: { inputTokens: 100, estOutputTokens: 50, estCostUsd: 0.01 },
      },
    });
    bus.emit({
      type: "model_call_finished",
      model: { provider: "anthropic", model: "claude-sonnet-5" },
      usage: { inputTokens: 110, outputTokens: 55, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0.012,
      stopReason: "end_turn",
      durationMs: 500,
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.sessionId).toBe("ses_test");
    expect(entry.kind).toBe("chat");
    expect(entry.tier).toBe("builder");
    expect(entry.routingReasons).toEqual(["classified task-type=feature"]);
    expect(entry.usage).toEqual({ inputTokens: 110, outputTokens: 55, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(entry.costUsd).toBe(0.012);
    expect(entry.durationMs).toBe(500);
  });

  it("does not write an entry for model_call_finished with no preceding routing_decision", async () => {
    const bus = new EventBus();
    const { ledger, entries } = fakeLedger();
    attachLedgerWriter({ bus, ledger, sessionId: "ses_test" });

    bus.emit({
      type: "model_call_finished",
      model: { provider: "anthropic", model: "claude-sonnet-5" },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0,
      stopReason: "end_turn",
      durationMs: 1,
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(entries).toHaveLength(0);
  });

  it("emits budget_alert when the resulting budget level is not ok", async () => {
    const bus = new EventBus();
    const events: AgentEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const { ledger, nextBudgetState } = fakeLedger();
    nextBudgetState.level = "warn";
    nextBudgetState.spentUsd = 4.2;
    attachLedgerWriter({ bus, ledger, sessionId: "ses_test" });

    bus.emit({
      type: "routing_decision",
      kind: "chat",
      decision: {
        tier: "builder",
        model: { provider: "anthropic", model: "claude-sonnet-5" },
        reasons: ["r"],
        estimate: { inputTokens: 1, estOutputTokens: 1, estCostUsd: 0.01 },
      },
    });
    bus.emit({
      type: "model_call_finished",
      model: { provider: "anthropic", model: "claude-sonnet-5" },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 4.2,
      stopReason: "end_turn",
      durationMs: 1,
    });
    await new Promise((r) => setTimeout(r, 0));

    const alert = events.find((e) => e.type === "budget_alert");
    expect(alert).toBeDefined();
    expect(alert && alert.type === "budget_alert" && alert.state.level).toBe("warn");
  });

  it("does not emit budget_alert when the level stays ok", async () => {
    const bus = new EventBus();
    const events: AgentEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const { ledger } = fakeLedger();
    attachLedgerWriter({ bus, ledger, sessionId: "ses_test" });

    bus.emit({
      type: "routing_decision",
      kind: "chat",
      decision: {
        tier: "scout",
        model: { provider: "anthropic", model: "claude-haiku-4-5" },
        reasons: ["r"],
        estimate: { inputTokens: 1, estOutputTokens: 1, estCostUsd: 0.001 },
      },
    });
    bus.emit({
      type: "model_call_finished",
      model: { provider: "anthropic", model: "claude-haiku-4-5" },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0.001,
      stopReason: "end_turn",
      durationMs: 1,
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(events.some((e) => e.type === "budget_alert")).toBe(false);
  });
});
