import { realpath } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { configSchema, type CoxConfig, type PermissionMode } from "@cox/core";
import { createBashTool } from "../src/bash";
import { withTmpDir } from "./helpers/tmp";

function configWith(allowBash: string[] = [], denyBash: string[] = []): CoxConfig {
  return configSchema.parse({ permissions: { allowBash, denyBash } });
}

function fakeCtx(cwd: string) {
  return {
    cwd,
    sessionId: "s1",
    requestPermission: async () => "allow" as const,
    emit: () => {},
  };
}

describe("bash tool (R8.4)", () => {
  it("runs a command and captures stdout", async () =>
    withTmpDir(async (dir) => {
      const tool = createBashTool({ cwd: dir, config: configWith() });
      const res = await tool.execute({ command: "echo hello" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      expect(res.content).toBe("hello\n");
    }));

  it("captures combined stdout+stderr", async () =>
    withTmpDir(async (dir) => {
      const tool = createBashTool({ cwd: dir, config: configWith() });
      const res = await tool.execute(
        { command: "echo out; echo err 1>&2" },
        fakeCtx(dir),
      );
      expect(res.isError).toBe(false);
      expect(res.content).toContain("out");
      expect(res.content).toContain("err");
    }));

  it("runs in the given cwd", async () =>
    withTmpDir(async (dir) => {
      const tool = createBashTool({ cwd: dir, config: configWith() });
      const res = await tool.execute({ command: "pwd" }, fakeCtx(dir));
      expect(res.isError).toBe(false);
      // spawn resolves symlinks in cwd (e.g. macOS /tmp -> /private/tmp)
      // before the shell starts, so compare against the realpath.
      expect(res.content.trim()).toBe(await realpath(dir));
    }));

  it("reports non-zero exit code as isError with an exit code line", async () =>
    withTmpDir(async (dir) => {
      const tool = createBashTool({ cwd: dir, config: configWith() });
      const res = await tool.execute({ command: "exit 3" }, fakeCtx(dir));
      expect(res.isError).toBe(true);
      expect(res.content).toContain("[exit code: 3]");
    }));

  it(
    "kills a command that exceeds its timeout and reports it",
    async () =>
      withTmpDir(async (dir) => {
        const tool = createBashTool({ cwd: dir, config: configWith() });
        const res = await tool.execute({ command: "sleep 5", timeout: 1 }, fakeCtx(dir));
        expect(res.isError).toBe(true);
        expect(res.content).toContain("timed out after 1s");
      }),
    10_000,
  );

  it("truncates combined output to 30k chars with a marker", async () =>
    withTmpDir(async (dir) => {
      const tool = createBashTool({ cwd: dir, config: configWith() });
      const res = await tool.execute(
        { command: "head -c 40000 /dev/zero | tr '\\0' 'x'" },
        fakeCtx(dir),
      );
      expect(res.isError).toBe(false);
      const marker = "[truncated: output exceeds 30000 chars]";
      expect(res.content.endsWith(marker)).toBe(true);
      expect(res.content.length).toBe(30000 + 1 + marker.length);
    }));

  it("falls back to /bin/sh when $SHELL is unset", async () =>
    withTmpDir(async (dir) => {
      const original = process.env.SHELL;
      delete process.env.SHELL;
      try {
        const tool = createBashTool({ cwd: dir, config: configWith() });
        const res = await tool.execute({ command: "echo via-sh" }, fakeCtx(dir));
        expect(res.isError).toBe(false);
        expect(res.content).toBe("via-sh\n");
      } finally {
        if (original !== undefined) process.env.SHELL = original;
      }
    }));

  it("errors on invalid input", async () =>
    withTmpDir(async (dir) => {
      const tool = createBashTool({ cwd: dir, config: configWith() });
      const res = await tool.execute({}, fakeCtx(dir));
      expect(res.isError).toBe(true);
      expect(res.content).toMatch(/"command"/);
    }));

  describe("permissionFor prefix rules", () => {
    const MODES: PermissionMode[] = ["default", "acceptEdits", "plan", "yolo"];

    it("denyBash: never prompts, in any mode", () => {
      const tool = createBashTool({ cwd: "/proj", config: configWith([], ["rm "]) });
      for (const mode of MODES) {
        expect(tool.permissionFor({ command: "rm -rf /" }, mode)).toBeNull();
      }
    });

    it("deny beats allow when both prefixes match", async () =>
      withTmpDir(async (dir) => {
        const config = configWith(["echo"], ["echo"]);
        const tool = createBashTool({ cwd: dir, config });
        expect(tool.permissionFor({ command: "echo hi" }, "default")).toBeNull();
        const res = await tool.execute({ command: "echo should-not-run" }, fakeCtx(dir));
        expect(res.isError).toBe(true);
        expect(res.content).toMatch(/denied by policy/);
        expect(res.content).not.toContain("should-not-run");
      }));

    it("allowBash: no prompt in default/acceptEdits/yolo, still gated in plan", () => {
      const tool = createBashTool({ cwd: "/proj", config: configWith(["git status"]) });
      expect(tool.permissionFor({ command: "git status" }, "default")).toBeNull();
      expect(tool.permissionFor({ command: "git status" }, "acceptEdits")).toBeNull();
      expect(tool.permissionFor({ command: "git status" }, "yolo")).toBeNull();
      expect(tool.permissionFor({ command: "git status" }, "plan")).not.toBeNull();
    });

    it("other commands: prompts in default/acceptEdits/plan, not yolo", () => {
      const tool = createBashTool({ cwd: "/proj", config: configWith() });
      expect(tool.permissionFor({ command: "curl evil.example" }, "default")).not.toBeNull();
      expect(tool.permissionFor({ command: "curl evil.example" }, "acceptEdits")).not.toBeNull();
      expect(tool.permissionFor({ command: "curl evil.example" }, "plan")).not.toBeNull();
      expect(tool.permissionFor({ command: "curl evil.example" }, "yolo")).toBeNull();
    });

    it("matches prefixes against the trimmed command", () => {
      const tool = createBashTool({ cwd: "/proj", config: configWith(["git "]) });
      expect(tool.permissionFor({ command: "  git status" }, "default")).toBeNull();
    });
  });
});
