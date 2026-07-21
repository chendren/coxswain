import { describe, expect, it } from "vitest";
import { configSchema } from "@cox/core";
import type { AgentEvent, ChatModel, StreamEvent } from "@cox/core";
import { createAgentRunner } from "../src/runner";
import { fakeTool } from "./helpers/fake-tool";
import { scripted } from "./helpers/scripted-model";
import {
  baseConfig,
  baseTask,
  decisionFor,
  fixedRouter,
  neverAsked,
  okBudget,
  toolRegistryFrom,
} from "./helpers/fixtures";

function runnerWith(overrides: Partial<Parameters<typeof createAgentRunner>[0]> = {}) {
  return createAgentRunner({
    router: fixedRouter(decisionFor("builder")),
    modelForTier: () => scripted([{ deltas: ["hi"] }]),
    tools: toolRegistryFrom([]),
    permissionMode: "default",
    config: baseConfig,
    budgetState: okBudget(),
    requestPermission: neverAsked(),
    ...overrides,
  });
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("R1.4: max_turns", () => {
  it("stops with max_turns once the iteration cap is reached", async () => {
    const tools = toolRegistryFrom([fakeTool({ name: "noop", result: { content: "ok", isError: false } })]);
    // every turn is tool_use -> never reaches end_turn on its own
    const model = scripted([{ toolUses: [{ id: "1", name: "noop", input: {} }] }]);
    const runner = runnerWith({ tools, modelForTier: () => model });
    const result = await runner.run(baseTask({ maxTurns: 3 }), () => {});

    expect(result.stopReason).toBe("max_turns");
    expect(model.requests).toHaveLength(3);
  });

  it("defaults maxTurns to 40 when the task doesn't specify one", async () => {
    const tools = toolRegistryFrom([fakeTool({ name: "noop", result: { content: "ok", isError: false } })]);
    const model = scripted([{ toolUses: [{ id: "1", name: "noop", input: {} }] }]);
    const runner = runnerWith({ tools, modelForTier: () => model });
    const result = await runner.run(baseTask(), () => {});

    expect(result.stopReason).toBe("max_turns");
    expect(model.requests).toHaveLength(40);
  });
});

describe("R1.5: max_tokens and refusal stop reasons", () => {
  it("stops immediately on max_tokens, verbatim, without entering a tool loop", async () => {
    const model = scripted([{ deltas: ["truncated respon"], stopReason: "max_tokens" }]);
    const runner = runnerWith({ modelForTier: () => model });
    const result = await runner.run(baseTask(), () => {});

    expect(result.stopReason).toBe("max_tokens");
    expect(result.finalText).toBe("truncated respon");
    expect(model.requests).toHaveLength(1);
  });

  it("stops immediately on refusal, verbatim", async () => {
    const model = scripted([{ deltas: ["I can't help with that"], stopReason: "refusal" }]);
    const runner = runnerWith({ modelForTier: () => model });
    const result = await runner.run(baseTask(), () => {});

    expect(result.stopReason).toBe("refusal");
    expect(result.finalText).toBe("I can't help with that");
    expect(model.requests).toHaveLength(1);
  });
});

describe("R7.1: budget hard stop", () => {
  it("exceeded + hardStop stops before the next model call and emits budget_alert", async () => {
    const events: AgentEvent[] = [];
    const model = scripted([{ deltas: ["should not run"] }]);
    const config = configSchema.parse({ budgets: { hardStop: true } });
    const runner = runnerWith({
      modelForTier: () => model,
      config,
      budgetState: async () => ({ level: "exceeded", spentUsd: 10, spentTokens: 100, limitUsd: 5 }),
    });
    const result = await runner.run(baseTask(), (e) => events.push(e));

    expect(result.stopReason).toBe("budget_stop");
    expect(model.requests).toHaveLength(0);
    expect(events.some((e) => e.type === "budget_alert")).toBe(true);
  });

  it("exceeded WITHOUT hardStop does not stop the run", async () => {
    const config = configSchema.parse({ budgets: { hardStop: false } });
    const runner = runnerWith({
      modelForTier: () => scripted([{ deltas: ["still running"] }]),
      config,
      budgetState: async () => ({ level: "exceeded", spentUsd: 10, spentTokens: 100 }),
    });
    const result = await runner.run(baseTask(), () => {});

    expect(result.stopReason).toBe("end_turn");
    expect(result.finalText).toBe("still running");
  });
});

describe("R7.2: budget_alert emitted once per level change", () => {
  it("emits exactly once across a multi-call run when the level stays at warn", async () => {
    const events: AgentEvent[] = [];
    const tools = toolRegistryFrom([fakeTool({ name: "noop", result: { content: "ok", isError: false } })]);
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "noop", input: {} }] },
          { toolUses: [{ id: "2", name: "noop", input: {} }] },
          { toolUses: [{ id: "3", name: "noop", input: {} }] },
          { deltas: ["done"] },
        ]),
      budgetState: async () => ({ level: "warn", spentUsd: 4, spentTokens: 100, limitUsd: 5 }),
    });
    const result = await runner.run(baseTask(), (e) => events.push(e));

    expect(result.stopReason).toBe("end_turn");
    expect(events.filter((e) => e.type === "budget_alert")).toHaveLength(1);
  });

  it("emits again if the level changes a second time (ok -> warn -> exceeded, hardStop off)", async () => {
    const events: AgentEvent[] = [];
    const tools = toolRegistryFrom([fakeTool({ name: "noop", result: { content: "ok", isError: false } })]);
    const levels = ["ok", "warn", "exceeded"] as const;
    let i = 0;
    const config = configSchema.parse({ budgets: { hardStop: false } });
    const runner = runnerWith({
      tools,
      config,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "noop", input: {} }] },
          { toolUses: [{ id: "2", name: "noop", input: {} }] },
          { deltas: ["done"] },
        ]),
      budgetState: async () => ({
        level: levels[Math.min(i++, levels.length - 1)]!,
        spentUsd: 1,
        spentTokens: 1,
      }),
    });
    await runner.run(baseTask(), (e) => events.push(e));

    expect(events.filter((e) => e.type === "budget_alert")).toHaveLength(2); // warn, then exceeded
  });
});

