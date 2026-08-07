import { describe, expect, it } from "vitest";
import { summarizeTasks, type CxTask } from "../src/tasks";

function t(status: CxTask["status"], id = status): CxTask {
  return {
    id,
    specName: "demo",
    title: id,
    detail: "",
    status,
    createdAt: "t",
    updatedAt: "t",
    path: [],
  };
}

describe("summarizeTasks", () => {
  it("rollups open and totals", () => {
    const s = summarizeTasks([
      t("pending", "a"),
      t("pending", "b"),
      t("in_progress", "c"),
      t("done", "d"),
      t("cancelled", "e"),
    ]);
    expect(s.pending).toBe(2);
    expect(s.in_progress).toBe(1);
    expect(s.done).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.total).toBe(5);
    expect(s.open).toBe(3);
  });

  it("empty", () => {
    expect(summarizeTasks([]).total).toBe(0);
    expect(summarizeTasks([]).open).toBe(0);
  });
});
