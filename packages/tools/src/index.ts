import type { CoxConfig, Tool, ToolRegistry } from "@cox/core";
import { createBashTool } from "./bash";
import { createEditTool } from "./edit";
import { createGlobTool } from "./glob";
import { createGrepTool } from "./grep";
import { createReadTool } from "./read";
import { createToolRegistry } from "./registry";
import { createWriteTool } from "./write";

export { createToolRegistry } from "./registry";
export { createReadTool } from "./read";
export { createWriteTool } from "./write";
export { createEditTool } from "./edit";
export { createGlobTool } from "./glob";
export { createGrepTool } from "./grep";
export { createBashTool } from "./bash";

/** All six built-in tools (read, write, edit, bash, glob, grep), registered. */
export function createBuiltinTools(opts: { cwd: string; config: CoxConfig }): ToolRegistry {
  const tools: Tool[] = [
    createReadTool({ cwd: opts.cwd }),
    createWriteTool({ cwd: opts.cwd }),
    createEditTool({ cwd: opts.cwd }),
    createBashTool({ cwd: opts.cwd, config: opts.config }),
    createGlobTool({ cwd: opts.cwd }),
    createGrepTool({ cwd: opts.cwd }),
  ];
  return createToolRegistry(tools);
}