describe("R7.3: abort", () => {
  it("aborts before the first model call when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const model = scripted([{ deltas: ["should not run"] }]);
    const runner = runnerWith({ modelForTier: () => model });
    const result = await runner.run(baseTask(), () => {}, controller.signal);

    expect(result.stopReason).toBe("aborted");
    expect(model.requests).toHaveLength(0);
  });

  it("passes the signal into ChatModel.stream", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const model: ChatModel = {
      ref: { provider: "test", model: "sig-check" },
      estimateTokens: () => 0,
      stream: (_req, signal) => {
        receivedSignal = signal;
        return (async function* (): AsyncGenerator<StreamEvent> {
          yield { type: "text_delta", text: "ok" };
          yield { type: "usage", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };
          yield { type: "done", stopReason: "end_turn" };
        })();
      },
    };
    const runner = runnerWith({ modelForTier: () => model });
    await runner.run(baseTask(), () => {}, controller.signal);

    expect(receivedSignal).toBe(controller.signal);
  });

  it("stops with 'aborted' when the signal fires mid-stream, deterministically synchronized", async () => {
    const controller = new AbortController();
    const reachedGate = deferred<void>();
    const releaseGate = deferred<void>();

    async function* gen(signal?: AbortSignal): AsyncGenerator<StreamEvent> {
      yield { type: "text_delta", text: "partial" };
      reachedGate.resolve();
      await releaseGate.promise;
      if (signal?.aborted) {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }
      yield { type: "text_delta", text: "more" }; // must not be reached
    }

    const model: ChatModel = {
      ref: { provider: "test", model: "abort-mid" },
      estimateTokens: () => 0,
      stream: (_req, signal) => gen(signal),
    };

    const events: AgentEvent[] = [];
    const runner = runnerWith({ modelForTier: () => model });
    const runPromise = runner.run(baseTask(), (e) => events.push(e), controller.signal);

    await reachedGate.promise; // generator has yielded "partial" and is now paused
    controller.abort();
    releaseGate.resolve();

    const result = await runPromise;
    expect(result.stopReason).toBe("aborted");
    expect(events.filter((e) => e.type === "text_delta")).toHaveLength(1); // only "partial"
    expect(events.some((e) => e.type === "model_call_finished")).toBe(false); // never finished normally
  });
});
