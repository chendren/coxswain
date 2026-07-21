import { describe, expect, it, vi } from "vitest";
import { EventBus } from "@cox/core";
import type { AgentEvent, PermissionDecision, SessionController } from "@cox/core";
import { runPrint } from "../src/print";

function fakeController(
  bus: EventBus,
  script: (prompt: string) => AgentEvent[],
): { controller: SessionController; resolvePermission: ReturnType<typeof vi.fn> } {
  const resolvePermission = vi.fn((_decision: PermissionDecision) => {});
  const controller: SessionController = {
    sessionId: "ses_test",
    submitPrompt: (text: string) => {
      for (const event of script(text)) bus.emit(event);
    },
    submitCommand: () => {},
    resolvePermission,
    interrupt: () => {},
  };
  return { controller, resolvePermission };
}

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/**
 * Per agent-tools/design.md's loop algorithm, model_call_finished always
 * fires immediately before turn_done in the same step — a real session
 * never reaches turn_done without one. Scripts below include it whenever
 * they expect an end_turn (exit 0) outcome.
 */
function endTurnModelCallFinished(): AgentEvent {
  return {
    type: "model_call_finished",
    model: { provider: "anthropic", model: "claude-sonnet-5" },
    usage: ZERO_USAGE,
    costUsd: 0,
    stopReason: "end_turn",
    durationMs: 10,
  };
}

describe("R6.1-R6.3: runPrint", () => {
  it("renders plain lines for the scripted turn and calls submitPrompt with the given prompt", async () => {
    const bus = new EventBus();
    const lines: string[] = [];
    const submitted: string[] = [];
    const { controller } = fakeController(bus, (prompt) => {
      submitted.push(prompt);
      return [
        { type: "user_prompt", text: prompt },
        { type: "agent_message", text: "done" },
        endTurnModelCallFinished(),
        { type: "turn_done", usage: ZERO_USAGE, costUsd: 0 },
      ];
    });
    const code = await runPrint("fix the bug", { bus, controller, write: (l) => lines.push(l) });
    expect(submitted).toEqual(["fix the bug"]);
    expect(lines).toContain("❯ fix the bug");
    expect(lines).toContain("done");
    expect(code).toBe(0);
  });

  it("R6.3: exits 0 when the last model_call_finished stopReason is end_turn", async () => {
    const bus = new EventBus();
    const { controller } = fakeController(bus, () => [
      {
        type: "model_call_finished",
        model: { provider: "anthropic", model: "claude-sonnet-5" },
        usage: ZERO_USAGE,
        costUsd: 0.01,
        stopReason: "end_turn",
        durationMs: 100,
      },
      { type: "turn_done", usage: ZERO_USAGE, costUsd: 0.01 },
    ]);
    const code = await runPrint("x", { bus, controller, write: () => {} });
    expect(code).toBe(0);
  });

  it("R6.3: exits 1 when the last model_call_finished stopReason is not end_turn", async () => {
    const bus = new EventBus();
    const { controller } = fakeController(bus, () => [
      {
        type: "model_call_finished",
        model: { provider: "anthropic", model: "claude-sonnet-5" },
        usage: ZERO_USAGE,
        costUsd: 0.01,
        stopReason: "max_tokens",
        durationMs: 100,
      },
      { type: "turn_done", usage: ZERO_USAGE, costUsd: 0.01 },
    ]);
    const code = await runPrint("x", { bus, controller, write: () => {} });
    expect(code).toBe(1);
  });

  it("R6.3: exits 1 when the turn ends via an error event instead of turn_done", async () => {
    const bus = new EventBus();
    const { controller } = fakeController(bus, () => [{ type: "error", message: "budget exceeded" }]);
    const code = await runPrint("x", { bus, controller, write: () => {} });
    expect(code).toBe(1);
  });

  it("R6.2: auto-denies a permission request by default and prints the decision line", async () => {
    const bus = new EventBus();
    const lines: string[] = [];
    const { controller, resolvePermission } = fakeController(bus, () => [
      { type: "permission_request", request: { toolName: "bash", summary: "bash: rm -rf dist/" } },
      endTurnModelCallFinished(),
      { type: "turn_done", usage: ZERO_USAGE, costUsd: 0 },
    ]);
    const code = await runPrint("x", { bus, controller, write: (l) => lines.push(l) });
    expect(resolvePermission).toHaveBeenCalledTimes(1);
    expect(resolvePermission).toHaveBeenCalledWith("deny");
    expect(lines.some((l) => l.includes("denied"))).toBe(true);
    expect(code).toBe(0);
  });

  it("R6.2: auto-allows a permission request when --yolo is set", async () => {
    const bus = new EventBus();
    const lines: string[] = [];
    const { controller, resolvePermission } = fakeController(bus, () => [
      { type: "permission_request", request: { toolName: "bash", summary: "bash: rm -rf dist/" } },
      endTurnModelCallFinished(),
      { type: "turn_done", usage: ZERO_USAGE, costUsd: 0 },
    ]);
    const code = await runPrint("x", { bus, controller, yolo: true, write: (l) => lines.push(l) });
    expect(resolvePermission).toHaveBeenCalledTimes(1);
    expect(resolvePermission).toHaveBeenCalledWith("allow");
    expect(lines.some((l) => l.includes("allowed"))).toBe(true);
    expect(code).toBe(0);
  });

  it("defaults to writing through process.stdout when no write() is injected", async () => {
    const bus = new EventBus();
    const { controller } = fakeController(bus, () => [{ type: "turn_done", usage: ZERO_USAGE, costUsd: 0 }]);
    const realWrite = process.stdout.write.bind(process.stdout);
    const captured: string[] = [];
    process.stdout.write = ((chunk: string) => {
      captured.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      await runPrint("x", { bus, controller });
    } finally {
      process.stdout.write = realWrite;
    }
    expect(captured.join("")).toContain("· turn $0.000");
  });
});
