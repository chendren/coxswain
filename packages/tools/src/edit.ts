import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { PermissionMode, PermissionRequest, Tool, ToolResult } from "@cox/core";
import { unifiedDiff } from "./diff";
import { mutationPermission } from "./mutation-permission";
import { resolveWithin } from "./paths";
import { expectObject, expectString } from "./validate";

const NAME = "edit";

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    count++;
    from = at + needle.length;
  }
  return count;
}

function tryExtractEditInput(
  input: unknown,
): { path: string; oldString: string; newString: string } {
  const obj = typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)
    : {};
  return {
    path: typeof obj.path === "string" ? obj.path : "",
    oldString: typeof obj.old_string === "string" ? obj.old_string : "",
    newString: typeof obj.new_string === "string" ? obj.new_string : "",
  };
}

export function createEditTool(opts: { cwd: string }): Tool {
  return {
    spec: {
      name: NAME,
      description:
        "Replace an exact, unique substring in a file with new text. Fails if " +
        "old_string matches zero times or more than once.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path, relative to cwd or absolute." },
          old_string: {
            type: "string",
            description: "Exact text to find; must match exactly once in the file.",
          },
          new_string: { type: "string", description: "Replacement text." },
        },
        required: ["path", "old_string", "new_string"],
        additionalProperties: false,
      },
    },
    // R8.3: PermissionRequest.detail carries a unified diff preview. Building
    // it needs the current file content, but permissionFor is synchronous
    // (frozen contract) — readFileSync is a narrow, deliberate exception to
    // the "async fs in engines" convention; see packages/tools/NOTES.md.
    permissionFor(input: unknown, mode: PermissionMode): PermissionRequest | null {
      const { path, oldString, newString } = tryExtractEditInput(input);
      let detail: string | undefined;
      try {
        const { abs } = resolveWithin(opts.cwd, path);
        const before = readFileSync(abs, "utf8");
        if (countOccurrences(before, oldString) === 1) {
          const after = before.replace(oldString, newString);
          detail = unifiedDiff(path, before, after, 3);
        }
      } catch {
        // Missing/unreadable file — execute() surfaces the real error; the
        // prompt still fires, just without a diff preview.
      }
      return mutationPermission(opts.cwd, path, mode, NAME, "edit", detail);
    },
    async execute(input: unknown): Promise<ToolResult> {
      try {
        const obj = expectObject(input, NAME);
        const path = expectString(obj, "path", NAME);
        const oldString = expectString(obj, "old_string", NAME);
        const newString = expectString(obj, "new_string", NAME);

        const { abs } = resolveWithin(opts.cwd, path);
        let before: string;
        try {
          before = await readFile(abs, "utf8");
        } catch {
          throw new Error(`${NAME}: file not found: ${path}`);
        }

        const count = countOccurrences(before, oldString);
        if (count !== 1) {
          throw new Error(
            `${NAME}: old_string matched ${count} times in ${path} — must match exactly once`,
          );
        }

        const after = before.replace(oldString, newString);
        await writeFile(abs, after, "utf8");
        return { content: `edited ${path}`, isError: false };
      } catch (err) {
        return { content: err instanceof Error ? err.message : String(err), isError: true };
      }
    },
  };
}
