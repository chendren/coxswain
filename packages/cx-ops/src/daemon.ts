/**
 * Long-running CX console watch daemon.
 * Graph path: daemon_start → [tick loop] → daemon_stop
 *
 * PID + log under `.cox/cx/<spec>/daemon.{pid,log,json}`
 */
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CxDeployment, CxOntology, CxTargetAdapter, CxTargetId } from "@cox/cx-core";
import { runWatchLoop } from "./watch";

export interface DaemonPaths {
  dir: string;
  pidFile: string;
  logFile: string;
  metaFile: string;
}

export function daemonPaths(cxRoot: string, specName: string): DaemonPaths {
  const dir = join(cxRoot, specName);
  return {
    dir,
    pidFile: join(dir, "daemon.pid"),
    logFile: join(dir, "daemon.log"),
    metaFile: join(dir, "daemon.json"),
  };
}

export interface DaemonMeta {
  specName: string;
  pid: number;
  startedAt: string;
  intervalMs: number;
  maxTicks: number;
  targets: CxTargetId[];
  path: string[];
  /** ISO timestamp of the most recent completed watch tick, if any. */
  lastTickAt?: string;
  /** 1-based index of the most recent completed watch tick, if any. */
  lastTick?: number;
}

export async function readDaemonMeta(
  cxRoot: string,
  specName: string,
): Promise<DaemonMeta | null> {
  try {
    const raw = await readFile(daemonPaths(cxRoot, specName).metaFile, "utf8");
    return JSON.parse(raw) as DaemonMeta;
  } catch {
    return null;
  }
}

export async function writeDaemonMeta(
  cxRoot: string,
  specName: string,
  meta: DaemonMeta,
): Promise<void> {
  const paths = daemonPaths(cxRoot, specName);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.metaFile, JSON.stringify(meta, null, 2), "utf8");
}

/**
 * Record a completed tick on daemon.json when a daemon meta file exists.
 * No-op for plain `cox cx watch` without a daemon.
 */
export async function recordDaemonLastTick(
  cxRoot: string,
  specName: string,
  tick: number,
  at?: string,
): Promise<void> {
  const meta = await readDaemonMeta(cxRoot, specName);
  if (!meta) return;
  meta.lastTick = tick;
  meta.lastTickAt = at ?? new Date().toISOString();
  await writeDaemonMeta(cxRoot, specName, meta);
}

export async function isDaemonRunning(cxRoot: string, specName: string): Promise<boolean> {
  const paths = daemonPaths(cxRoot, specName);
  try {
    const pid = Number((await readFile(paths.pidFile, "utf8")).trim());
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function stopDaemon(
  cxRoot: string,
  specName: string,
): Promise<{ path: string[]; stopped: boolean; pid?: number }> {
  const path = ["daemon_stop"];
  const paths = daemonPaths(cxRoot, specName);
  let pid: number | undefined;
  try {
    pid = Number((await readFile(paths.pidFile, "utf8")).trim());
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, "SIGTERM");
        path.push(`signal:${pid}`);
      } catch {
        path.push("already_dead");
      }
    }
  } catch {
    path.push("no_pid");
  }
  await rm(paths.pidFile, { force: true });
  path.push("emit");
  return { path, stopped: true, pid };
}

/**
 * In-process daemon loop (tests / foreground).
 */
