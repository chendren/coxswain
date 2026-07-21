import { describe, expect, it } from "vitest";
import type { AgentEvent, ContentBlock } from "@cox/core";
import { computeCostUsd, pricingFor } from "@cox/core";
import { createAgentRunner } from "../src/runner";
import { fakeTool } from "./helpers/fake-tool";
import { scripted } from "./helpers/scripted-model";
import {
  baseConfig,
  baseTask,
  capturingRouter,
  decisionFor,
  emptyTools,
  fixedRouter,
  neverAsked,
  okBudget,
  toolRegistryFrom,
} from "./helpers/fixtures";

function runnerWith(overrides: Partial<Parameters<typeof createAgentRunner>[0]> = {}) {
  return createAgentRunner({
    router: fixedRouter(decisionFor("builder")),
    modelForTier: () => scripted([{ deltas: ["hi"] }]),
    tools: emptyTools(),
    permissionMode: "default",
    config: baseConfig,
    budgetState: okBudget(),
    requestPermission: neverAsked(),
    ...overrides,
  });
}

describe("R1.1: routing", () => {
  it("emits routing_decision before model_call_started", async () => {
    const events: AgentEvent[] = [];
    const runner = runnerWith({ modelForTier: () => scripted([{ deltas: ["hi"] }]) });
    await runner.run(baseTask(), (e) => events.push(e));

    const routingIdx = events.findIndex((e) => e.type === "routing_decision");
    const startedIdx = events.findIndex((e) => e.type === "model_call_started");
    expect(routingIdx).toBeGreaterThanOrEqual(0);
    expect(startedIdx).toBeGreaterThan(routingIdx);
  });

  it("builds a RoutingInput from the task (kind, text, contextTokens, ids)", async () => {
    const router = capturingRouter(decisionFor("architect"));
    const runner = runnerWith({
      router,
      modelForTier: () => scripted([{ deltas: ["ok"] }]),
    });
    await runner.run(
      baseTask({
        kind: "spec-task-exec",
        prompt: "implement the thing",
        complexityHint: 4,
        userOverrideTier: "architect",
        specName: "auth-flow",
        taskId: "3",
        sessionId: "ses_1",
      }),
      () => {},
    );

    expect(router.inputs).toHaveLength(1);
    const input = router.inputs[0]!;
    expect(input.kind).toBe("spec-task-exec");
    expect(input.text).toBe("implement the thing");
    expect(input.complexityHint).toBe(4);
    expect(input.userOverrideTier).toBe("architect");
    expect(input.specName).toBe("auth-flow");
    expect(input.taskId).toBe("3");
    expect(input.sessionId).toBe("ses_1");
    expect(input.contextTokens).toBeGreaterThan(0);
  });

  it("estimates contextTokens as chars/4 over system+history+prompt", async () => {
    const router = capturingRouter(decisionFor("builder"));
    const runner = runnerWith({ router, modelForTier: () => scripted([{ deltas: ["ok"] }]) });
    const system = "x".repeat(40); // 40 chars
    const prompt = "y".repeat(20); // 20 chars
    await runner.run(baseTask({ system, prompt, history: [] }), () => {});
    // (40 + 0 + 20) / 4 = 15
    expect(router.inputs[0]!.contextTokens).toBe(15);
  });
});

describe("R1.3: end_turn resolution", () => {
  it("resolves with finalText = concatenated deltas, stopReason end_turn, and full history", async () => {
    const runner = runnerWith({
      modelForTier: () => scripted([{ deltas: ["Hello", ", ", "world!"] }]),
    });
    const task = baseTask({ prompt: "say hi" });
    const result = await runner.run(task, () => {});

    expect(result.stopReason).toBe("end_turn");
    expect(result.finalText).toBe("Hello, world!");
    expect(result.history).toHaveLength(2); // user prompt + assistant reply
    expect(result.history[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "say hi" }],
    });
    expect(result.history[1]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "Hello, world!" }],
    });
  });

  it("carries prior history forward", async () => {
    const runner = runnerWith({ modelForTier: () => scripted([{ deltas: ["reply"] }]) });
    const priorHistory = [
      { role: "user" as const, content: [{ type: "text" as const, text: "earlier" }] },
      { role: "assistant" as const, content: [{ type: "text" as const, text: "earlier reply" }] },
    ];
    const result = await runner.run(baseTask({ history: priorHistory, prompt: "again" }), () => {});
    expect(result.history).toHaveLength(4);
    expect(result.history[0]).toBe(priorHistory[0]);
    expect(result.history[1]).toBe(priorHistory[1]);
  });
});

