import { describe, expect, it } from "vitest";
import { configSchema } from "@cox/core";
import type { AgentEvent, EscalationSignal, RoutingDecision, RoutingInput } from "@cox/core";
import { createAgentRunner } from "../src/runner";
import { createSignalTracker } from "../src/escalation";
import { fakeTool } from "./helpers/fake-tool";
import { scripted } from "./helpers/scripted-model";
import { baseConfig, baseTask, decisionFor, neverAsked, okBudget, toolRegistryFrom } from "./helpers/fixtures";

describe("SignalTracker (R4.1)", () => {
  it("fires tool_error_streak exactly when the consecutive isError streak reaches the threshold", () => {
    const tracker = createSignalTracker({ toolErrorStreak: 3 });
    tracker.record({ name: "bash", input: { a: 1 } }, { isError: true });
    tracker.record({ name: "bash", input: { a: 2 } }, { isError: true });
    expect(tracker.drainNew()).toEqual([]); // streak=2, not yet
    tracker.record({ name: "bash", input: { a: 3 } }, { isError: true });
    expect(tracker.drainNew()).toEqual([{ type: "tool_error_streak", count: 3 }]);
  });

  it("resets the streak on any success", () => {
    const tracker = createSignalTracker({ toolErrorStreak: 3 });
    tracker.record({ name: "bash", input: { a: 1 } }, { isError: true });
    tracker.record({ name: "bash", input: { a: 2 } }, { isError: true });
    tracker.record({ name: "bash", input: { a: 3 } }, { isError: false }); // reset
    tracker.record({ name: "bash", input: { a: 4 } }, { isError: true });
    tracker.record({ name: "bash", input: { a: 5 } }, { isError: true });
    expect(tracker.drainNew()).toEqual([]); // only streak of 2 since the reset
  });

  it("is edge-triggered: does not re-fire past the threshold without an intervening reset", () => {
    const tracker = createSignalTracker({ toolErrorStreak: 2 });
    tracker.record({ name: "bash", input: { a: 1 } }, { isError: true });
    tracker.record({ name: "bash", input: { a: 2 } }, { isError: true }); // streak=2, fires
    tracker.record({ name: "bash", input: { a: 3 } }, { isError: true }); // streak=3, no re-fire
    tracker.record({ name: "bash", input: { a: 4 } }, { isError: true }); // streak=4, no re-fire
    expect(tracker.drainNew()).toEqual([{ type: "tool_error_streak", count: 2 }]);
  });

  it("fires again after a reset and a fresh climb to the threshold", () => {
    const tracker = createSignalTracker({ toolErrorStreak: 2 });
    tracker.record({ name: "bash", input: { a: 1 } }, { isError: true });
    tracker.record({ name: "bash", input: { a: 2 } }, { isError: true }); // fires
    expect(tracker.drainNew()).toHaveLength(1);
    tracker.record({ name: "bash", input: { a: 3 } }, { isError: false }); // reset
    tracker.record({ name: "bash", input: { a: 4 } }, { isError: true });
    tracker.record({ name: "bash", input: { a: 5 } }, { isError: true }); // fires again
    expect(tracker.drainNew()).toEqual([{ type: "tool_error_streak", count: 2 }]);
  });
});

