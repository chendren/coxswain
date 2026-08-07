/**
 * R13.1 — the M2 integration test, running for real: every lane is merged,
 * so buildSession composes the actual engines. The only fake is the model
 * itself — a MockChatModel-backed ProviderAdapter injected through
 * buildSession's `overrides.adapters` seam (the integrator-ratified answer
 * to this lane's INTEGRATION-NOTES question about how M2 gets a mock).
 *
 * Asserts the full M2 exit criteria from docs/03-BUILD-PLAN.md: a submitted
 * prompt produces routing_decision → model_call_started → text →
 * model_call_finished → turn_done on the bus, ledger entries land in
 * .cox/ledger.jsonl (one for the router's self-ledgered classify call, one
 * for the chat call), and the snapshot reflects the mock's usage.
 */
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EventBus, configSchema, type AgentEvent, type ProviderAdapter } from "@cox/core";
import { createMockModel } from "@cox/providers";
import { buildSession } from "../src/wire";

function waitFor(bus: EventBus, type: AgentEvent["type"], timeoutMs = 10_000): Promise<AgentEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`timed out waiting for ${type}`));
    }, timeoutMs);
    const unsubscribe = bus.subscribe((e) => {
      if (e.type === type) {
        clearTimeout(timer);
        unsubscribe();
        resolve(e);
      }
    });
  });
}

/** scout answers the router's classification; builder answers the prompt. */
function mockAdapter(): ProviderAdapter {
  const scripts: Record<string, Parameters<typeof createMockModel>[0]> = {
    "mock-scout": [
      {
        textDeltas: ['{"task_type": "feature", "complexity": 2, "est_output_tokens": 800}'],
        usage: { inputTokens: 180, outputTokens: 24 },
      },
    ],
    "mock-builder": [
      {
        textDeltas: ["Added parser tests ", "covering both edge cases."],
        usage: { inputTokens: 2_400, outputTokens: 310, cacheReadTokens: 1_100 },
      },
    ],
    "mock-architect": [],
  };
  return {
    id: "mock",
    models: () => Object.keys(scripts),
    create: (id) => createMockModel(scripts[id] ?? [], { provider: "mock", model: id }),
  };
}

describe("R13.1: M2 integration — full stack with a MockChatModel-backed registry", () => {
  it("a submitted prompt produces routing_decision -> ... -> model_call_finished -> turn_done, ledger lines, and a snapshot reflecting the mock's usage", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cox-wire-"));
    const cfg = configSchema.parse({
      tiers: {
        scout: { primary: { provider: "mock", model: "mock-scout" }, fallbacks: [] },
        builder: { primary: { provider: "mock", model: "mock-builder" }, fallbacks: [] },
        architect: { primary: { provider: "mock", model: "mock-architect" }, fallbacks: [] },
      },
    });
    const bus = new EventBus();
    const events: AgentEvent[] = [];
    bus.subscribe((e) => events.push(e));

    const session = await buildSession(cfg, cwd, bus, undefined, {
      adapters: [mockAdapter()],
    });

    const done = waitFor(bus, "turn_done");
    session.controller.submitPrompt("add tests for the parser");
    await done;

    const types = events.map((e) => e.type);
    const routingIdx = types.indexOf("routing_decision");
    const startedIdx = types.indexOf("model_call_started");
    const finishedIdx = types.indexOf("model_call_finished");
    const doneIdx = types.indexOf("turn_done");
    expect(routingIdx).toBeGreaterThanOrEqual(0);
    expect(startedIdx).toBeGreaterThan(routingIdx);
    expect(finishedIdx).toBeGreaterThan(startedIdx);
    expect(doneIdx).toBeGreaterThan(finishedIdx);

    // Classification succeeded via mock-scout → decision is builder with the
    // classifier's reasons, and the routed model is the builder primary.
    const routing = events[routingIdx] as Extract<AgentEvent, { type: "routing_decision" }>;
    expect(routing.decision.tier).toBe("builder");
    expect(routing.decision.model).toEqual({ provider: "mock", model: "mock-builder" });

    // turn_done now carries the stopReason (integrator contract addition).
    const turnDone = events[doneIdx] as Extract<AgentEvent, { type: "turn_done" }>;
    expect(turnDone.stopReason).toBe("end_turn");

    // Two ledger lines: the router's self-ledgered classify call + the chat
    // call written by the cli's ledger subscriber (async after model_call_finished).
    // Poll: attachLedgerWriter records after turn_done may already have fired.
    const ledgerPath = join(cwd, ".cox", "ledger.jsonl");
    let entries: { kind: string; sessionId: string }[] = [];
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const ledgerRaw = await readFile(ledgerPath, "utf8");
      entries = ledgerRaw
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as { kind: string; sessionId: string });
      if (entries.length >= 2) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.kind).sort()).toEqual(["chat", "classify"]);
    for (const entry of entries) {
      expect(entry.sessionId).toBe(session.controller.sessionId);
    }

    const snapshot = session.getSnapshot();
    expect(snapshot.usage.inputTokens + snapshot.usage.outputTokens).toBeGreaterThan(0);
    expect(snapshot.currentModel).toEqual({ provider: "mock", model: "mock-builder" });
  }, 15_000);
});