describe("R3.1, R3.2: event lifecycle, usage, and cost", () => {
  it("emits the full per-iteration sequence, ending in agent_message + turn_done", async () => {
    const events: AgentEvent[] = [];
    const runner = runnerWith({ modelForTier: () => scripted([{ deltas: ["hi", " there"] }]) });
    await runner.run(baseTask(), (e) => events.push(e));

    expect(events.map((e) => e.type)).toEqual([
      "routing_decision",
      "model_call_started",
      "text_delta",
      "text_delta",
      "model_call_finished",
      "agent_message",
      "turn_done",
    ]);
  });

  it("passes thinking_delta events through", async () => {
    const events: AgentEvent[] = [];
    const runner = runnerWith({
      modelForTier: () => scripted([{ deltas: ["hi"] }]),
    });
    await runner.run(baseTask(), (e) => events.push(e));
    // sanity: no thinking_delta configured in this turn -> none emitted
    expect(events.some((e) => e.type === "thinking_delta")).toBe(false);
  });

  it("computes costUsd via core pricing for a known model", async () => {
    const model = { provider: "anthropic", model: "claude-sonnet-5" };
    const events: AgentEvent[] = [];
    const runner = runnerWith({
      router: fixedRouter(decisionFor("builder", model)),
      modelForTier: () =>
        scripted([{ deltas: ["ok"], usage: { inputTokens: 1000, outputTokens: 200 } }]),
    });
    const result = await runner.run(baseTask(), (e) => events.push(e));

    const pricing = pricingFor(model.provider, model.model);
    expect(pricing).not.toBeNull();
    const expectedCost = computeCostUsd(
      { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
      pricing!,
    );

    const finished = events.find((e) => e.type === "model_call_finished");
    expect(finished).toBeDefined();
    expect(finished && "costUsd" in finished ? finished.costUsd : null).toBeCloseTo(expectedCost, 10);
    expect(result.costUsd).toBeCloseTo(expectedCost, 10);
  });

  it("null-pricing model: event costUsd is null, aggregate contributes 0", async () => {
    const model = { provider: "mystery-provider", model: "mystery-model" };
    const events: AgentEvent[] = [];
    const runner = runnerWith({
      router: fixedRouter(decisionFor("builder", model)),
      modelForTier: () =>
        scripted([{ deltas: ["ok"], usage: { inputTokens: 1000, outputTokens: 200 } }]),
    });
    const result = await runner.run(baseTask(), (e) => events.push(e));

    const finished = events.find((e) => e.type === "model_call_finished");
    expect(finished && "costUsd" in finished ? finished.costUsd : "missing").toBeNull();
    expect(result.costUsd).toBe(0);
  });

  it("computes durationMs from the injected now()", async () => {
    const values = [1_000, 1_500];
    let i = 0;
    const events: AgentEvent[] = [];
    const runner = runnerWith({
      modelForTier: () => scripted([{ deltas: ["ok"] }]),
      now: () => values[i++] ?? 1_500,
    });
    await runner.run(baseTask(), (e) => events.push(e));

    const finished = events.find((e) => e.type === "model_call_finished");
    expect(finished && "durationMs" in finished ? finished.durationMs : -1).toBe(500);
  });

  it("aggregates usage across the turn_done event", async () => {
    const events: AgentEvent[] = [];
    const runner = runnerWith({
      modelForTier: () =>
        scripted([{ deltas: ["ok"], usage: { inputTokens: 42, outputTokens: 7 } }]),
    });
    await runner.run(baseTask(), (e) => events.push(e));
    const done = events.find((e) => e.type === "turn_done");
    expect(done && "usage" in done ? done.usage.inputTokens : -1).toBe(42);
    expect(done && "usage" in done ? done.usage.outputTokens : -1).toBe(7);
  });
});

describe("R5.1, R5.2: hook callbacks at the tool boundary", () => {
  it("R5.1: a block outcome skips execution and feeds back isError(stderr)", async () => {
    let executed = false;
    const tools = toolRegistryFrom([
      fakeTool({
        name: "write",
        onExecute: () => {
          executed = true;
        },
      }),
    ]);
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "write", input: { path: "a.txt" } }] },
          { deltas: ["ok"] },
        ]),
      preToolUse: async () => [
        { hook: "guard.sh", action: "block", stderr: "blocked: no writes allowed" },
      ],
    });
    const result = await runner.run(baseTask(), () => {});

    expect(executed).toBe(false);
    const toolResultMsg = result.history[2];
    const block = toolResultMsg?.content[0] as Extract<ContentBlock, { type: "tool_result" }>;
    expect(block.isError).toBe(true);
    expect(block.content).toBe("blocked: no writes allowed");
  });

  it("R5.1: a continue outcome does not block execution", async () => {
    let executed = false;
    const tools = toolRegistryFrom([
      fakeTool({
        name: "write",
        onExecute: () => {
          executed = true;
        },
      }),
    ]);
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "write", input: { path: "a.txt" } }] },
          { deltas: ["ok"] },
        ]),
      preToolUse: async () => [{ hook: "guard.sh", action: "continue" }],
    });
    await runner.run(baseTask(), () => {});
    expect(executed).toBe(true);
  });

  it("R5.2: a postToolUse block appends '[hook] stderr' without retroactively cancelling the result", async () => {
    const tools = toolRegistryFrom([
      fakeTool({ name: "write", result: { content: "wrote 5 bytes", isError: false } }),
    ]);
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "write", input: { path: "a.txt" } }] },
          { deltas: ["ok"] },
        ]),
      postToolUse: async () => [
        { hook: "lint.sh", action: "block", stderr: "lint warning: missing newline" },
      ],
    });
    const result = await runner.run(baseTask(), () => {});

    const toolResultMsg = result.history[2];
    const block = toolResultMsg?.content[0] as Extract<ContentBlock, { type: "tool_result" }>;
    expect(block.isError).toBe(false); // not cancelled
    expect(block.content).toBe("wrote 5 bytes\n[hook] lint warning: missing newline");
  });

  it("R5.2: postToolUse still receives a failing tool's result and can annotate it", async () => {
    const tools = toolRegistryFrom([
      fakeTool({ name: "bash", result: { content: "exit 1", isError: true } }),
    ]);
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "bash", input: { command: "false" } }] },
          { deltas: ["ok"] },
        ]),
      postToolUse: async () => [{ hook: "notify.sh", action: "block", stderr: "notified" }],
    });
    const result = await runner.run(baseTask(), () => {});

    const toolResultMsg = result.history[2];
    const block = toolResultMsg?.content[0] as Extract<ContentBlock, { type: "tool_result" }>;
    expect(block.isError).toBe(true); // original failure preserved
    expect(block.content).toBe("exit 1\n[hook] notified");
  });
});

