import { describe, expect, it } from "vitest";
import type { Tool } from "@cox/core";
import { createToolRegistry } from "../src/registry";
import { resolveWithin } from "../src/paths";
import {
  expectNumber,
  expectObject,
  expectOptionalNumber,
  expectOptionalString,
  expectString,
} from "../src/validate";

function fakeTool(name: string): Tool {
  return {
    spec: { name, description: "d", inputSchema: {} },
    permissionFor: () => null,
    execute: async () => ({ content: "ok", isError: false }),
  };
}

describe("resolveWithin (R8.2)", () => {
  it("keeps relative paths inside cwd", () => {
    const { abs, outside } = resolveWithin("/proj", "src/x.ts");
    expect(abs).toBe("/proj/src/x.ts");
    expect(outside).toBe(false);
  });

  it("flags .. escapes", () => {
    const { outside } = resolveWithin("/proj", "../etc/passwd");
    expect(outside).toBe(true);
  });

  it("flags deeper .. escapes", () => {
    const { outside } = resolveWithin("/proj", "a/../../etc/passwd");
    expect(outside).toBe(true);
  });

  it("flags absolute paths outside cwd", () => {
    const { outside } = resolveWithin("/proj", "/etc/passwd");
    expect(outside).toBe(true);
  });

  it("does not flag an absolute path that resolves inside cwd", () => {
    const { outside } = resolveWithin("/proj", "/proj/src/x.ts");
    expect(outside).toBe(false);
  });

  it("does not flag cwd itself", () => {
    const { outside, abs } = resolveWithin("/proj", ".");
    expect(outside).toBe(false);
    expect(abs).toBe("/proj");
  });
});

describe("createToolRegistry", () => {
  it("lists and gets registered tools", () => {
    const reg = createToolRegistry([fakeTool("a"), fakeTool("b")]);
    expect(reg.list().map((t) => t.spec.name).sort()).toEqual(["a", "b"]);
    expect(reg.get("a")?.spec.name).toBe("a");
    expect(reg.get("missing")).toBeUndefined();
  });

  it("rejects duplicate tool names with an actionable error", () => {
    expect(() => createToolRegistry([fakeTool("a"), fakeTool("a")])).toThrow(
      /duplicate tool name "a"/,
    );
  });

  it("returns an empty registry for an empty tool list", () => {
    const reg = createToolRegistry([]);
    expect(reg.list()).toEqual([]);
  });
});

describe("validate: invalid inputs raise actionable errors", () => {
  it("expectObject rejects non-objects", () => {
    expect(() => expectObject("nope", "t")).toThrow(/t: input must be an object, got string/);
    expect(() => expectObject(null, "t")).toThrow(/got null/);
    expect(() => expectObject([1, 2], "t")).toThrow(/got array/);
  });

  it("expectString names the field and the tool on failure", () => {
    expect(() => expectString(expectObject({}, "read"), "path", "read")).toThrow(
      /read: "path" must be a string, got undefined/,
    );
  });

  it("expectString returns the value when present", () => {
    expect(expectString({ path: "a.ts" }, "path", "read")).toBe("a.ts");
  });

  it("expectOptionalString allows undefined, rejects wrong type", () => {
    expect(expectOptionalString({}, "old_string", "edit")).toBeUndefined();
    expect(() => expectOptionalString({ old_string: 5 }, "old_string", "edit")).toThrow(
      /"old_string" must be a string when provided, got number/,
    );
  });

  it("expectNumber requires a real number", () => {
    expect(expectNumber({ limit: 5 }, "limit", "glob")).toBe(5);
    expect(() => expectNumber({ limit: "5" }, "limit", "glob")).toThrow(
      /"limit" must be a number, got string/,
    );
    expect(() => expectNumber({ limit: Number.NaN }, "limit", "glob")).toThrow(
      /"limit" must be a number/,
    );
  });

  it("expectOptionalNumber allows undefined, rejects wrong type", () => {
    expect(expectOptionalNumber({}, "limit", "glob")).toBeUndefined();
    expect(() => expectOptionalNumber({ limit: "5" }, "limit", "glob")).toThrow(
      /"limit" must be a number when provided, got string/,
    );
  });
});
