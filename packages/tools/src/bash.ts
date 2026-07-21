import { spawn } from "node:child_process";
import type {
  CoxConfig,
  PermissionMode,
  PermissionRequest,
  Tool,
  ToolContext,
  ToolResult,
} from "@cox/core";
import { expectObject, expectOptionalNumber, expectString } from "./validate";

const NAME = "bash";
const DEFAULT_TIMEOUT_SEC = 120;
const MAX_OUTPUT_CHARS = 30_000;
const KILL_GRACE_MS = 2_000;

function matchingPrefix(command: string, prefixes: string[]): string | null {
  for (const p of prefixes) {
    if (command.startsWith(p)) return p;
  }
  return null;
}

function tryExtractCommand(input: unknown): string {
  if (
    typeof input === "object" &&
    input !== null &&
    typeof (input as Record<string, unknown>).command === "string"
  ) {
    return (input as Record<string, unknown>).command as string;
  }
  return "";
}

function summarize(command: string): string {
  const firstLine = command.split("\n")[0] ?? "";
  return firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine;
}

function capOutput(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

function runCommand(
  command: string,
  cwd: string,
  timeoutSec: number,
  signal?: AbortSignal,
): Promise<ToolResult> {
  return new Promise((resolve) => {
    const shell = process.env.SHELL ?? "/bin/sh";
    const child = spawn(shell, ["-c", command], { cwd, stdio: ["ignore", "pipe", "pipe"] });

    const chunks: Buffer[] = [];
    child.stdout?.on("data", (d: Buffer) => chunks.push(d));
    child.stderr?.on("data", (d: Buffer) => chunks.push(d));

    let settled = false;
    let timedOut = false;
    let aborted = false;
    let killTimer: NodeJS.Timeout | undefined;

    const killChild = () => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
      killTimer.unref?.();
    };
    const onAbort = () => {
      aborted = true;
      killChild();
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      killChild();
    }, timeoutSec * 1000);
    timer.unref?.();

    const finish = (result: ToolResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    child.on("error", (err) => {
      finish({ content: `${NAME}: failed to start: ${err.message}`, isError: true });
    });

    child.on("close", (code, signal) => {
      const combined = Buffer.concat(chunks).toString("utf8");
      const { text, truncated } = capOutput(combined, MAX_OUTPUT_CHARS);
      let out = text;
      if (truncated) out += `\n[truncated: output exceeds ${MAX_OUTPUT_CHARS} chars]`;

      if (aborted) {
        out += `\n[error] aborted by user`;
        finish({ content: out, isError: true });
        return;
      }
      if (timedOut) {
        out += `\n[error] timed out after ${timeoutSec}s`;
        finish({ content: out, isError: true });
        return;
      }
      if (code !== 0) {
        out += `\n[exit code: ${code ?? `null (killed by signal ${signal})`}]`;
        finish({ content: out, isError: true });
        return;
      }
      finish({ content: out, isError: false });
    });
  });
}

export function createBashTool(opts: { cwd: string; config: CoxConfig }): Tool {
  return {
    spec: {
      name: NAME,
      description:
        `Run a shell command via $SHELL -c (fallback /bin/sh). Default timeout ` +
        `${DEFAULT_TIMEOUT_SEC}s, input-overridable. Combined stdout+stderr is ` +
        `captured and truncated to ${MAX_OUTPUT_CHARS} chars.`,
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run." },
          timeout: {
            type: "number",
            description: `Timeout in seconds (default ${DEFAULT_TIMEOUT_SEC}).`,
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
    // R8.4: denyBash/allowBash prefix rules are checked BEFORE any prompt.
    permissionFor(input: unknown, mode: PermissionMode): PermissionRequest | null {
      const command = tryExtractCommand(input);
      const trimmed = command.trim();

      if (matchingPrefix(trimmed, opts.config.permissions.denyBash)) {
        return null; // execute() isErrors immediately — nothing to prompt for
      }
      if (matchingPrefix(trimmed, opts.config.permissions.allowBash)) {
        if (mode === "plan") {
          return { toolName: NAME, summary: `bash: ${summarize(command)}`, detail: command };
        }
        return null;
      }
      if (mode === "yolo") return null;
      return { toolName: NAME, summary: `bash: ${summarize(command)}`, detail: command };
    },
    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      try {
        const obj = expectObject(input, NAME);
        const command = expectString(obj, "command", NAME);
        const timeoutSec = expectOptionalNumber(obj, "timeout", NAME) ?? DEFAULT_TIMEOUT_SEC;
        if (timeoutSec <= 0) {
          throw new Error(`${NAME}: "timeout" must be > 0, got ${timeoutSec}`);
        }

        const trimmed = command.trim();
        const denyHit = matchingPrefix(trimmed, opts.config.permissions.denyBash);
        if (denyHit) {
          return {
            content: `${NAME}: command denied by policy (matches denyBash prefix "${denyHit}")`,
            isError: true,
          };
        }

        return await runCommand(command, opts.cwd, timeoutSec, ctx.signal);
      } catch (err) {
        return { content: err instanceof Error ? err.message : String(err), isError: true };
      }
    },
  };
}