describe("SignalTracker (R4.2)", () => {
  it("fires model_stuck when name + JSON-equal input repeats consecutively", () => {
    const tracker = createSignalTracker({ toolErrorStreak: 99 });
    tracker.record({ name: "read", input: { path: "a.ts" } }, { isError: false });
    tracker.record({ name: "read", input: { path: "a.ts" } }, { isError: false });
    expect(tracker.drainNew()).toEqual([{ type: "model_stuck", evidence: "read" }]);
  });

  it("input equality is key-order independent (JSON-equal, not string-equal)", () => {
    const tracker = createSignalTracker({ toolErrorStreak: 99 });
    tracker.record({ name: "grep", input: { pattern: "x", glob: "*.ts" } }, { isError: false });
    tracker.record({ name: "grep", input: { glob: "*.ts", pattern: "x" } }, { isError: false });
    expect(tracker.drainNew()).toEqual([{ type: "model_stuck", evidence: "grep" }]);
  });

  it("does not fire when the input differs", () => {
    const tracker = createSignalTracker({ toolErrorStreak: 99 });
    tracker.record({ name: "read", input: { path: "a.ts" } }, { isError: false });
    tracker.record({ name: "read", input: { path: "b.ts" } }, { isError: false });
    expect(tracker.drainNew()).toEqual([]);
  });

  it("does not fire when the tool name differs, even with the same input", () => {
    const tracker = createSignalTracker({ toolErrorStreak: 99 });
    tracker.record({ name: "read", input: { path: "a.ts" } }, { isError: false });
    tracker.record({ name: "grep", input: { path: "a.ts" } }, { isError: false });
    expect(tracker.drainNew()).toEqual([]);
  });

  it("does not fire for a third call identical to the first but not the second", () => {
    const tracker = createSignalTracker({ toolErrorStreak: 99 });
    tracker.record({ name: "read", input: { path: "a.ts" } }, { isError: false });
    tracker.record({ name: "read", input: { path: "b.ts" } }, { isError: false });
    tracker.record({ name: "read", input: { path: "a.ts" } }, { isError: false });
    expect(tracker.drainNew()).toEqual([]); // only "consecutive" pairs count
  });
});

describe("SignalTracker: drainNew", () => {
  it("clears signals after draining", () => {
    const tracker = createSignalTracker({ toolErrorStreak: 1 });
    tracker.record({ name: "bash", input: {} }, { isError: true });
    expect(tracker.drainNew()).toHaveLength(1);
    expect(tracker.drainNew()).toEqual([]);
  });
});

