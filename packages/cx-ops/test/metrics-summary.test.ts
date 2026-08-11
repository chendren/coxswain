import { describe, expect, it } from "vitest";
import { summarizeDeployments } from "../src/metrics-summary";

describe("summarizeDeployments", () => {
  it("scores all healthy as 100", () => {
    const s = summarizeDeployments([
      { targetId: "a", level: "healthy" },
      { targetId: "b", level: "healthy" },
    ]);
    expect(s.score).toBe(100);
    expect(s.band).toBe("green");
    expect(s.healthy).toBe(2);
  });

  it("mixes degraded and errors", () => {
    const s = summarizeDeployments([
      { targetId: "a", level: "healthy" },
      { targetId: "b", level: "degraded" },
      { targetId: "c", error: "boom" },
    ]);
    expect(s.healthy).toBe(1);
    expect(s.degraded).toBe(1);
    expect(s.errors).toBe(1);
    expect(s.score).toBe(50); // (100+50+0)/3
    expect(s.band).toBe("yellow");
  });

  it("empty is zero", () => {
    const s = summarizeDeployments([]);
    expect(s.score).toBe(0);
    expect(s.band).toBe("red");
  });
});
