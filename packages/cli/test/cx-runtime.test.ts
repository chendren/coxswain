import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOfflineCxRuntime, createCxRuntime } from "../src/cx/runtime";
import { runCxDoctor } from "../src/commands/cx";

/** Hybrid wiring must not pick up real cloud keys from the host env. */
function clearCloudKeys(): void {
  process.env.OPENAI_API_KEY = "";
  process.env.XAI_API_KEY = "";
  process.env.ANTHROPIC_API_KEY = "";
}

beforeAll(clearCloudKeys);
beforeEach(clearCloudKeys);

describe("createCxRuntime", () => {
  it("offline factory wires all targets offline", () => {
    const rt = createOfflineCxRuntime({ cwd: "/tmp/cx-rt-test" });
    expect(rt.mode).toBe("offline");
    expect(rt.wiring).toEqual({
      artifacts: "offline",
      local: "offline",
      aws: "offline",
    });
    expect(rt.adapters.artifacts?.id).toBe("artifacts");
    expect(rt.adapters.local?.id).toBe("local");
    expect(rt.adapters.aws?.id).toBe("aws");
  });

  it("hybrid without tierModel stays offline adapters", async () => {
    const rt = await createCxRuntime({
      cwd: "/tmp/cx-rt-test2",
      mode: "hybrid",
      skipProbe: true,
    });
    expect(rt.wiring.artifacts).toBe("offline");
    expect(rt.wiring.local).toBe("offline");
    expect(rt.path).toContain("wire:artifacts:offline");
  });
});

describe("runCxDoctor exit codes", () => {
  function collect(): { write: (line: string) => void; out: string[] } {
    const out: string[] = [];
    return {
      out,
      write: (line: string) => {
        out.push(line);
      },
    };
  }

  it("offline doctor returns 0 when ontology ok (stack ready ignored)", async () => {
    const { write, out } = collect();
    const code = await runCxDoctor({
      cwd: "/tmp/cx-doctor-offline",
      write,
      mode: "offline",
      // Unreachable: ensures stack.ready is false without relying on host state.
      localBaseUrl: "http://127.0.0.1:1",
    });
    expect(code).toBe(0);
    expect(out.some((l) => l.includes("ontology ok=true"))).toBe(true);
    expect(out.some((l) => l.includes("stack ready for live local:"))).toBe(true);
  });

  it("hybrid doctor returns 1 when stack is not ready (still prints full output)", async () => {
    const { write, out } = collect();
    const code = await runCxDoctor({
      cwd: "/tmp/cx-doctor-hybrid",
      write,
      mode: "hybrid",
      localBaseUrl: "http://127.0.0.1:1",
    });
    expect(code).toBe(1);
    expect(out.some((l) => l.includes("ontology ok=true"))).toBe(true);
    expect(out.some((l) => l.includes("stack ready for live local: false"))).toBe(true);
    expect(out.some((l) => l.includes("ollama:"))).toBe(true);
    expect(out.some((l) => l.includes("platform:"))).toBe(true);
  });

  it("live doctor returns 1 when stack is not ready", async () => {
    const { write, out } = collect();
    const code = await runCxDoctor({
      cwd: "/tmp/cx-doctor-live",
      write,
      mode: "live",
      localBaseUrl: "http://127.0.0.1:1",
    });
    expect(code).toBe(1);
    expect(out.some((l) => l.includes("stack ready for live local: false"))).toBe(true);
  });
});