describe("R4.3: escalation swap via Router.reconsider", () => {
  it("calls reconsider with the accumulated signals, swaps model, and later requests hit the new model", async () => {
    const builderDecision = decisionFor("builder", { provider: "test", model: "builder-1" });
    const architectDecision = decisionFor("architect", { provider: "test", model: "architect-1" });

    const reconsiderCalls: { current: RoutingDecision; signals: EscalationSignal[] }[] = [];
    const router = {
      route: async (_input: RoutingInput) => builderDecision,
      reconsider: async (current: RoutingDecision, _input: RoutingInput, signals: EscalationSignal[]) => {
        reconsiderCalls.push({ current, signals });
        return architectDecision;
      },
    };

    const modelB = scripted([{ toolUses: [{ id: "1", name: "bash", input: { command: "flaky" } }] }]);
    const modelA = scripted([{ deltas: ["escalated response"] }]);
    const tools = toolRegistryFrom([fakeTool({ name: "bash", result: { content: "boom", isError: true } })]);
    const config = configSchema.parse({ routing: { escalation: { toolErrorStreak: 1 } } });

    const events: AgentEvent[] = [];
    const runner = createAgentRunner({
      router,
      modelForTier: (tier) => (tier === "builder" ? modelB : modelA),
      tools,
      permissionMode: "default",
      config,
      budgetState: okBudget(),
      requestPermission: neverAsked(),
    });

    const result = await runner.run(baseTask(), (e) => events.push(e));

    expect(result.stopReason).toBe("end_turn");
    expect(result.finalText).toBe("escalated response");

    expect(reconsiderCalls).toHaveLength(1);
    expect(reconsiderCalls[0]!.current.tier).toBe("builder");
    expect(reconsiderCalls[0]!.signals).toEqual([{ type: "tool_error_streak", count: 1 }]);

    expect(modelB.requests).toHaveLength(1); // only the pre-escalation call
    expect(modelA.requests).toHaveLength(1); // the post-escalation call landed here

    const escalationEvent = events.find((e) => e.type === "escalation");
    expect(escalationEvent).toMatchObject({ type: "escalation", from: "builder", to: "architect" });

    const routingDecisions = events.filter((e) => e.type === "routing_decision");
    expect(routingDecisions).toHaveLength(2);
    expect(routingDecisions[1]).toMatchObject({ type: "routing_decision", decision: architectDecision });

    const escalationIdx = events.indexOf(escalationEvent!);
    const secondRoutingIdx = events.indexOf(routingDecisions[1]!);
    expect(escalationIdx).toBeLessThan(secondRoutingIdx);
  });

  it("keeps history intact across the model swap", async () => {
    const builderDecision = decisionFor("builder", { provider: "test", model: "builder-1" });
    const architectDecision = decisionFor("architect", { provider: "test", model: "architect-1" });
    const router = { route: async () => builderDecision, reconsider: async () => architectDecision };
    const modelB = scripted([{ toolUses: [{ id: "1", name: "bash", input: {} }] }]);
    const modelA = scripted([{ deltas: ["ok"] }]);
    const tools = toolRegistryFrom([fakeTool({ name: "bash", result: { content: "boom", isError: true } })]);
    const config = configSchema.parse({ routing: { escalation: { toolErrorStreak: 1 } } });

    const runner = createAgentRunner({
      router,
      modelForTier: (tier) => (tier === "builder" ? modelB : modelA),
      tools,
      permissionMode: "default",
      config,
      budgetState: okBudget(),
      requestPermission: neverAsked(),
    });
    const result = await runner.run(baseTask({ prompt: "fix the flaky test" }), () => {});

    expect(result.history[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "fix the flaky test" }],
    });
  });

  it("does not call reconsider when no signals accumulate", async () => {
    let reconsiderCalled = false;
    const router = {
      route: async () => decisionFor("builder"),
      reconsider: async () => {
        reconsiderCalled = true;
        return null;
      },
    };
    const tools = toolRegistryFrom([fakeTool({ name: "read", result: { content: "ok", isError: false } })]);
    const runner = createAgentRunner({
      router,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "read", input: { path: "a" } }] },
          { deltas: ["done"] },
        ]),
      tools,
      permissionMode: "default",
      config: baseConfig,
      budgetState: okBudget(),
      requestPermission: neverAsked(),
    });
    await runner.run(baseTask(), () => {});
    expect(reconsiderCalled).toBe(false);
  });

  it("respects routing.escalation.enabled = false (no reconsider call at all)", async () => {
    let reconsiderCalled = false;
    const router = {
      route: async () => decisionFor("builder"),
      reconsider: async () => {
        reconsiderCalled = true;
        return decisionFor("architect");
      },
    };
    const tools = toolRegistryFrom([fakeTool({ name: "bash", result: { content: "boom", isError: true } })]);
    const config = configSchema.parse({ routing: { escalation: { enabled: false, toolErrorStreak: 1 } } });
    const runner = createAgentRunner({
      router,
      modelForTier: () =>
        scripted([{ toolUses: [{ id: "1", name: "bash", input: {} }] }, { deltas: ["done"] }]),
      tools,
      permissionMode: "default",
      config,
      budgetState: okBudget(),
      requestPermission: neverAsked(),
    });
    await runner.run(baseTask(), () => {});
    expect(reconsiderCalled).toBe(false);
  });

  it("a null reconsider result keeps the current decision and model", async () => {
    const builderDecision = decisionFor("builder", { provider: "test", model: "builder-1" });
    const router = { route: async () => builderDecision, reconsider: async () => null };
    const modelB = scripted([
      { toolUses: [{ id: "1", name: "bash", input: {} }] },
      { deltas: ["still on builder"] },
    ]);
    const tools = toolRegistryFrom([fakeTool({ name: "bash", result: { content: "boom", isError: true } })]);
    const config = configSchema.parse({ routing: { escalation: { toolErrorStreak: 1 } } });
    const events: AgentEvent[] = [];

    const runner = createAgentRunner({
      router,
      modelForTier: () => modelB,
      tools,
      permissionMode: "default",
      config,
      budgetState: okBudget(),
      requestPermission: neverAsked(),
    });
    const result = await runner.run(baseTask(), (e) => events.push(e));

    expect(result.finalText).toBe("still on builder");
    expect(events.filter((e) => e.type === "routing_decision")).toHaveLength(1); // no second decision
    expect(events.some((e) => e.type === "escalation")).toBe(false);
  });
});
