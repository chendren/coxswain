import { describe, expect, it } from "vitest";
import { toAgentEvent, type CxOpsEvent } from "../src/events";

describe("toAgentEvent", () => {
  it("bridges cx_watch_triggered into a cx_event with a readable summary", () => {
    const e: CxOpsEvent = {
      type: "cx_watch_triggered",
      targetId: "local",
      metric: "abandonment",
      value: 0.07,
      threshold: 0.05,
    };
    const out = toAgentEvent(e);
    expect(out.type).toBe("cx_event");
    if (out.type !== "cx_event") throw new Error("unreachable");
    expect(out.targetId).toBe("local");
    expect(out.summary).toBe("cx watch: local abandonment=0.07 crossed 0.05");
    expect(out.data).toEqual(e);
  });

  it("bridges cx_mode_changed into a readable summary", () => {
    const e: CxOpsEvent = {
      type: "cx_mode_changed",
      targetId: "aws",
      from: "console",
      to: "autonomous",
    };
    const out = toAgentEvent(e);
    if (out.type !== "cx_event") throw new Error("unreachable");
    expect(out.summary).toBe("cx mode: aws console -> autonomous");
  });
});