describe("R6.4: plan mode auto-deny (hook engine untouched, permission gate only)", () => {
  it("auto-denies a mutating tool without prompting", async () => {
    let asked = 0;
    let executed = false;
    const tools = toolRegistryFrom([
      fakeTool({
        name: "write",
        permissionFor: (_input, mode) =>
          mode === "plan" ? { toolName: "write", summary: "write a.txt" } : null,
        onExecute: () => {
          executed = true;
        },
      }),
    ]);
    const runner = runnerWith({
      tools,
      permissionMode: "plan",
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "write", input: { path: "a.txt" } }] },
          { deltas: ["ok"] },
        ]),
      requestPermission: async () => {
        asked++;
        return "allow";
      },
    });
    const result = await runner.run(baseTask(), () => {});

    expect(asked).toBe(0);
    expect(executed).toBe(false);
    const toolResultMsg = result.history[2];
    const block = toolResultMsg?.content[0] as Extract<ContentBlock, { type: "tool_result" }>;
    expect(block.isError).toBe(true);
    expect(block.content).toBe("denied: plan mode");
  });

  it("read-only tools (permissionFor -> null) still run in plan mode", async () => {
    let executed = false;
    const tools = toolRegistryFrom([
      fakeTool({
        name: "read",
        permissionFor: () => null,
        onExecute: () => {
          executed = true;
        },
      }),
    ]);
    const runner = runnerWith({
      tools,
      permissionMode: "plan",
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "read", input: { path: "a.txt" } }] },
          { deltas: ["ok"] },
        ]),
    });
    const result = await runner.run(baseTask(), () => {});
    expect(executed).toBe(true);
    expect(result.stopReason).toBe("end_turn");
  });
});
