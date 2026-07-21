import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { EventBus, ZERO_USAGE } from "@cox/core";
import type { SessionController, SessionSnapshot } from "@cox/core";
import { App } from "../src/app";

function fakeController(): SessionController {
  return {
    sessionId: "ses_test",
    submitPrompt: () => {},
    submitCommand: () => {},
    resolvePermission: () => {},
    interrupt: () => {},
  };
}

function fakeSnapshot(): SessionSnapshot {
  return {
    sessionId: "ses_test",
    currentTier: "builder",
    currentModel: null,
    usage: ZERO_USAGE,
    costUsd: 0,
    budget: { level: "ok", spentUsd: 0, spentTokens: 0 },
  };
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, "");
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe("R1.1 (partial)/R1.2/R1.6: App text path", () => {
  it("renders user_prompt bold with a ❯ prefix", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "user_prompt", text: "add tests" });
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("❯ add tests");
  });

  it("R1.2: streams text_delta into one growing block and does not duplicate it on agent_message", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "text_delta", text: "Hello, " });
    bus.emit({ type: "text_delta", text: "world." });
    bus.emit({ type: "agent_message", text: "Hello, world." });
    bus.emit({ type: "turn_done", usage: ZERO_USAGE, costUsd: 0 });
    await flush();

    const frame = stripAnsi(lastFrame() ?? "");
    const occurrences = frame.split("Hello, world.").length - 1;
    expect(occurrences).toBe(1);
  });

  it("R1.2: renders agent_message text when no prior delta streamed this turn (replay/non-streaming)", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "agent_message", text: "Added zod validation." });
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("Added zod validation.");
  });

  it("renders error in red with a ✖ prefix", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "error", message: "boom" });
    await flush();
    const frame = lastFrame() ?? "";
    expect(stripAnsi(frame)).toContain("✖ boom");
    expect(frame).toContain("[31m"); // red
  });

  it("turn_done settles the streaming block into Static and appends a dim turn-cost separator", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "text_delta", text: "done." });
    bus.emit({ type: "turn_done", usage: ZERO_USAGE, costUsd: 0.0721 });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("done.");
    expect(frame).toContain("· turn $0.07");
  });

  it("a later turn's agent_message dedupe state resets after turn_done", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "text_delta", text: "first" });
    bus.emit({ type: "turn_done", usage: ZERO_USAGE, costUsd: 0 });
    bus.emit({ type: "agent_message", text: "second (no deltas this turn)" });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("second (no deltas this turn)");
  });

  it("R1.6: a listener never throws out of the render loop — multiple events in one turn are all reflected", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "user_prompt", text: "do the thing" });
    bus.emit({ type: "text_delta", text: "working" });
    bus.emit({ type: "turn_done", usage: ZERO_USAGE, costUsd: 0 });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("❯ do the thing");
    expect(frame).toContain("working");
  });
});
