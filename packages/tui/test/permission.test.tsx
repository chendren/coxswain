import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { EventBus } from "@cox/core";
import type { PermissionRequest, SessionController, SessionSnapshot } from "@cox/core";
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
  resolvePermission: ReturnType<typeof vi.fn>;
  submitPrompt: ReturnType<typeof vi.fn>;
} {
  const resolvePermission = vi.fn();
  const submitPrompt = vi.fn();
  const controller: SessionController = {
    sessionId: "ses_test",
    submitPrompt,
    submitCommand: () => {},
    resolvePermission,
    interrupt: () => {},
  };
  return { controller, resolvePermission, submitPrompt };
}

const REQUEST: PermissionRequest = {
  toolName: "edit",
  summary: "edit src/routes/signup.ts",
  detail: "@@ -10,6 +10,12 @@ ...\n+ added line",
};

describe("R3.1: PermissionPrompt modal", () => {
  it("shows the summary and the (scrollable) detail", async () => {
    const { controller } = makeController();
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "permission_request", request: REQUEST });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("edit src/routes/signup.ts");
    expect(frame).toContain("@@ -10,6 +10,12 @@ ...");
    expect(frame).toContain("added line");
  });

  it("scrolls the detail window with arrow keys when it exceeds the visible window", async () => {
    const { controller } = makeController();
    const bus = new EventBus();
    const longDetail = Array.from({ length: 15 }, (_, i) => `line ${i}`).join("\n");
    const { stdin, lastFrame } = render(
      <App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "permission_request", request: { ...REQUEST, detail: longDetail } });
    await flush();
    const before = stripAnsi(lastFrame() ?? "");
    expect(before).toContain("line 0");
    expect(before).not.toContain("line 14");

    stdin.write("\u001B[B"); // down arrow
    await flush();
    const after = stripAnsi(lastFrame() ?? "");
    expect(after).not.toContain("line 0");
  });

  it.each([
    ["y", "allow"],
    ["a", "allowAlways"],
    ["n", "deny"],
  ])("%s maps to %s", async (key, expected) => {
    const { controller, resolvePermission } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "permission_request", request: REQUEST });
    await flush();
    stdin.write(key);
    await flush();
    expect(resolvePermission).toHaveBeenCalledTimes(1);
    expect(resolvePermission).toHaveBeenCalledWith(expected);
  });

  it("Esc maps to deny", async () => {
    const { controller, resolvePermission } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "permission_request", request: REQUEST });
    await flush();
    stdin.write("\u001B");
    await flush();
    expect(resolvePermission).toHaveBeenCalledTimes(1);
    expect(resolvePermission).toHaveBeenCalledWith("deny");
  });
});

describe("R3.2: resolvePermission is called exactly once and the modal closes", () => {
  it("further keystrokes after a decision do not call resolvePermission again", async () => {
    const { controller, resolvePermission } = makeController();
    const bus = new EventBus();
    const { stdin, lastFrame } = render(
      <App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "permission_request", request: REQUEST });
    await flush();
    stdin.write("y");
    await flush();
    stdin.write("y");
    stdin.write("n");
    await flush();
    expect(resolvePermission).toHaveBeenCalledTimes(1);
    expect(stripAnsi(lastFrame() ?? "")).not.toContain("edit src/routes/signup.ts");
  });

  it("a second permission_request after the first is resolved opens a fresh modal", async () => {
    const { controller, resolvePermission } = makeController();
    const bus = new EventBus();
    const { stdin, lastFrame } = render(
      <App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "permission_request", request: REQUEST });
    await flush();
    stdin.write("y");
    await flush();

    bus.emit({
      type: "permission_request",
      request: { toolName: "bash", summary: "bash: rm -rf dist/", detail: "rm -rf dist/" },
    });
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("bash: rm -rf dist/");

    stdin.write("n");
    await flush();
    expect(resolvePermission).toHaveBeenCalledTimes(2);
    expect(resolvePermission).toHaveBeenNthCalledWith(1, "allow");
    expect(resolvePermission).toHaveBeenNthCalledWith(2, "deny");
  });
});

describe("R3.1: input disabled while the modal is open", () => {
  it("stdin activity while the modal is open never calls controller.submitPrompt", async () => {
    const { controller, submitPrompt } = makeController();
    const bus = new EventBus();
    const { stdin } = render(<App bus={bus} controller={controller} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "permission_request", request: REQUEST });
    await flush();
    stdin.write("hello");
    stdin.write("\r");
    await flush();
    expect(submitPrompt).not.toHaveBeenCalled();
  });
});
