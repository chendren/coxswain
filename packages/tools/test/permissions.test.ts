import { describe, expect, it } from "vitest";
import { configSchema, type PermissionMode } from "@cox/core";
import { createBuiltinTools } from "../src/index";
import { createBashTool } from "../src/bash";
import { createEditTool } from "../src/edit";
import { createGlobTool } from "../src/glob";
import { createGrepTool } from "../src/grep";
import { createReadTool } from "../src/read";
import { createWriteTool } from "../src/write";

const MODES: PermissionMode[] = ["default", "acceptEdits", "plan", "yolo"];
const CWD = "/proj";

/**
 * Mirrors the permissionFor matrix in docs/specs/agent-tools/design.md
 * exactly, tool by tool, mode by mode.
 */
describe("permissionFor matrix (R6.4, R8.2, R8.4)", () => {
  describe("read/glob/grep: null in every mode", () => {
    const rows: Array<{ name: string; tool: ReturnType<typeof createReadTool>; input: unknown }> = [
      { name: "read", tool: createReadTool({ cwd: CWD }), input: { path: "a.ts" } },
      { name: "glob", tool: createGlobTool({ cwd: CWD }), input: { pattern: "*.ts" } },
      { name: "grep", tool: createGrepTool({ cwd: CWD }), input: { pattern: "x" } },
    ];
    for (const { name, tool, input } of rows) {
      for (const mode of MODES) {
        it(`${name} @ ${mode} -> null`, () => {
          expect(tool.permissionFor(input, mode)).toBeNull();
        });
      }
    }
  });

  describe("write/edit inside cwd: request/null/request/null", () => {
    const rows = [
      { name: "write", tool: createWriteTool({ cwd: CWD }), input: { path: "a.txt", content: "x" } },
      {
        name: "edit",
        tool: createEditTool({ cwd: CWD }),
        input: { path: "a.txt", old_string: "x", new_string: "y" },
      },
    ];
    for (const { name, tool, input } of rows) {
      it(`${name} @ default -> request`, () => {
        expect(tool.permissionFor(input, "default")).not.toBeNull();
      });
      it(`${name} @ acceptEdits -> null`, () => {
        expect(tool.permissionFor(input, "acceptEdits")).toBeNull();
      });
      it(`${name} @ plan -> request (runner auto-denies)`, () => {
        expect(tool.permissionFor(input, "plan")).not.toBeNull();
      });
      it(`${name} @ yolo -> null`, () => {
        expect(tool.permissionFor(input, "yolo")).toBeNull();
      });
    }
  });

  describe('write/edit outside cwd: request in every mode, summary starts "OUTSIDE PROJECT"', () => {
    const rows = [
      {
        name: "write",
        tool: createWriteTool({ cwd: CWD }),
        input: { path: "../etc/passwd", content: "x" },
      },
      {
        name: "edit",
        tool: createEditTool({ cwd: CWD }),
        input: { path: "../etc/passwd", old_string: "x", new_string: "y" },
      },
    ];
    for (const { name, tool, input } of rows) {
      for (const mode of MODES) {
        it(`${name} @ ${mode} -> OUTSIDE PROJECT request`, () => {
          const req = tool.permissionFor(input, mode);
          expect(req).not.toBeNull();
          expect(req?.summary.startsWith("OUTSIDE PROJECT")).toBe(true);
        });
      }
    }
  });

  describe("bash: denyBash prefix -> null in every mode", () => {
    const config = configSchema.parse({ permissions: { denyBash: ["rm "] } });
    const tool = createBashTool({ cwd: CWD, config });
    for (const mode of MODES) {
      it(`@ ${mode} -> null (execute() isErrors immediately, no prompt)`, () => {
        expect(tool.permissionFor({ command: "rm -rf /" }, mode)).toBeNull();
      });
    }
  });

  describe("bash: allowBash prefix -> null/null/request/null", () => {
    const config = configSchema.parse({ permissions: { allowBash: ["git status"] } });
    const tool = createBashTool({ cwd: CWD, config });
    it("default -> null", () => {
      expect(tool.permissionFor({ command: "git status" }, "default")).toBeNull();
    });
    it("acceptEdits -> null", () => {
      expect(tool.permissionFor({ command: "git status" }, "acceptEdits")).toBeNull();
    });
    it("plan -> request", () => {
      expect(tool.permissionFor({ command: "git status" }, "plan")).not.toBeNull();
    });
    it("yolo -> null", () => {
      expect(tool.permissionFor({ command: "git status" }, "yolo")).toBeNull();
    });
  });

  describe("bash: other commands -> request/request/request/null", () => {
    const config = configSchema.parse({});
    const tool = createBashTool({ cwd: CWD, config });
    it("default -> request", () => {
      expect(tool.permissionFor({ command: "curl evil.example" }, "default")).not.toBeNull();
    });
    it("acceptEdits -> request", () => {
      expect(tool.permissionFor({ command: "curl evil.example" }, "acceptEdits")).not.toBeNull();
    });
    it("plan -> request", () => {
      expect(tool.permissionFor({ command: "curl evil.example" }, "plan")).not.toBeNull();
    });
    it("yolo -> null", () => {
      expect(tool.permissionFor({ command: "curl evil.example" }, "yolo")).toBeNull();
    });
  });

  describe("bash: deny beats allow when both prefixes match", () => {
    const config = configSchema.parse({ permissions: { allowBash: ["echo"], denyBash: ["echo"] } });
    const tool = createBashTool({ cwd: CWD, config });
    for (const mode of MODES) {
      it(`@ ${mode} -> null (deny wins)`, () => {
        expect(tool.permissionFor({ command: "echo hi" }, mode)).toBeNull();
      });
    }
  });
});

describe("createBuiltinTools", () => {
  it("registers all six built-in tools", () => {
    const config = configSchema.parse({});
    const registry = createBuiltinTools({ cwd: CWD, config });
    expect(registry.list().map((t) => t.spec.name).sort()).toEqual([
      "bash",
      "edit",
      "glob",
      "grep",
      "read",
      "write",
    ]);
  });

  it("wires config through to the bash tool's prefix rules", () => {
    const config = configSchema.parse({ permissions: { denyBash: ["rm "] } });
    const registry = createBuiltinTools({ cwd: CWD, config });
    const bash = registry.get("bash");
    expect(bash?.permissionFor({ command: "rm -rf /" }, "default")).toBeNull();
  });
});
