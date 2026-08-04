import { describe, expect, it } from "vitest";
import { createOfflineCxRuntime, createCxRuntime } from "../src/cx/runtime";

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
