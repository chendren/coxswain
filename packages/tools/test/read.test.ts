import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PermissionMode } from "@cox/core";
import { createReadTool } from "../src/read";
import { withTmpDir } from "./helpers/tmp";

const MODES: PermissionMode[] = ["default", "acceptEdits", "plan", "yolo"];

describe("read tool (R8.1)", () => {
  it("returns 1-based numbered lines", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "a.txt"), "alpha\nbeta\ngamma\n");
      const tool = createReadTool({ cwd: dir });
      const res = await tool.execute({ path: "a.txt" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(res.content).toBe("1\talpha\n2\tbeta\n3\tgamma");
    }));

  it("honors offset and limit", async () =>
    withTmpDir(async (dir) => {
      const lines = Array.from({ length: 10 }, (_, i) => `line${i}`);
      await writeFile(join(dir, "b.txt"), lines.join("\n") + "\n");
      const tool = createReadTool({ cwd: dir });
      const res = await tool.execute({ path: "b.txt", offset: 3, limit: 4 }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      // more lines remain past the requested window, so a marker is still owed
      expect(res.content).toBe(
        "3\tline2\n4\tline3\n5\tline4\n6\tline5\n[truncated: 4 of 10 lines]",
      );
    }));

  it("caps output at 2000 lines with a truncation marker", async () =>
    withTmpDir(async (dir) => {
      const lines = Array.from({ length: 2500 }, (_, i) => `line${i}`);
      await writeFile(join(dir, "big.txt"), lines.join("\n") + "\n");
      const tool = createReadTool({ cwd: dir });
      const res = await tool.execute({ path: "big.txt" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      const returned = res.content.split("\n");
      // 2000 numbered lines + 1 marker line
      expect(returned).toHaveLength(2001);
      expect(returned[2000]).toBe("[truncated: 2000 of 2500 lines]");
      expect(returned[0]).toBe("1\tline0");
      expect(returned[1999]).toBe("2000\tline1999");
    }));

  it("caps output at 2MB with a truncation marker", async () =>
    withTmpDir(async (dir) => {
      const huge = "x".repeat(2 * 1024 * 1024 + 1000);
      await writeFile(join(dir, "huge.txt"), huge);
      const tool = createReadTool({ cwd: dir });
      const res = await tool.execute({ path: "huge.txt" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(res.content).toContain("[truncated: 1 of 1 lines]");
      expect(res.content).toContain("file exceeds 2MB");
    }));

  it("errors on missing file", async () =>
    withTmpDir(async (dir) => {
      const tool = createReadTool({ cwd: dir });
      const res = await tool.execute({ path: "nope.txt" }, fakeCtx(dir));
      expect(res.isError).toBe(true);
      expect(res.content).toMatch(/file not found/);
    }));

  it("errors on a directory path", async () =>
    withTmpDir(async (dir) => {
      await mkdir(join(dir, "sub"));
      const tool = createReadTool({ cwd: dir });
      const res = await tool.execute({ path: "sub" }, fakeCtx(dir));
      expect(res.isError).toBe(true);
      expect(res.content).toMatch(/not a file/);
    }));

  it("errors on invalid input", async () =>
    withTmpDir(async (dir) => {
      const tool = createReadTool({ cwd: dir });
      const res = await tool.execute({}, fakeCtx(dir));
      expect(res.isError).toBe(true);
      expect(res.content).toMatch(/"path"/);
    }));

  it("R6.4/R9.2: permissionFor is null in every mode", async () =>
    withTmpDir(async (dir) => {
      const tool = createReadTool({ cwd: dir });
      for (const mode of MODES) {
        expect(tool.permissionFor({ path: "a.txt" }, mode)).toBeNull();
      }
    }));
});

function fakeCtx(cwd: string) {
  return {
    cwd,
    sessionId: "s1",
    requestPermission: async () => "allow" as const,
    emit: () => {},
  };
}
