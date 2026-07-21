import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { EventBus } from "@cox/core";
import type { SessionController, SessionSnapshot } from "@cox/core";
import { App } from "../src/app";

function fakeSnapshot(): SessionSnapshot {
  return {
    sessionId: "ses_test",
    currentTier: "builder",
    currentModel: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0,
    budget: { level: "ok", spentUsd: 0, spentTokens: 0 },
  };
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, "");
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

function makeController(): {
  controller: SessionController;
  submitPrompt: ReturnType<typeof vi.fn>;
  submitCommand: ReturnType<typeof vi.fn>;
  resolvePermission: ReturnType<typeof vi.fn>;
  interrupt: ReturnType<typeof vi.fn>;
} {
  const submitPrompt = vi.fn();
  const submitCommand = vi.fn();
  const resolvePermission = vi.fn();
  const interrupt = vi.fn();
  const controller: SessionController = {
    sessionId: "ses_test",
    submitPrompt,
    submitCommand,
    resolvePermission,
    interrupt,
  };
  return { controller, submitPrompt, submitCommand, resolvePermission, interrupt };
}

const ESC = "\u001B";
const ENTER = "\r";
const TAB = "\t";

describe("R4.1: non-slash text submits the prompt", () => {
  it("calls controller.submitPrompt with the typed text on Enter", async () => {
    const { controller, submitPrompt, submitCommand } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    await flush();
    stdin.write("add input validation");
    stdin.write(ENTER);
    await flush();
    expect(submitPrompt).toHaveBeenCalledTimes(1);
    expect(submitPrompt).toHaveBeenCalledWith("add input validation");
    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("ignores a blank submission", async () => {
    const { controller, submitPrompt } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    await flush();
    stdin.write(ENTER);
    await flush();
    expect(submitPrompt).not.toHaveBeenCalled();
  });
});

describe("R4.2: slash commands", () => {
  it("calls controller.submitCommand(cmd, args) for a valid top-level command", async () => {
    const { controller, submitCommand, submitPrompt } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    await flush();
    stdin.write("/model builder");
    stdin.write(ENTER);
    await flush();
    expect(submitCommand).toHaveBeenCalledTimes(1);
    expect(submitCommand).toHaveBeenCalledWith("model", ["builder"]);
    expect(submitPrompt).not.toHaveBeenCalled();
  });

  it("splits multiple arguments", async () => {
    const { controller, submitCommand } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    await flush();
    stdin.write("/spec new auth-flow add login");
    stdin.write(ENTER);
    await flush();
    expect(submitCommand).toHaveBeenCalledWith("spec", ["new", "auth-flow", "add", "login"]);
  });

  it("an unknown command renders a local error line and touches neither submitPrompt nor submitCommand", async () => {
    const { controller, submitCommand, submitPrompt } = makeController();
    const bus = new EventBus();
    const { stdin, lastFrame } = render(
      <App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />,
    );
    await flush();
    stdin.write("/bogus");
    stdin.write(ENTER);
    await flush();
    expect(submitCommand).not.toHaveBeenCalled();
    expect(submitPrompt).not.toHaveBeenCalled();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("✖ unknown command: /bogus");
  });
});

describe("R4.4: Tab completes the six top-level commands", () => {
  it("completes an unambiguous partial command name", async () => {
    const { controller, submitCommand } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    await flush();
    stdin.write("/mo");
    stdin.write(TAB);
    await flush();
    stdin.write("architect");
    stdin.write(ENTER);
    await flush();
    expect(submitCommand).toHaveBeenCalledWith("model", ["architect"]);
  });

  it("does nothing when the partial matches no top-level command", async () => {
    const { controller } = makeController();
    const bus = new EventBus();
    const { stdin, lastFrame } = render(
      <App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />,
    );
    await flush();
    stdin.write("/zz");
    stdin.write(TAB);
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("❯ /zz");
  });

  it("does not touch a line that already has arguments (only completes the bare command token)", async () => {
    const { controller } = makeController();
    const bus = new EventBus();
    const { stdin, lastFrame } = render(
      <App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />,
    );
    await flush();
    stdin.write("/model bui");
    stdin.write(TAB);
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("❯ /model bui");
  });
});

describe("R4.3: Esc interrupts only while a turn is running and no modal is open", () => {
  it("calls controller.interrupt() while a turn is running", async () => {
    const { controller, interrupt } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    await flush();
    bus.emit({ type: "user_prompt", text: "long running task" });
    await flush();
    stdin.write(ESC);
    await flush();
    expect(interrupt).toHaveBeenCalledTimes(1);
  });

  it("does not call interrupt() when no turn is running", async () => {
    const { controller, interrupt } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    await flush();
    stdin.write(ESC);
    await flush();
    expect(interrupt).not.toHaveBeenCalled();
  });

  it("does not call interrupt() again after turn_done", async () => {
    const { controller, interrupt } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    await flush();
    bus.emit({ type: "user_prompt", text: "task" });
    bus.emit({
      type: "turn_done",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0,
    });
    await flush();
    stdin.write(ESC);
    await flush();
    expect(interrupt).not.toHaveBeenCalled();
  });

  it("Esc while a permission modal is open denies the request, not interrupt()", async () => {
    const { controller, interrupt, resolvePermission } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    await flush();
    bus.emit({ type: "user_prompt", text: "task" }); // turn running
    bus.emit({
      type: "permission_request",
      request: { toolName: "bash", summary: "bash: rm -rf dist/" },
    });
    await flush();
    stdin.write(ESC);
    await flush();
    expect(interrupt).not.toHaveBeenCalled();
    expect(resolvePermission).toHaveBeenCalledWith("deny");
  });
});
