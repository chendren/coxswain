import { describe, expect, it } from "vitest";
import { createCxAdapterError, isCxAdapterError } from "../src/errors";

describe("CxAdapterError", () => {
  it("carries targetId, phase, and retryable on a real Error", () => {
    const err = createCxAdapterError({
      message: "local platform unreachable at http://localhost:3142",
      targetId: "local",
      phase: "deploy",
      retryable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("local platform unreachable at http://localhost:3142");
    expect(err.targetId).toBe("local");
    expect(err.phase).toBe("deploy");
    expect(err.retryable).toBe(true);
  });

  it("isCxAdapterError distinguishes it from a plain Error", () => {
    const err = createCxAdapterError({
      message: "boom",
      targetId: "aws",
      phase: "build",
      retryable: false,
    });
    expect(isCxAdapterError(err)).toBe(true);
    expect(isCxAdapterError(new Error("plain"))).toBe(false);
  });
});
