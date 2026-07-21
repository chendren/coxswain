import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWriteTool } from "../src/write";
import { withTmpDir } from "./helpers/tmp";

function fakeCtx(cwd: string) {
  return {
    cwd,
    sessionId: "s1",
    requestPermission: async () => "allow" as const,
    emit: () => {},
  };
}

describe("write tool (R8.2)", () => {
  it("creates parent directories and writes content", async () =>
    withTmpDir(async (dir) => {
      const tool = createWriteTool({ cwd: dir });
      const res = await tool.execute(
        { path: "a/b/c.txt", content: "hello" },
        fakeCtx(dir),
      );
      expect(res.isError).toBe(false);
      expect(res.content).toBe("wrote 5 bytes to a/b/c.txt");
      const written = await readFile(join(dir, "a/b/c.txt"), "utf8");
      expect(written).toBe("hello");
    }));

  it("overwrites an existing file", async () =>
    withTmpDir(async (dir) => {
      const tool = createWriteTool({ cwd: dir });
      await tool.execute({ path: "f.txt", content: "one" }, fakeCtx(dir));
      const res = await tool.execute({ path: "f.txt", content: "two" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(await readFile(join(dir, "f.txt"), "utf8")).toBe("two");
    }));

  it("reports byte count, not char count, for multi-byte content", async () =>
    withTmpDir(async (dir) => {
      const tool = createWriteTool({ cwd: dir });
      const res = await tool.execute({ path: "u.txt", content: "café" }, fakeCtx(dir));
      // "café" is 4 chars but 5 bytes (é is 2 bytes in utf8)
      expect(res.content).toBe("wrote 5 bytes to u.txt");
    }));

  it("errors on invalid input", async () =>
    withTmpDir(async (dir) => {
      const tool = createWriteTool({ cwd: dir });
      const res = await tool.execute({ path: "x.txt" }, fakeCtx(dir));
      expect(res.isError).toBe(true);
      expect(res.content).toMatch(/"content"/);
    }));

  describe("permissionFor matrix", () => {
    it("default: prompts for a path inside cwd", () => {
      const tool = createWriteTool({ cwd: "/proj" });
      const req = tool.permissionFor({ path: "a.txt", content: "x" }, "default");
      expect(req).not.toBeNull();
      expect(req?.summary).toBe("write a.txt");
    });

    it("acceptEdits: does not prompt for a path inside cwd", () => {
      const tool = createWriteTool({ cwd: "/proj" });
      expect(tool.permissionFor({ path: "a.txt", content: "x" }, "acceptEdits")).toBeNull();
    });

    it("plan: still returns a request for a path inside cwd (runner auto-denies)", () => {
      const tool = createWriteTool({ cwd: "/proj" });
      const req = tool.permissionFor({ path: "a.txt", content: "x" }, "plan");
      expect(req).not.toBeNull();
    });

    it("yolo: does not prompt for a path inside cwd", () => {
      const tool = createWriteTool({ cwd: "/proj" });
      expect(tool.permissionFor({ path: "a.txt", content: "x" }, "yolo")).toBeNull();
    });

    it("R8.2: OUTSIDE PROJECT summary when escaping cwd, even in acceptEdits", () => {
      const tool = createWriteTool({ cwd: "/proj" });
      const req = tool.permissionFor({ path: "../etc/passwd", content: "x" }, "acceptEdits");
      expect(req).not.toBeNull();
      expect(req?.summary.startsWith("OUTSIDE PROJECT")).toBe(true);
    });

    it("R8.2: OUTSIDE PROJECT summary when escaping cwd, even in yolo", () => {
      const tool = createWriteTool({ cwd: "/proj" });
      const req = tool.permissionFor({ path: "/etc/passwd", content: "x" }, "yolo");
      expect(req).not.toBeNull();
      expect(req?.summary.startsWith("OUTSIDE PROJECT")).toBe(true);
    });
  });
});
