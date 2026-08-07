import { describe, expect, it } from "vitest";
import { formatPathAudit, PATH_AUDIT_DEFAULT_MAX } from "../src/path-audit";

describe("formatPathAudit", () => {
  it("joins short paths with arrow", () => {
    expect(formatPathAudit(["a", "b", "c"])).toBe("a -> b -> c");
  });

  it("joins empty path as empty string", () => {
    expect(formatPathAudit([])).toBe("");
  });

  it("joins single segment without arrow", () => {
    expect(formatPathAudit(["only"])).toBe("only");
  });

  it("does not collapse at exactly max length", () => {
    const path = ["1", "2", "3", "4", "5", "6", "7", "8"];
    expect(path.length).toBe(PATH_AUDIT_DEFAULT_MAX);
    expect(formatPathAudit(path)).toBe("1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8");
  });

  it("collapses when longer than default max (8)", () => {
    const path = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    expect(formatPathAudit(path)).toBe("a -> b -> c -> ... -> g -> h -> i");
  });

  it("collapses long orchestrate-style audits to head and tail", () => {
    const path = [
      "load_strong",
      "poll_status",
      "route:investigate",
      "recommend_nba",
      "propose_gated",
      "emit",
      "aggregate_status",
      "simulate:local",
      "scout_summary",
      "emit_report",
    ];
    expect(formatPathAudit(path)).toBe(
      "load_strong -> poll_status -> route:investigate -> ... -> simulate:local -> scout_summary -> emit_report",
    );
  });

  it("respects custom max threshold", () => {
    const path = ["a", "b", "c", "d", "e"];
    expect(formatPathAudit(path, 4)).toBe("a -> b -> c -> ... -> c -> d -> e");
    expect(formatPathAudit(path, 5)).toBe("a -> b -> c -> d -> e");
  });
});
