import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEditTool } from "../src/edit";
import { unifiedDiff } from "../src/diff";
import { withTmpDir } from "./helpers/tmp";

function fakeCtx(cwd: string) {
  return {
    cwd,
    sessionId: "s1",
    requestPermission: async () => "allow" as const,
    emit: () => {},
  };
}

describe("unifiedDiff", () => {
  it("renders a hunk with context, - and + lines", () => {
    const before = "a\nb\nc\nd\ne\n";
    const after = "a\nb\nX\nd\ne\n";
    const diff = unifiedDiff("f.txt", before, after, 1);
    expect(diff).toContain("--- f.txt");
    expect(diff).toContain("+++ f.txt");
    expect(diff).toContain("@@");
    expect(diff).toContain("-c");
    expect(diff).toContain("+X");
    expect(diff).toContain(" b"); // context line
    expect(diff).toContain(" d"); // context line
  });

  it("handles a multi-line replacement", () => {
    const before = "one\ntwo\nthree\n";
    const after = "one\nTWO\nTHREE\nthree\n";
    const diff = unifiedDiff("f.txt", before, after, 3);
    expect(diff).toContain("-two");
    expect(diff).toContain("+TWO");
    expect(diff).toContain("+THREE");
  });
});

describe("edit tool (R8.3)", () => {
  it("replaces a unique match", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "a.txt"), "hello world\n");
      const tool = createEditTool({ cwd: dir });
      const res = await tool.execute(
        { path: "a.txt", old_string: "world", new_string: "there" },
        fakeCtx(dir),
      );
      expect(res.isError).toBe(false);
      expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("hello there\n");
    }));

  it("supports multi-line old_string", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "a.txt"), "function f() {\n  return 1;\n}\n");
      const tool = createEditTool({ cwd: dir });
      const res = await tool.execute(
        {
          path: "a.txt",
          old_string: "function f() {\n  return 1;\n}",
          new_string: "function f() {\n  return 2;\n}",
        },
        fakeCtx(dir),
      );
      expect(res.isError).toBe(false);
      expect(await readFile(join(dir, "a.txt"), "utf8")).toBe(
        "function f() {\n  return 2;\n}\n",
      );
    }));

  it("errors naming the count when old_string matches zero times", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "a.txt"), "hello world\n");
      const tool = createEditTool({ cwd: dir });
      const res = await tool.execute(
        { path: "a.txt", old_string: "nope", new_string: "x" },
        fakeCtx(dir),
      );
      expect(res.isError).toBe(true);
      expect(res.content).toBe(
        "edit: old_string matched 0 times in a.txt — must match exactly once",
      );
    }));

  it("errors naming the count when old_string matches multiple times", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "a.txt"), "foo foo foo\n");
      const tool = createEditTool({ cwd: dir });
      const res = await tool.execute(
        { path: "a.txt", old_string: "foo", new_string: "bar" },
        fakeCtx(dir),
      );
      expect(res.isError).toBe(true);
      expect(res.content).toBe(
        "edit: old_string matched 3 times in a.txt — must match exactly once",
      );
    }));

  it("errors on a missing file", async () =>
    withTmpDir(async (dir) => {
      const tool = createEditTool({ cwd: dir });
      const res = await tool.execute(
        { path: "nope.txt", old_string: "a", new_string: "b" },
        fakeCtx(dir),
      );
      expect(res.isError).toBe(true);
      expect(res.content).toMatch(/file not found/);
    }));

  it("R8.3: PermissionRequest.detail carries a unified diff", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "a.txt"), "hello world\n");
      const tool = createEditTool({ cwd: dir });
      const req = tool.permissionFor(
        { path: "a.txt", old_string: "world", new_string: "there" },
        "default",
      );
      expect(req).not.toBeNull();
      expect(req?.detail).toContain("-hello world");
      expect(req?.detail).toContain("+hello there");
    }));

  it("permissionFor still returns a request without a diff when the file can't be read", () => {
    const tool = createEditTool({ cwd: "/does/not/exist" });
    const req = tool.permissionFor(
      { path: "a.txt", old_string: "x", new_string: "y" },
      "default",
    );
    expect(req).not.toBeNull();
    expect(req?.detail).toBeUndefined();
  });

  describe("permissionFor matrix", () => {
    it("acceptEdits: does not prompt inside cwd", async () =>
      withTmpDir(async (dir) => {
        await writeFile(join(dir, "a.txt"), "x\n");
        const tool = createEditTool({ cwd: dir });
        expect(
          tool.permissionFor({ path: "a.txt", old_string: "x", new_string: "y" }, "acceptEdits"),
        ).toBeNull();
      }));

    it("R8.2: OUTSIDE PROJECT summary when escaping cwd, even in acceptEdits", () => {
      const tool = createEditTool({ cwd: "/proj" });
      const req = tool.permissionFor(
        { path: "../etc/passwd", old_string: "x", new_string: "y" },
        "acceptEdits",
      );
      expect(req?.summary.startsWith("OUTSIDE PROJECT")).toBe(true);
    });
  });
});
