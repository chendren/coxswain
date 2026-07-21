import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PermissionMode, PermissionRequest, Tool, ToolResult } from "@cox/core";
import { mutationPermission } from "./mutation-permission";
import { resolveWithin } from "./paths";
import { expectObject, expectString } from "./validate";

const NAME = "write";

function tryExtractPath(input: unknown): string {
  if (
    typeof input === "object" &&
    input !== null &&
    typeof (input as Record<string, unknown>).path === "string"
  ) {
    return (input as Record<string, unknown>).path as string;
  }
  return "";
}

export function createWriteTool(opts: { cwd: string }): Tool {
  return {
    spec: {
      name: NAME,
      description:
        "Write content to a file, creating parent directories as needed. Overwrites any existing file.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path, relative to cwd or absolute." },
          content: { type: "string", description: "Full file content to write." },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
    permissionFor(input: unknown, mode: PermissionMode): PermissionRequest | null {
      const path = tryExtractPath(input);
      return mutationPermission(opts.cwd, path, mode, NAME, "write");
    },
    async execute(input: unknown): Promise<ToolResult> {
      try {
        const obj = expectObject(input, NAME);
        const path = expectString(obj, "path", NAME);
        const content = expectString(obj, "content", NAME);
        const { abs } = resolveWithin(opts.cwd, path);

        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, content, "utf8");

        const bytes = Buffer.byteLength(content, "utf8");
        return { content: `wrote ${bytes} bytes to ${path}`, isError: false };
      } catch (err) {
        return { content: err instanceof Error ? err.message : String(err), isError: true };
      }
    },
  };
}
