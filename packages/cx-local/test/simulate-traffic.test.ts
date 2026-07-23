import { describe, expect, it } from "vitest";
import { generateSyntheticEvents } from "../src/simulate-traffic";
import type { CxTrafficProfile } from "@cox/cx-core";

describe("generateSyntheticEvents", () => {
  it("generates volumePerMinute * durationMinutes events", () => {
    const traffic: CxTrafficProfile = {
      name: "peak",
      volumePerMinute: 10,
      personaWeights: { alex: 1 },
      durationMinutes: 3,
    };
    const events = generateSyntheticEvents(traffic, "billing_dispute", () => 0);
    expect(events).toHaveLength(30);
  });

  it("picks personas deterministically from the injected randomFn and weights", () => {
    const traffic: CxTrafficProfile = {
      name: "mixed",
      volumePerMinute: 2,
      personaWeights: { alex: 0.5, jordan: 0.5 },
      durationMinutes: 1,
    };
    let call = 0;
    const rolls = [0.1, 0.9]; // alex, then jordan
    const events = generateSyntheticEvents(traffic, "billing_dispute", () => rolls[call++]!);
    expect(events).toHaveLength(2);
    expect(events[0]?.customerId).toContain("alex");
    expect(events[1]?.customerId).toContain("jordan");
  });

  it("every event references the journey type in its content", () => {
    const traffic: CxTrafficProfile = { name: "x", volumePerMinute: 1, personaWeights: { a: 1 }, durationMinutes: 1 };
    const events = generateSyntheticEvents(traffic, "technical_troubleshooting", () => 0);
    expect(events[0]?.content).toContain("technical_troubleshooting");
  });
});
