import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { EventBus, ZERO_USAGE } from "@cox/core";
import type { SessionController, SessionSnapshot } from "@cox/core";
import { App } from "../src/app";
import { StatusLine } from "../src/components/StatusLine";

function fakeController(): SessionController {
  return {
    sessionId: "ses_test",
    submitPrompt: () => {},
    submitCommand: () => {},
    resolvePermission: () => {},
    interrupt: () => {},
  };
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, "");
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

const baseSnapshot: SessionSnapshot = {
  sessionId: "ses_test",
  currentTier: "builder",
  currentModel: { provider: "anthropic", model: "claude-sonnet-5" },
  usage: { inputTokens: 128_000, outputTokens: 24_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
  costUsd: 0.42,
  budget: { level: "ok", spentUsd: 0.42, spentTokens: 152_000, limitUsd: 5, limitTokens: 500_000 },
};

describe("R2.1: StatusLine byte-compatible mockup", () => {
  it("matches the docs/05 §2 mockup shape with a spec segment", () => {
    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      usage: { inputTokens: 128_000, outputTokens: 24_000, cacheReadTokens: 314_000, cacheWriteTokens: 0 },
      activeSpec: { name: "auth-flow", phase: "execution", tasksDone: 4, tasksTotal: 9 },
    };
    const { lastFrame } = render(<StatusLine snapshot={snapshot} />);
    const frame = stripAnsi(lastFrame() ?? "");
    // cache 71% == round(100*314000/(128000+314000))
    expect(frame).toBe(
      "⛵ builder claude-sonnet-5 │ ▲128k ▼24k │ $0.42/$5.00 │ cache 71% │ spec auth-flow 4/9",
    );
  });

  it("omits the spec segment entirely when activeSpec is undefined", () => {
    const { lastFrame } = render(<StatusLine snapshot={baseSnapshot} />);
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).not.toContain("spec");
    expect(frame.endsWith("cache 0%")).toBe(true);
  });

  it("renders ∞ when no budget limit is configured", () => {
    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      budget: { level: "ok", spentUsd: 0.42, spentTokens: 152_000 },
    };
    const { lastFrame } = render(<StatusLine snapshot={snapshot} />);
    expect(stripAnsi(lastFrame() ?? "")).toContain("$0.42/∞");
  });

  it("renders (none) for the model before any model call has happened", () => {
    const snapshot: SessionSnapshot = { ...baseSnapshot, currentModel: null };
    const { lastFrame } = render(<StatusLine snapshot={snapshot} />);
    expect(stripAnsi(lastFrame() ?? "")).toContain("⛵ builder (none)");
  });
});

describe("R2.3: StatusLine budget-level colors", () => {
  it("renders the cost segment in yellow when budget.level is warn", () => {
    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      budget: { level: "warn", spentUsd: 4.2, spentTokens: 400_000, limitUsd: 5 },
    };
    const { lastFrame } = render(<StatusLine snapshot={snapshot} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("[33m"); // yellow
    expect(stripAnsi(frame)).toContain("$4.20/$5.00");
  });

  it("renders the cost segment in red when budget.level is exceeded", () => {
    const snapshot: SessionSnapshot = {
      ...baseSnapshot,
      budget: { level: "exceeded", spentUsd: 5.5, spentTokens: 500_000, limitUsd: 5 },
    };
    const { lastFrame } = render(<StatusLine snapshot={snapshot} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("[31m"); // red
    expect(stripAnsi(frame)).toContain("$5.50/$5.00");
  });

  it("renders the cost segment uncolored when budget.level is ok", () => {
    const { lastFrame } = render(<StatusLine snapshot={baseSnapshot} />);
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("[33m");
    expect(frame).not.toContain("[31m");
  });
});

describe("R2.2: App refreshes the status line via getSnapshot() on every event", () => {
  it("calls getSnapshot() at least once per emitted event", async () => {
    let calls = 0;
    const getSnapshot = (): SessionSnapshot => {
      calls++;
      return baseSnapshot;
    };
    const bus = new EventBus();
    render(<App bus={bus} controller={fakeController()} getSnapshot={getSnapshot} />);
    const initialCalls = calls;

    const events = 5;
    bus.emit({ type: "user_prompt", text: "one" });
    bus.emit({ type: "text_delta", text: "two" });
    bus.emit({ type: "error", message: "three" });
    bus.emit({ type: "turn_done", usage: ZERO_USAGE, costUsd: 0 });
    bus.emit({ type: "session_started", sessionId: "s", cwd: "/tmp" });
    await flush();

    expect(calls - initialCalls).toBeGreaterThanOrEqual(events);
  });
});
