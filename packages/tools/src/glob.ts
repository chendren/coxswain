import type { Tool, ToolResult } from "@cox/core";
import { globToRegExp } from "./globmatch";
import { walk } from "./walk";
import { expectObject, expectOptionalNumber, expectString } from "./validate";

const NAME = "glob";
const DEFAULT_LIMIT = 100;

export function createGlobTool(opts: { cwd: string }): Tool {
  return {
    spec: {
      name: NAME,
      description:
        "Find files matching a glob pattern (supports **, *, ?, {a,b}), relative to " +
        "cwd, newest-modified first.",
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern, e.g. 'src/**/*.ts'." },
          limit: { type: "number", description: `Max results (default ${DEFAULT_LIMIT}).` },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    },
    // R6.4: read-only tool — no permission needed in any mode.
    permissionFor: () => null,
    async execute(input: unknown): Promise<ToolResult> {
      try {
        const obj = expectObject(input, NAME);
        const pattern = expectString(obj, "pattern", NAME);
        const limit = expectOptionalNumber(obj, "limit", NAME) ?? DEFAULT_LIMIT;
        if (limit < 1) throw new Error(`${NAME}: "limit" must be >= 1, got ${limit}`);

        const re = globToRegExp(pattern);
        const matches: { path: string; mtimeMs: number }[] = [];
        for await (const entry of walk(opts.cwd)) {
          if (re.test(entry.path)) matches.push(entry);
        }
        matches.sort((a, b) => b.mtimeMs - a.mtimeMs);

        const content = matches
          .slice(0, limit)
          .map((m) => m.path)
          .join("\n");
        return { content, isError: false };
      } catch (err) {
        return { content: err instanceof Error ? err.message : String(err), isError: true };
      }
    },
  };
}
