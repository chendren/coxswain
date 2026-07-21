import { readFile, stat } from "node:fs/promises";
import type { Tool, ToolResult } from "@cox/core";
import { splitLines } from "./lines";
import { resolveWithin } from "./paths";
import { expectObject, expectOptionalNumber, expectString } from "./validate";

const NAME = "read";
const MAX_LINES = 2000;
const MAX_BYTES = 2 * 1024 * 1024;

export function createReadTool(opts: { cwd: string }): Tool {
  return {
    spec: {
      name: NAME,
      description:
        "Read a file from the workspace as numbered lines (1-based: 'N\\t<text>'). " +
        "Supports offset/limit for large files; output is capped at 2000 lines / 2MB.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path, relative to cwd or absolute.",
          },
          offset: {
            type: "number",
            description: "1-based line number to start reading from (default 1).",
          },
          limit: {
            type: "number",
            description: `Max lines to return (default/cap ${MAX_LINES}).`,
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    // R6.4: read-only tool — no permission needed in any mode.
    permissionFor: () => null,
    async execute(input: unknown): Promise<ToolResult> {
      try {
        const obj = expectObject(input, NAME);
        const path = expectString(obj, "path", NAME);
        const offset = expectOptionalNumber(obj, "offset", NAME) ?? 1;
        const requestedLimit = expectOptionalNumber(obj, "limit", NAME) ?? MAX_LINES;
        if (offset < 1) throw new Error(`${NAME}: "offset" must be >= 1, got ${offset}`);
        if (requestedLimit < 1) {
          throw new Error(`${NAME}: "limit" must be >= 1, got ${requestedLimit}`);
        }
        const limit = Math.min(requestedLimit, MAX_LINES);

        const { abs } = resolveWithin(opts.cwd, path);
        const st = await stat(abs).catch(() => null);
        if (!st) throw new Error(`${NAME}: file not found: ${path}`);
        if (!st.isFile()) throw new Error(`${NAME}: not a file: ${path}`);

        const raw = await readFile(abs);
        const byteTruncated = raw.byteLength > MAX_BYTES;
        const buf = byteTruncated ? raw.subarray(0, MAX_BYTES) : raw;
        const text = buf.toString("utf8");

        const allLines = splitLines(text);
        const totalLines = allLines.length;
        const start = Math.min(offset - 1, totalLines);
        const end = Math.min(totalLines, start + limit);
        const slice = allLines.slice(start, end);

        const numbered = slice.map((line, i) => `${start + i + 1}\t${line}`).join("\n");

        const lineTruncated = end < totalLines;
        let content = numbered;
        if (byteTruncated || lineTruncated) {
          content +=
            `\n[truncated: ${slice.length} of ${totalLines} lines]` +
            (byteTruncated ? " (file exceeds 2MB; line count reflects only the read portion)" : "");
        }

        return { content, isError: false };
      } catch (err) {
        return { content: err instanceof Error ? err.message : String(err), isError: true };
      }
    },
  };
}
