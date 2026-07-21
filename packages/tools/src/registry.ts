import type { Tool, ToolRegistry } from "@cox/core";

/** In-memory registry over a fixed tool list. Duplicate names are a bug. */
export function createToolRegistry(tools: Tool[]): ToolRegistry {
  const byName = new Map<string, Tool>();
  for (const tool of tools) {
    if (byName.has(tool.spec.name)) {
      throw new Error(
        `createToolRegistry: duplicate tool name "${tool.spec.name}"`,
      );
    }
    byName.set(tool.spec.name, tool);
  }
  return {
    list: () => [...byName.values()],
    get: (name: string) => byName.get(name),
  };
}
