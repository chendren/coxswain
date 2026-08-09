/**
 * Structured logger wrapper — tries pino, falls back to console.
 * No hard dependency on pino; package works when pino is not installed.
 */
import { createRequire } from "node:module";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export interface Logger {
  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  fatal(...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
  level: LogLevel;
  isLevelEnabled(level: LogLevel): boolean;
}

let pinoCtor: unknown = null;
let pinoLoadAttempted = false;

function loadPino(): unknown {
  if (pinoLoadAttempted) return pinoCtor;
  pinoLoadAttempted = true;
  try {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("pino") as unknown;
    const ctor = (mod as { default?: unknown })?.default ?? mod;
    pinoCtor = typeof ctor === "function" ? ctor : null;
  } catch {
    pinoCtor = null;
  }
  return pinoCtor;
}

function resolveLevel(input?: string): LogLevel {
  const env = (input ?? process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  if (env in LEVEL_ORDER) return env;
  return "info";
}

function isEnabled(current: LogLevel, target: LogLevel): boolean {
  return LEVEL_ORDER[target] >= LEVEL_ORDER[current];
}

function formatConsoleArgs(
  name: string | undefined,
  bindings: Record<string, unknown> | undefined,
  args: unknown[],
): unknown[] {
  const prefix = name ? `[${name}]` : "";
  const bindStr = bindings && Object.keys(bindings).length > 0 ? ` ${JSON.stringify(bindings)}` : "";
  if (args.length === 0) return [prefix + bindStr];
  if (
    args.length >= 2 &&
    typeof args[0] === "object" &&
    args[0] !== null &&
    !Array.isArray(args[0]) &&
    typeof args[1] === "string"
  ) {
    const obj = args[0] as Record<string, unknown>;
    const msg = args[1] as string;
    const rest = args.slice(2);
    const ctx = Object.keys(obj).length > 0 ? ` ${JSON.stringify(obj)}` : "";
    return [`${prefix}${bindStr} ${msg}${ctx}`, ...rest];
  }
  if (typeof args[0] === "string") {
    return [`${prefix}${bindStr} ${args[0] as string}`, ...args.slice(1)];
  }
  return [`${prefix}${bindStr}`, ...args];
}

function createConsoleLogger(
  name?: string,
  levelInput?: LogLevel,
  bindings?: Record<string, unknown>,
): Logger {
  const level = resolveLevel(levelInput);
  const make =
    (target: LogLevel, fn: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (!isEnabled(level, target)) return;
      fn(...formatConsoleArgs(name, bindings, args));
    };

  const logger: Logger = {
    trace: make("trace", (...a) => console.debug(...a)),
    debug: make("debug", (...a) => console.debug(...a)),
    info: make("info", (...a) => console.info(...a)),
    warn: make("warn", (...a) => console.warn(...a)),
    error: make("error", (...a) => console.error(...a)),
    fatal: make("fatal", (...a) => console.error(...a)),
    level,
    isLevelEnabled(lvl: LogLevel) {
      return isEnabled(level, lvl);
    },
    child(childBindings: Record<string, unknown>): Logger {
      return createConsoleLogger(name, level, { ...(bindings ?? {}), ...childBindings });
    },
  };
  return logger;
}

function wrapPinoLogger(pinoInstance: Record<string, unknown>, level: LogLevel): Logger {
  const p = pinoInstance as unknown as Logger & Record<string, unknown>;
  // pino already implements trace/debug/info/warn/error/fatal + child
  // Ensure level + isLevelEnabled are present for our interface
  const isLevelEnabled =
    typeof p.isLevelEnabled === "function"
      ? (p.isLevelEnabled as (l: string) => boolean).bind(p)
      : (lvl: LogLevel) => isEnabled(level, lvl);
  return {
    trace: (p.trace as (...a: unknown[]) => void).bind(p),
    debug: (p.debug as (...a: unknown[]) => void).bind(p),
    info: (p.info as (...a: unknown[]) => void).bind(p),
    warn: (p.warn as (...a: unknown[]) => void).bind(p),
    error: (p.error as (...a: unknown[]) => void).bind(p),
    fatal: ((p as unknown as { fatal?: (...a: unknown[]) => void }).fatal ?? p.error).bind(p),
    level,
    isLevelEnabled: isLevelEnabled as Logger["isLevelEnabled"],
    child(bindings: Record<string, unknown>): Logger {
      const childP = (p as unknown as { child: (b: Record<string, unknown>) => unknown }).child(bindings);
      return wrapPinoLogger(childP as Record<string, unknown>, level);
    },
  };
}

export interface CreateLoggerOptions {
  name?: string;
  level?: LogLevel;
}

export function createLogger(
  nameOrOpts?: string | CreateLoggerOptions,
  level?: LogLevel,
): Logger {
  let name: string | undefined;
  let lvl: LogLevel | undefined;
  if (typeof nameOrOpts === "string") {
    name = nameOrOpts;
    lvl = level;
  } else if (nameOrOpts && typeof nameOrOpts === "object") {
    name = nameOrOpts.name;
    lvl = nameOrOpts.level ?? level;
  }
  const resolved = resolveLevel(lvl);
  const ctor = loadPino() as ((opts: unknown) => unknown) | null;
  if (ctor) {
    try {
      const inst = ctor({ name: name ?? "cox", level: resolved }) as Record<string, unknown>;
      return wrapPinoLogger(inst, resolved);
    } catch {
      // fall through to console
    }
  }
  return createConsoleLogger(name, resolved);
}

/** Default shared logger */
export const logger = createLogger("cox");

export function getLogger(name: string, level?: LogLevel): Logger {
  return createLogger(name, level);
}
