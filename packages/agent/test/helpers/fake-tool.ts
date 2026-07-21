import type { PermissionMode, PermissionRequest, Tool, ToolResult } from "@cox/core";

export function fakeTool(opts: {
  name: string;
  permissionFor?: (input: unknown, mode: PermissionMode) => PermissionRequest | null;
  result?: ToolResult;
  onExecute?: (input: unknown) => void;
}): Tool {
  return {
    spec: { name: opts.name, description: `fake ${opts.name}`, inputSchema: {} },
    permissionFor: opts.permissionFor ?? (() => null),
    execute: async (input: unknown) => {
      opts.onExecute?.(input);
      return opts.result ?? { content: `${opts.name} ok`, isError: false };
    },
  };
}
