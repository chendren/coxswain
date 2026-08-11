import { describe, expect, it } from "vitest";
import { compactPath, PATH_COMPACT_DEFAULT_MAX } from "../src/path-compact";

describe("compactPath", () => {
  it("joins short paths with arrow", () => {
    expect(compactPath(["a", "b", "c"])).toBe("a → b → c");
  });

  it("joins empty path as empty string", () => {
    expect(compactPath([])).toBe("");
  });

  it("joins single segment without arrow", () => {
    expect(compactPath(["only"])).toBe("only");
  });

  it("does not collapse at exactly max length (6)", () => {
    const path = ["1", "2", "3", "4", "5", "6"];
    expect(path.length).toBe(PATH_COMPACT_DEFAULT_MAX);
    expect(compactPath(path)).toBe("1 → 2 → 3 → 4 → 5 → 6");
  });

  it("collapses when longer than default max (6)", () => {
    const path = ["a", "b", "c", "d", "e", "f", "g"];
    // first 2: a, b; last (6-3)=3: e, f, g
    expect(compactPath(path)).toBe("a → b → … → e → f → g");
  });

  it("collapses long paths to first 2 and last (max-3) segments", () => {
    const path = ["start", "build", "deploy", "status", "report", "end"];
    // max=5, first 2: start, build; last (5-3)=2: report, end
    expect(compactPath(path, 5)).toBe("start → build → … → report → end");
  });

  it("respects custom max threshold", () => {
    const path = ["a", "b", "c", "d", "e"];
    // max=4: first 2: a, b; last (4-3)=1: e
    expect(compactPath(path, 4)).toBe("a → b → … → e");
    expect(compactPath(path, 5)).toBe("a → b → c → d → e");
  });

  it("handles board/console style paths", () => {
    const path = ["build:prod", "deploy:staging", "validate", "notify"];
    expect(compactPath(path)).toBe("build:prod → deploy:staging → validate → notify");
  });

  it("collapses very long paths correctly", () => {
    const path = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    // max=6, first 2: a, b; last (6-3)=3: h, i, j
    expect(compactPath(path)).toBe("a → b → … → h → i → j");
  });
});
