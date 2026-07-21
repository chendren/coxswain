import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PermissionMode } from "@cox/core";
import { createGrepTool } from "../src/grep";
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

describe("grep tool (R8.6)", () => {
  it("content mode returns path:line: text", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "a.txt"), "hello\nfoo bar\nbaz\n");
      const tool = createGrepTool({ cwd: dir });
      const res = await tool.execute({ pattern: "foo" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(res.content).toBe("a.txt:2: foo bar");
    }));

  it("files mode returns only matching file paths", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "a.txt"), "foo\nfoo\n");
      await writeFile(join(dir, "b.txt"), "foo\n");
      await writeFile(join(dir, "c.txt"), "nothing here\n");
      const tool = createGrepTool({ cwd: dir });
      const res = await tool.execute({ pattern: "foo", mode: "files" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(res.content.split("\n").sort()).toEqual(["a.txt", "b.txt"]);
    }));

  it("count mode returns path: N per file", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "a.txt"), "foo\nfoo\nbar\n");
      await writeFile(join(dir, "b.txt"), "foo\n");
      const tool = createGrepTool({ cwd: dir });
      const res = await tool.execute({ pattern: "foo", mode: "count" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      const rows = res.content.split("\n").sort();
      expect(rows).toEqual(["a.txt: 2", "b.txt: 1"]);
    }));

  it("filters by glob", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "a.ts"), "needle\n");
      await writeFile(join(dir, "a.md"), "needle\n");
      const tool = createGrepTool({ cwd: dir });
      const res = await tool.execute(
        { pattern: "needle", glob: "*.ts", mode: "files" },
        fakeCtx(dir),
      );
      expect(res.isError).toBe(false);
      expect(res.content).toBe("a.ts");
    }));

  it("skips binary files (null-byte sniff)", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "bin.dat"), Buffer.from([0, 1, 2, ...Buffer.from("needle")]));
      await writeFile(join(dir, "text.txt"), "needle\n");
      const tool = createGrepTool({ cwd: dir });
      const res = await tool.execute({ pattern: "needle", mode: "files" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(res.content).toBe("text.txt");
    }));

  it("errors on invalid regex, naming it", async () =>
    withTmpDir(async (dir) => {
      const tool = createGrepTool({ cwd: dir });
      const res = await tool.execute({ pattern: "(" }, fakeCtx(dir));
      expect(res.isError).toBe(true);
      expect(res.content).toMatch(/invalid regex "\("/);
    }));

  it("caps content matches at 1000 with a truncation marker", async () =>
    withTmpDir(async (dir) => {
      const lines = Array.from({ length: 1500 }, (_, i) => `x${i}`);
      await writeFile(join(dir, "big.txt"), lines.join("\n") + "\n");
      const tool = createGrepTool({ cwd: dir });
      const res = await tool.execute({ pattern: "x" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      const rows = res.content.split("\n");
      expect(rows).toHaveLength(1001); // 1000 matches + marker
      expect(rows[1000]).toBe("[truncated: showing first 1000 matches]");
    }));

  it("errors on invalid mode", async () =>
    withTmpDir(async (dir) => {
      const tool = createGrepTool({ cwd: dir });
      const res = await tool.execute({ pattern: "x", mode: "bogus" }, fakeCtx(dir));
      expect(res.isError).toBe(true);
      expect(res.content).toMatch(/"mode"/);
    }));

  it("returns empty content when nothing matches", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "a.txt"), "hello\n");
      const tool = createGrepTool({ cwd: dir });
      const res = await tool.execute({ pattern: "nope" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(res.content).toBe("");
    }));

  it("R6.4/R9.2: permissionFor is null in every mode", () => {
    const tool = createGrepTool({ cwd: "/proj" });
    for (const mode of MODES) {
      expect(tool.permissionFor({ pattern: "x" }, mode)).toBeNull();
    }
  });
});
