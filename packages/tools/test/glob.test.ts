import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PermissionMode } from "@cox/core";
import { createGlobTool } from "../src/glob";
import { withTmpDir } from "./helpers/tmp";

const MODES: PermissionMode[] = ["default", "acceptEdits", "plan", "yolo"];

function fakeCtx(cwd: string) {
  return {
    cwd,
    sessionId: "s1",
    requestPermission: async () => "allow" as const,
    emit: () => {},
  };
}

describe("glob tool (R8.5)", () => {
  it("returns cwd-relative matches, mtime-desc", async () =>
    withTmpDir(async (dir) => {
      await mkdir(join(dir, "src"), { recursive: true });
      await writeFile(join(dir, "src", "a.ts"), "a");
      await writeFile(join(dir, "src", "b.ts"), "b");
      await writeFile(join(dir, "src", "c.js"), "c");

      const older = new Date(Date.now() - 60_000);
      await utimes(join(dir, "src", "a.ts"), older, older);

      const tool = createGlobTool({ cwd: dir });
      const res = await tool.execute({ pattern: "src/*.ts" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(res.content.split("\n")).toEqual(["src/b.ts", "src/a.ts"]);
    }));

  it("honors limit", async () =>
    withTmpDir(async (dir) => {
      for (let i = 0; i < 5; i++) {
        await writeFile(join(dir, `f${i}.txt`), String(i));
      }
      const tool = createGlobTool({ cwd: dir });
      const res = await tool.execute({ pattern: "*.txt", limit: 2 }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(res.content.split("\n")).toHaveLength(2);
    }));

  it("returns empty content when nothing matches", async () =>
    withTmpDir(async (dir) => {
      const tool = createGlobTool({ cwd: dir });
      const res = await tool.execute({ pattern: "*.nope" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(res.content).toBe("");
    }));

  it("supports ** across directories", async () =>
    withTmpDir(async (dir) => {
      await mkdir(join(dir, "a", "b"), { recursive: true });
      await writeFile(join(dir, "a", "b", "x.ts"), "x");
      await writeFile(join(dir, "top.ts"), "x");
      const tool = createGlobTool({ cwd: dir });
      const res = await tool.execute({ pattern: "**/*.ts" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(res.content.split("\n").sort()).toEqual(["a/b/x.ts", "top.ts"]);
    }));

  it("errors on invalid input", async () =>
    withTmpDir(async (dir) => {
      const tool = createGlobTool({ cwd: dir });
      const res = await tool.execute({}, fakeCtx(dir));
      expect(res.isError).toBe(true);
      expect(res.content).toMatch(/"pattern"/);
    }));

  it("R6.4/R9.2: permissionFor is null in every mode", () => {
    const tool = createGlobTool({ cwd: "/proj" });
    for (const mode of MODES) {
      expect(tool.permissionFor({ pattern: "*.ts" }, mode)).toBeNull();
    }
  });
});