export async function runDaemonLoop(opts: {
  cxRoot: string;
  specName: string;
  targets: Array<{
    targetId: CxTargetId;
    adapter: CxTargetAdapter;
    dep: CxDeployment;
    nbaContext?: { journey?: string; stage?: string; confidence?: number };
  }>;
  ontology?: CxOntology;
  intervalMs?: number;
  maxTicks?: number;
  now?: () => string;
  signal?: AbortSignal;
  log?: (line: string) => void;
}): Promise<{ path: string[]; ticks: number; totalAdded: number }> {
  const now = opts.now ?? (() => new Date().toISOString());
  const paths = daemonPaths(opts.cxRoot, opts.specName);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.pidFile, String(process.pid), "utf8");
  await writeFile(
    paths.metaFile,
    JSON.stringify(
      {
        specName: opts.specName,
        pid: process.pid,
        startedAt: now(),
        intervalMs: opts.intervalMs ?? 30_000,
        maxTicks: opts.maxTicks ?? 100,
        targets: opts.targets.map((t) => t.targetId),
        path: ["daemon_start"],
      } satisfies DaemonMeta,
      null,
      2,
    ),
    "utf8",
  );

  const log =
    opts.log ??
    ((line: string) => {
      void writeFile(paths.logFile, `${now()} ${line}\n`, { flag: "a" });
    });

  log("daemon_start");
  try {
    const result = await runWatchLoop(opts.specName, opts.targets, {
      cxRoot: opts.cxRoot,
      now,
      ontology: opts.ontology,
      intervalMs: opts.intervalMs ?? 30_000,
      maxTicks: opts.maxTicks ?? 100,
      signal: opts.signal,
      onTick: (info) => {
        log(`tick=${info.tick} proposals=${info.proposals.length} added=${info.added.length}`);
        void recordDaemonLastTick(opts.cxRoot, opts.specName, info.tick, now());
      },
    });
    log(`daemon_stop ticks=${result.ticks} added=${result.totalAdded}`);
    await rm(paths.pidFile, { force: true });
    return {
      path: ["daemon_start", ...result.path, "daemon_stop"],
      ticks: result.ticks,
      totalAdded: result.totalAdded,
    };
  } catch (e) {
    log(`daemon_error ${e instanceof Error ? e.message : String(e)}`);
    await rm(paths.pidFile, { force: true });
    throw e;
  }
}

/**
 * Spawn detached `cox cx watch` for long-running ops. Parent returns immediately.
 */
export async function spawnWatchDaemon(opts: {
  cwd: string;
  specName: string;
  /** Absolute path to cli main.ts or compiled entry. */
  coxEntry: string;
  extraArgs?: string[];
  cxRoot: string;
  intervalMs?: number;
  maxTicks?: number;
}): Promise<DaemonMeta> {
  const paths = daemonPaths(opts.cxRoot, opts.specName);
  await mkdir(paths.dir, { recursive: true });

  if (await isDaemonRunning(opts.cxRoot, opts.specName)) {
    throw new Error(`daemon already running for ${opts.specName}`);
  }

  const interval = String(opts.intervalMs ?? 30_000);
  const ticks = String(opts.maxTicks ?? 120);
  const logFd = openSync(paths.logFile, "a");

  // Child argv: node <tsx-cli> <main.ts> --cwd ... cx watch ...
  // or node <main.js> --cwd ... when compiled.
  const tsxCli = await resolveTsx(opts.cwd);
  const nodeArgs =
    opts.coxEntry.endsWith(".ts") && tsxCli
      ? [tsxCli, opts.coxEntry]
      : [opts.coxEntry];

  const child = spawn(
    process.execPath,
    [
      ...nodeArgs,
      "--cwd",
      opts.cwd,
      "cx",
      "watch",
      opts.specName,
      "--ticks",
      ticks,
      "--interval",
      interval,
      ...(opts.extraArgs ?? []),
    ],
    {
      cwd: opts.cwd,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: process.env,
    },
  );
  child.unref();

  const meta: DaemonMeta = {
    specName: opts.specName,
    pid: child.pid ?? -1,
    startedAt: new Date().toISOString(),
    intervalMs: opts.intervalMs ?? 30_000,
    maxTicks: opts.maxTicks ?? 120,
    targets: [],
    path: ["daemon_spawn", "emit"],
  };

  if (child.pid && child.pid > 0) {
    await writeFile(paths.pidFile, String(child.pid), "utf8");
    await writeDaemonMeta(opts.cxRoot, opts.specName, meta);
  }
  return meta;
}

async function resolveTsx(cwd: string): Promise<string | null> {
  const candidates = [
    join(cwd, "node_modules", "tsx", "dist", "cli.mjs"),
    join(cwd, "node_modules", ".bin", "tsx"),
    join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
    join(process.cwd(), "node_modules", ".bin", "tsx"),
  ];
  for (const c of candidates) {
    try {
      await readFile(c);
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}
