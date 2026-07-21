import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Tool, ToolResult } from "@cox/core";
import { globToRegExp } from "./globmatch";
import { splitLines } from "./lines";
import { walk } from "./walk";
import {
  expectObject,
  expectOptionalNumber,
  expectOptionalString,
  expectString,
} from "./validate";

const NAME = "grep";
const DEFAULT_LIMIT = 1000;
const BINARY_SNIFF_BYTES = 8000;

type GrepMode = "content" | "files" | "count";

function isBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export function createGrepTool(opts: { cwd: string }): Tool {
  return {
    spec: {
      name: NAME,
      description:
        "Search file contents with a regular expression, optionally filtered by a " +
        "glob. Modes: content (matching lines), files (paths only), count " +
        "(match counts per file). Skips binary files.",
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regular expression (JS syntax)." },
          glob: { type: "string", description: "Optional glob filter, e.g. '**/*.ts'." },
          mode: {
            type: "string",
            enum: ["content", "files", "count"],
            description: "Output mode (default content).",
          },
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
        const globPattern = expectOptionalString(obj, "glob", NAME);
        const modeStr = expectOptionalString(obj, "mode", NAME) ?? "content";
        if (modeStr !== "content" && modeStr !== "files" && modeStr !== "count") {
          throw new Error(
            `${NAME}: "mode" must be one of content|files|count, got "${modeStr}"`,
          );
        }
        const mode = modeStr as GrepMode;
        const limit = expectOptionalNumber(obj, "limit", NAME) ?? DEFAULT_LIMIT;
        if (limit < 1) throw new Error(`${NAME}: "limit" must be >= 1, got ${limit}`);

        let regex: RegExp;
        try {
          regex = new RegExp(pattern);
        } catch (err) {
          throw new Error(
            `${NAME}: invalid regex "${pattern}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        const globRe = globPattern ? globToRegExp(globPattern) : null;

        const contentLines: string[] = [];
        const filesWithMatch: string[] = [];
        const countPerFile: { path: string; count: number }[] = [];
        let truncated = false;

        walkLoop: for await (const entry of walk(opts.cwd)) {
          if (globRe && !globRe.test(entry.path)) continue;

          const buf = await readFile(join(opts.cwd, entry.path)).catch(() => null);
          if (!buf || isBinary(buf)) continue;

          const lines = splitLines(buf.toString("utf8"));

          if (mode === "content") {
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i] ?? "";
              if (!regex.test(line)) continue;
              if (contentLines.length >= limit) {
                truncated = true;
                break walkLoop;
              }
              contentLines.push(`${entry.path}:${i + 1}: ${line}`);
            }
          } else {
            const fileMatchCount = lines.reduce((n, line) => (regex.test(line) ? n + 1 : n), 0);
            if (fileMatchCount === 0) continue;
            if (filesWithMatch.length >= limit) {
              truncated = true;
              break walkLoop;
            }
            filesWithMatch.push(entry.path);
            countPerFile.push({ path: entry.path, count: fileMatchCount });
          }
        }

        let content: string;
        if (mode === "content") {
          content = contentLines.join("\n");
          if (truncated) content += `\n[truncated: showing first ${limit} matches]`;
        } else if (mode === "files") {
          content = filesWithMatch.join("\n");
          if (truncated) content += `\n[truncated: showing first ${limit} files]`;
        } else {
          content = countPerFile.map((f) => `${f.path}: ${f.count}`).join("\n");
          if (truncated) content += `\n[truncated: showing first ${limit} files]`;
        }

        return { content, isError: false };
      } catch (err) {
        return { content: err instanceof Error ? err.message : String(err), isError: true };
      }
    },
  };
}
