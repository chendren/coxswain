import { describe, expect, it } from "vitest";
import { statusTone } from "../src/status-tone";

describe("statusTone", () => {
  const cases: Array<{ input: string | null | undefined; expected: string }> = [
    // Proposals
    { input: "open", expected: "active" },
    { input: "Open", expected: "active" },
    { input: "OPEN", expected: "active" },
    { input: "claimed", expected: "active" },
    { input: "Claimed", expected: "active" },
    { input: "dismissed", expected: "muted" },
    { input: "Dismissed", expected: "muted" },
    { input: "resolved", expected: "done" },
    { input: "Resolved", expected: "done" },

    // Tasks
    { input: "pending", expected: "neutral" },
    { input: "Pending", expected: "neutral" },
    { input: "in_progress", expected: "active" },
    { input: "In_Progress", expected: "active" },
    { input: "done", expected: "done" },
    { input: "Done", expected: "done" },
    { input: "cancelled", expected: "muted" },
    { input: "Cancelled", expected: "muted" },

    // Danger cases
    { input: "failed", expected: "danger" },
    { input: "Failed", expected: "danger" },
    { input: "error", expected: "danger" },
    { input: "Error", expected: "danger" },
    { input: "blocked", expected: "danger" },
    { input: "Blocked", expected: "danger" },

    // Edge cases
    { input: "", expected: "neutral" },
    { input: null, expected: "neutral" },
    { input: undefined, expected: "neutral" },
    { input: "   ", expected: "neutral" },
    { input: "  pending  ", expected: "neutral" },
    { input: "unknown_status", expected: "neutral" },
    { input: "random", expected: "neutral" },
  ];

  it("maps all known statuses correctly", () => {
    for (const { input, expected } of cases) {
      expect(statusTone(input as string)).toBe(expected);
    }
  });
});
