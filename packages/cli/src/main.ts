/**
 * @cox/cli — commander program: global flags, command registration, exit codes.
 *
 * This file only registers the command surface (R7.1) and maps errors to
 * process exit codes (R7.2). Command bodies live in ./commands/*; engine
 * access flows through ./deps.ts + ./wire.ts (never a static import here).
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { EventBus, loadConfig, TIERS, type Tier } from "@cox/core";
import { startTui } from "@cox/tui";
import { runReplay } from "./commands/replay";
import { runOneshot, type OneshotKind } from "./commands/oneshot";
import { runSpecApprove, runSpecGenerate, runSpecNew, runSpecRunTask, runSpecStatus } from "./commands/spec";
import { runSteerInit } from "./commands/steer";
import { runHookRun } from "./commands/hook";
import { runLedgerReport } from "./commands/ledger";
import { runModelsReport } from "./commands/models";
import { runDoctor } from "./commands/doctor";
import {
  runCxApprove,
  runCxBuild,
  runCxConsole,
  runCxDeploy,
  runCxDoctor,
  runCxList,
  runCxNba,
  runCxNew,
  runCxOntologyGraph,
  runCxOntologyShow,
  runCxOntologyValidate,
  runCxPlan,
  runCxProposalTransition,
  runCxProposals,
  runCxReport,
  runCxRun,
  runCxSimulate,
  runCxStatus,
  runCxTeardown,
  runCxWatch,
  runCxDaemonStart,
  runCxDaemonStop,
  runCxDaemonStatus,
  runCxApply,
  runCxTasks,
  runCxTaskTransition,
  runCxExportAws,
  runCxBoard,
  runCxBrief,
  runCxCabExport,
  runCxAudit,
  runCxJourneys,
  runCxInit,
  runCxClaim,
  runCxOperate,
  runCxCatalog,
  runCxArchive,
  runCxRestore,
  runCxSnapshot,
  runCxHealthHistory,
  runCxFleetStatus,
  runCxQueue,
  runCxDashboard,
  runCxGraphFind,
  runCxSeedOperate,
  runCxDrift,
  runCxSyncExport,
  runCxSyncImport,
  runCxDeployHistory,
  runCxIncident,
  type CxCommandContext,
} from "./commands/cx";
import { loadDeps, type LoadedDeps } from "./deps";
import { buildSession } from "./wire";
import { runPrint } from "./print";
import type { CxRuntimeMode } from "./cx/runtime";

/** Thrown by command handlers to exit with a specific code without a stack trace dump. */
export class CliExit extends Error {
  readonly code: number;
  constructor(code: number, message?: string) {
    super(message ?? "");
    this.name = "CliExit";
    this.code = code;
  }
}

export interface GlobalOpts {
  model?: Tier;
  print?: string;
  cwd?: string;
  yolo?: boolean;
}

export interface CliIo {
  writeOut: (s: string) => void;
  writeErr: (s: string) => void;
}

const REAL_IO: CliIo = {
  writeOut: (s) => {
    process.stdout.write(s);
  },
  writeErr: (s) => {
    process.stderr.write(s);
  },
};

function parseTier(value: string): Tier {
  if (!(TIERS as readonly string[]).includes(value)) {
    throw new InvalidArgumentError(
      `invalid tier "${value}" — valid values: ${TIERS.join(", ")}`,
    );
  }
  return value as Tier;
}

/** Registers the four global flags (R7.1) on any command so they parse in any position. */
function addGlobalOptions(cmd: Command): Command {
  return cmd
    .option(
      "-m, --model <tier>",
      `routing tier override (${TIERS.join("|")})`,
      parseTier,
    )
    .option(
      "--print <prompt>",
      "run one turn in plain (non-interactive) mode and print the transcript",
    )
    .option("--cwd <dir>", "run as if cox were started in this directory")
    .option("--yolo", "auto-approve every permission request");
}

function notImplemented(command: string): never {
  throw new CliExit(1, `not implemented yet: cox ${command}`);
}

function resolveCwd(opts: GlobalOpts): string {
  return resolve(opts.cwd ?? process.cwd());
}

/** Resolves cwd/config and loads the full engine graph for a one-off CLI command. */
async function resolveDeps(command: Command): Promise<{ cwd: string; deps: LoadedDeps }> {
  const opts = command.optsWithGlobals<GlobalOpts>();
  const cwd = resolveCwd(opts);
  const cfg = loadConfig(cwd);
  const bus = new EventBus();
  const deps = await loadDeps(cfg, cwd, bus);
  return { cwd, deps };
}

const write = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function runOneshotCommand(kind: OneshotKind, textParts: string[], command: Command): Promise<void> {
  const { deps } = await resolveDeps(command);
  await runOneshot(kind, textParts.join(" "), {
    router: deps.router,
    tierModel: deps.tierModel,
    ledger: deps.ledger,
    sessionId: deps.sessionId,
  });
}

/** Builds the commander program. Pure — no process.exit, no static engine imports. */
export function createProgram(io: CliIo = REAL_IO): Command {
  const program = new Command();
  program
    .name("cox")
    .description(
      "Coxswain — spec-driven, steerable, token-frugal coding agent CLI",
    )
    .version("0.1.0")
    .exitOverride()
    .configureOutput({ writeOut: io.writeOut, writeErr: io.writeErr })
    .showHelpAfterError(false);
  addGlobalOptions(program);

  // Bare `cox` — interactive session, or --print <prompt> for one plain
  // (non-Ink) turn (R6.1). Engines are still stubs at this point in the
  // build; buildSession's NotWiredError propagates as a normal exit-1
  // runtime error (R8.2) until every lane lands.
  program.action(async (_options: GlobalOpts, command: Command) => {
    const opts = command.optsWithGlobals<GlobalOpts>();
    const cwd = resolveCwd(opts);
    const cfg = loadConfig(cwd);
    const bus = new EventBus();

    if (opts.print) {
      const session = await buildSession(cfg, cwd, bus, opts.model);
      const code = await runPrint(opts.print, {
        bus,
        controller: session.controller,
        yolo: opts.yolo,
        write: (line) => io.writeOut(`${line}\n`),
      });
      throw new CliExit(code);
    }

    if (!process.stdout.isTTY) {
      throw new CliExit(
        2,
        "refusing to start an interactive session on a non-TTY stdout; use --print <prompt>",
      );
    }

    const session = await buildSession(cfg, cwd, bus, opts.model);
    const tui = startTui({ bus, controller: session.controller, getSnapshot: session.getSnapshot });
    await tui.waitUntilExit();
  });

  const spec = program.command("spec").description("spec-driven feature workflow");
  addGlobalOptions(
    spec.command("new <name> <idea...>").description("start a new spec from an idea"),
  ).action(async (name: string, idea: string[], _o: GlobalOpts, command: Command) => {
    const { deps } = await resolveDeps(command);
    await runSpecNew({ specs: deps.specs, write }, name, idea.join(" "));
  });
  addGlobalOptions(
    spec
      .command("approve <name> [phase]")
      .description("approve requirements|design|tasks (default: next unapproved)"),
  ).action(async (name: string, phase: string | undefined, _o: GlobalOpts, command: Command) => {
    const { deps } = await resolveDeps(command);
    await runSpecApprove({ specs: deps.specs, write }, name, phase);
  });
  addGlobalOptions(
    spec.command("design <name>").description("generate the design document"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const { deps } = await resolveDeps(command);
    await runSpecGenerate({ specs: deps.specs, write }, name, "design");
  });
  addGlobalOptions(
    spec.command("tasks <name>").description("generate the task list"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const { deps } = await resolveDeps(command);
    await runSpecGenerate({ specs: deps.specs, write }, name, "tasks");
  });
  addGlobalOptions(
    spec.command("run <name> [taskId]").description("execute the next (or given) task"),
  ).action(async (name: string, taskId: string | undefined, _o: GlobalOpts, command: Command) => {
    const { deps } = await resolveDeps(command);
    await runSpecRunTask({ specs: deps.specs, write }, name, taskId);
  });
  addGlobalOptions(
    spec.command("status [name]").description("show phase/task status"),
  ).action(async (name: string | undefined, _o: GlobalOpts, command: Command) => {
    const { deps } = await resolveDeps(command);
    await runSpecStatus({ specs: deps.specs, write }, name);
  });

  const steer = program.command("steer").description("steering docs");
  addGlobalOptions(
    steer.command("init").description("write starter steering docs to .cox/steering/"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const { cwd, deps } = await resolveDeps(command);
    await runSteerInit({
      cwd,
      templates: deps.steeringTemplates,
      sessionId: deps.sessionId,
      write,
      isTTY: Boolean(process.stdout.isTTY),
      agent: deps.agent,
    });
  });

  const hook = program.command("hook").description("agent hooks");
  addGlobalOptions(
    hook.command("run <name>").description("run an agent hook manually"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const { cwd, deps } = await resolveDeps(command);
    await runHookRun({ hooks: deps.hooks, agent: deps.agent, cwd, sessionId: deps.sessionId, write }, name);
  });

  addGlobalOptions(
    program.command("explain <text...>").description("one-shot explanation, always scout tier"),
  ).action(async (text: string[], _o: GlobalOpts, command: Command) => {
    await runOneshotCommand("explain", text, command);
  });

  addGlobalOptions(
    program.command("suggest <text...>").description("one-shot shell suggestion, scout tier"),
  ).action(async (text: string[], _o: GlobalOpts, command: Command) => {
    await runOneshotCommand("suggest", text, command);
  });

  addGlobalOptions(
    program
      .command("ledger")
      .description("offline cost report")
      .option("--spec <name>", "filter to one spec")
      .option("--since <iso>", "filter to entries at/after this ISO-8601 timestamp"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const opts = command.optsWithGlobals<GlobalOpts & { spec?: string; since?: string }>();
    const { deps } = await resolveDeps(command);
    await runLedgerReport({ ledger: deps.ledger, specName: opts.spec, since: opts.since, write });
  });

  addGlobalOptions(
    program.command("models").description("configured tiers, models, and pricing"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const opts = command.optsWithGlobals<GlobalOpts>();
    const cfg = loadConfig(resolveCwd(opts));
    runModelsReport({ cfg, write });
  });

  addGlobalOptions(
    program
      .command("doctor")
      .description("check keys, config, and connectivity")
      .option("--offline", "skip provider reachability checks"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const opts = command.optsWithGlobals<GlobalOpts & { offline?: boolean }>();
    const cwd = resolveCwd(opts);
    const offline = Boolean(opts.offline);
    const ok = await runDoctor({
      cwd,
      offline,
      write,
      // Errors thrown here (including NotWiredError while lanes are still
      // stubs) are caught by runDoctor itself and reported as a failed
      // "provider reachable" check with the error message as detail.
      checkReachability: offline
        ? undefined
        : async () => {
            const { deps } = await resolveDeps(command);
            const model = deps.tierModel("scout");
            let done = false;
            for await (const event of model.stream({
              system: "ping",
              messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
              tools: [],
              maxTokens: 1,
            })) {
              if (event.type === "done") done = true;
            }
            return done;
          },
    });
    throw new CliExit(ok ? 0 : 1);
  });

  addGlobalOptions(
    program
      .command("replay <file>")
      .description("replay a recorded AgentEvent stream through the TUI"),
  ).action(async (file: string, _options: GlobalOpts, command: Command) => {
    const opts = command.optsWithGlobals<GlobalOpts>();
    await runReplay(file, { cwd: opts.cwd ?? process.cwd() });
  });

  // ── CXOS graph-node commands (deterministic strong-graph ops) ──
  const cx = program.command("cx").description("CXOS — closed-world build & operate");
  const ontology = cx.command("ontology").description("strong ontology catalog (graph-node AI)");

  async function cxCtx(
    command: Command,
    pack?: string,
    extra?: {
      live?: boolean;
      mode?: string;
      localBaseUrl?: string;
      autoLive?: boolean;
      actor?: string;
    },
  ): Promise<CxCommandContext> {
    const opts = command.optsWithGlobals<GlobalOpts & { actor?: string }>();
    const cwd = resolveCwd(opts);
    const cfg = loadConfig(cwd);
    const autoLive =
      Boolean(extra?.autoLive) || process.env.CX_AUTO_LIVE === "1";
    const wantLive =
      Boolean(extra?.live) ||
      autoLive ||
      extra?.mode === "live" ||
      extra?.mode === "hybrid";
    let tierModel: CxCommandContext["tierModel"];
    if (wantLive) {
      try {
        const bus = new EventBus();
        const deps = await loadDeps(cfg, cwd, bus);
        tierModel = deps.tierModel;
      } catch (e) {
        write(
          `warning: live models unavailable (${e instanceof Error ? e.message : String(e)}); falling back offline`,
        );
      }
    }
    // Explicit --mode wins; --live / auto-live prefer hybrid; else offline.
    let mode: CxRuntimeMode;
    if (extra?.mode === "offline" || extra?.mode === "live" || extra?.mode === "hybrid") {
      mode = extra.mode;
    } else if (extra?.live) {
      mode = tierModel ? "hybrid" : "offline";
    } else if (autoLive) {
      mode = "hybrid";
    } else {
      mode = "offline";
    }
    // Prefer CLI --base-url; else cox.config.json cx.targets.local.baseUrl
    // (createCxRuntime also resolveLocalBaseUrl as a backstop).
    const localBaseUrl =
      extra?.localBaseUrl ?? cfg.cx.targets.local?.baseUrl;
    const actor =
      (extra?.actor ?? opts.actor ?? process.env.CX_ACTOR ?? "").trim() || undefined;
    return {
      cwd,
      write,
      pack,
      mode,
      tierModel,
      localBaseUrl,
      live: Boolean(extra?.live),
      autoLive,
      actor,
    };
  }

  addGlobalOptions(
    ontology
      .command("show")
      .description("inventory closed-world domains, journeys, KPIs, NBA rules")
      .option("--pack <name>", "ontology pack: default|local", "default"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const opts = command.optsWithGlobals<GlobalOpts & { pack?: string }>();
    runCxOntologyShow({ write }, opts.pack);
  });

  addGlobalOptions(
    ontology
      .command("validate")
      .description("validate catalog integrity and materialize strong graph")
      .option("--pack <name>", "ontology pack: default|local", "default"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const opts = command.optsWithGlobals<GlobalOpts & { pack?: string }>();
    const code = runCxOntologyValidate({ write }, opts.pack);
    throw new CliExit(code);
  });

  addGlobalOptions(
    ontology
      .command("graph")
      .description("show strong-graph node/edge stats")
      .option("--pack <name>", "ontology pack: default|local", "default"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const opts = command.optsWithGlobals<GlobalOpts & { pack?: string }>();
    runCxOntologyGraph({ write }, opts.pack);
  });

  addGlobalOptions(
    cx
      .command("nba [context...]")
      .description("recommend next-best-action from strong-graph rules (journey= stage= …)")
      .option("--pack <name>", "ontology pack: default|local", "default"),
  ).action(async (context: string[], _o: GlobalOpts, command: Command) => {
    const opts = command.optsWithGlobals<GlobalOpts & { pack?: string }>();
    const code = runCxNba({ write }, context, opts.pack);
    throw new CliExit(code);
  });

  type CxCmdOpts = GlobalOpts & {
    target?: string;
    live?: boolean;
    autoLive?: boolean;
    mode?: string;
    pack?: string;
    baseUrl?: string;
  };

  function cxFlags(command: Command): {
    pack?: string;
    live?: boolean;
    autoLive?: boolean;
    mode?: string;
    localBaseUrl?: string;
    target?: string;
  } {
    const opts = command.optsWithGlobals<CxCmdOpts>();
    return {
      pack: opts.pack,
      live: opts.live,
      autoLive: opts.autoLive,
      mode: opts.mode,
      localBaseUrl: opts.baseUrl,
      target: opts.target,
    };
  }

  addGlobalOptions(
    cx
      .command("doctor")
      .description("CXOS runtime wiring + ontology health")
      .option("--live", "probe platform and prefer live wiring")
      .option("--auto-live", "hybrid mode without --live (or CX_AUTO_LIVE=1)")
      .option("--mode <mode>", "offline|live|hybrid")
      .option("--base-url <url>", "local platform base URL")
      .option("--pack <name>", "ontology pack: default|local", "local"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxDoctor(await cxCtx(command, f.pack, f)));
  });

  addGlobalOptions(
    cx.command("new <name> [idea...]").description("create a CXOS spec under .cox/cx/"),
  ).action(async (name: string, idea: string[], _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxNew(await cxCtx(command, f.pack, f), name, idea));
  });

  addGlobalOptions(
    cx
      .command("approve <name> [phase]")
      .description("approve requirements|design|tasks (default: next)"),
  ).action(async (name: string, phase: string | undefined, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxApprove(await cxCtx(command, f.pack, f), name, phase));
  });

  addGlobalOptions(
    cx.command("list").description("list CX specs"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxList(await cxCtx(command, f.pack, f)));
  });

  addGlobalOptions(
    cx
      .command("status [name]")
      .description("show CX spec phases and deployment health")
      .option("--target <list>", "artifacts,local,aws or all", "all")
      .option("--live", "prefer live models/platform when available")
      .option("--auto-live", "hybrid mode without --live (or CX_AUTO_LIVE=1)")
      .option("--mode <mode>", "offline|live|hybrid")
      .option("--base-url <url>", "local platform base URL"),
  ).action(async (name: string | undefined, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxStatus(await cxCtx(command, f.pack, f), name, f.target));
  });

  addGlobalOptions(
    cx
      .command("plan <name>")
      .description("show per-target build plans (no side effects)")
      .option("--target <list>", "artifacts,local,aws or all", "all")
      .option("--live", "prefer live models/platform when available")
      .option("--mode <mode>", "offline|live|hybrid"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxPlan(await cxCtx(command, f.pack, f), name, f.target));
  });

  addGlobalOptions(
    cx
      .command("build <name>")
      .description("plan+build+deploy targets (artifacts first; graph-ordered)")
      .option("--target <list>", "artifacts,local,aws or all", "all")
      .option("--live", "prefer live models/platform when available")
      .option("--auto-live", "hybrid mode without --live (or CX_AUTO_LIVE=1)")
      .option("--mode <mode>", "offline|live|hybrid")
      .option("--base-url <url>", "local platform base URL")
      .option("--pack <name>", "ontology pack: default|local", "local"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxBuild(await cxCtx(command, f.pack, f), name, f.target, true));
  });

  addGlobalOptions(
    cx
      .command("run <name> [idea...]")
      .description("golden path: new (if needed) → approve → build+deploy → status → simulate → report")
      .option("--target <list>", "artifacts,local,aws or all", "all")
      .option("--live", "prefer live models/platform when available")
      .option("--auto-live", "hybrid mode without --live (or CX_AUTO_LIVE=1)")
      .option("--mode <mode>", "offline|live|hybrid")
      .option("--base-url <url>", "local platform base URL")
      .option("--pack <name>", "ontology pack: default|local", "local"),
  ).action(async (name: string, idea: string[], _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxRun(await cxCtx(command, f.pack, f), name, idea, f.target));
  });

  addGlobalOptions(
    cx
      .command("deploy <name>")
      .description("build and deploy targets")
      .option("--target <list>", "artifacts,local,aws or all", "all")
      .option("--live", "prefer live models/platform when available")
      .option("--auto-live", "hybrid mode without --live (or CX_AUTO_LIVE=1)")
      .option("--mode <mode>", "offline|live|hybrid")
      .option("--base-url <url>", "local platform base URL"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxDeploy(await cxCtx(command, f.pack, f), name, f.target));
  });

  addGlobalOptions(
    cx
      .command("simulate <name>")
      .description("run traffic simulation on deployed targets")
      .option("--target <list>", "default: local", "local")
      .option("--live", "prefer live models/platform when available")
      .option("--auto-live", "hybrid mode without --live (or CX_AUTO_LIVE=1)")
      .option("--base-url <url>", "local platform base URL"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxSimulate(await cxCtx(command, f.pack, f), name, f.target));
  });

  addGlobalOptions(
    cx
      .command("report <name>")
      .description("cross-target status report + graph NBA")
      .option("--target <list>", "deployed targets or all", "all")
      .option("--live", "prefer live models for scout summary"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxReport(await cxCtx(command, f.pack, f), name, f.target));
  });

  addGlobalOptions(
    cx
      .command("console <name>")
      .description("one console tick: poll status, propose gated NBA (no mutations)")
      .option("--target <list>", "deployed targets or all", "all")
      .option("--live", "prefer live platform health")
      .option("--auto-live", "hybrid mode without --live (or CX_AUTO_LIVE=1)")
      .option("--base-url <url>", "local platform base URL"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxConsole(await cxCtx(command, f.pack, f), name, f.target));
  });

  addGlobalOptions(
    cx
      .command("watch <name>")
      .description("bounded console watch loop; persists proposals")
      .option("--target <list>", "deployed targets or all", "all")
      .option("--ticks <n>", "max ticks", "3")
      .option("--interval <ms>", "interval between ticks", "2000")
      .option("--live", "prefer live platform health")
      .option("--auto-live", "hybrid mode without --live (or CX_AUTO_LIVE=1)")
      .option("--base-url <url>", "local platform base URL"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { ticks?: string; interval?: string }>();
    throw new CliExit(
      await runCxWatch(await cxCtx(command, f.pack, f), name, f.target, {
        maxTicks: Number(opts.ticks ?? 3),
        intervalMs: Number(opts.interval ?? 2000),
      }),
    );
  });

  const daemon = cx.command("daemon").description("long-running console watch daemon");
  addGlobalOptions(
    daemon
      .command("start <name>")
      .description("spawn detached watch daemon")
      .option("--interval <ms>", "tick interval", "30000")
      .option("--ticks <n>", "max ticks before exit", "120")
      .option("--live", "prefer live platform")
      .option("--base-url <url>", "local platform base URL"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { ticks?: string; interval?: string }>();
    throw new CliExit(
      await runCxDaemonStart(await cxCtx(command, f.pack, f), name, {
        intervalMs: Number(opts.interval ?? 30_000),
        maxTicks: Number(opts.ticks ?? 120),
        live: f.live,
        baseUrl: f.localBaseUrl,
      }),
    );
  });
  addGlobalOptions(
    daemon.command("stop <name>").description("stop watch daemon"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxDaemonStop(await cxCtx(command, f.pack, f), name));
  });
  addGlobalOptions(
    daemon.command("status <name>").description("daemon running?"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxDaemonStatus(await cxCtx(command, f.pack, f), name));
  });

  addGlobalOptions(
    cx
      .command("proposals <name>")
      .description("list CX proposals (default: open|claimed)")
      .option("--all", "include resolved/dismissed")
      .option("--status <status>", "filter: open|claimed|resolved|dismissed"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { all?: boolean; status?: string }>();
    const allowed = ["open", "claimed", "resolved", "dismissed"] as const;
    if (opts.status && !(allowed as readonly string[]).includes(opts.status)) {
      throw new CliExit(2, `status must be one of ${allowed.join("|")}`);
    }
    throw new CliExit(
      await runCxProposals(await cxCtx(command, f.pack, f), name, {
        all: opts.all,
        status: opts.status as (typeof allowed)[number] | undefined,
      }),
    );
  });

  addGlobalOptions(
    cx
      .command("proposal <name> <id> <status>")
      .description("transition proposal: open|claimed|resolved|dismissed"),
  ).action(async (name: string, id: string, status: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const allowed = ["open", "claimed", "resolved", "dismissed"];
    if (!allowed.includes(status)) {
      throw new CliExit(2, `status must be one of ${allowed.join("|")}`);
    }
    throw new CliExit(
      await runCxProposalTransition(
        await cxCtx(command, f.pack, f),
        name,
        id,
        status as import("@cox/cx-ops").ProposalStatus,
      ),
    );
  });

  addGlobalOptions(
    cx
      .command("apply <name> <proposalId>")
      .description("apply proposal → CX task + remediation note (human-gated)")
      .option("--resolve", "mark proposal resolved (default: claimed)")
      .option("--actor <id>", "operator identity (or CX_ACTOR)"),
  ).action(async (name: string, proposalId: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { resolve?: boolean; actor?: string }>();
    throw new CliExit(
      await runCxApply(await cxCtx(command, f.pack, { ...f, actor: opts.actor }), name, proposalId, {
        resolve: Boolean(opts.resolve),
        actor: opts.actor,
      }),
    );
  });

  addGlobalOptions(
    cx
      .command("tasks <name>")
      .description("list CX tasks from applied proposals (default: pending|in_progress)")
      .option("--all", "include done/cancelled")
      .option("--status <status>", "filter: pending|in_progress|done|cancelled"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { all?: boolean; status?: string }>();
    const allowed = ["pending", "in_progress", "done", "cancelled"] as const;
    if (opts.status && !(allowed as readonly string[]).includes(opts.status)) {
      throw new CliExit(2, `status must be one of ${allowed.join("|")}`);
    }
    throw new CliExit(
      await runCxTasks(await cxCtx(command, f.pack, f), name, {
        all: opts.all,
        status: opts.status as (typeof allowed)[number] | undefined,
      }),
    );
  });

  addGlobalOptions(
    cx
      .command("task <name> <id> <status>")
      .description("transition task: pending|in_progress|done|cancelled (done resolves source proposal)")
      .option("--no-resolve-source", "do not auto-resolve linked proposal on done")
      .option("--actor <id>", "operator identity (or CX_ACTOR)")
      .option("--evidence <note>", "verify-back note when closing")
      .option("--evidence-url <url>", "optional evidence URL"),
  ).action(async (name: string, id: string, status: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const allowed = ["pending", "in_progress", "done", "cancelled"] as const;
    if (!(allowed as readonly string[]).includes(status)) {
      throw new CliExit(2, `status must be one of ${allowed.join("|")}`);
    }
    const opts = command.optsWithGlobals<
      CxCmdOpts & {
        resolveSource?: boolean;
        actor?: string;
        evidence?: string;
        evidenceUrl?: string;
      }
    >();
    // commander --no-resolve-source sets resolveSource=false when present
    const resolveSource = opts.resolveSource === false ? false : undefined;
    throw new CliExit(
      await runCxTaskTransition(
        await cxCtx(command, f.pack, { ...f, actor: opts.actor }),
        name,
        id,
        status as (typeof allowed)[number],
        {
          resolveSource,
          actor: opts.actor,
          evidence: opts.evidence,
          evidenceUrl: opts.evidenceUrl,
        },
      ),
    );
  });

  addGlobalOptions(
    cx
      .command("teardown <name>")
      .description("tear down deployments")
      .option("--target <list>", "artifacts,local,aws or all", "all")
      .option("--live", "use live adapter teardown paths")
      .option("--base-url <url>", "local platform base URL"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxTeardown(await cxCtx(command, f.pack, f), name, f.target));
  });

  addGlobalOptions(
    cx
      .command("export-aws <name> [outDir]")
      .description(
        "copy .cox/cx/<name>/aws template.yaml + APPLY.md (and architectureDoc.json if present) to outDir (default ./cx-export/<name>-aws)",
      ),
  ).action(async (name: string, outDir: string | undefined, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxExportAws(await cxCtx(command, f.pack, f), name, outDir));
  });

  addGlobalOptions(
    cx
      .command("board")
      .description("multi-spec ops board (phases, proposals, tasks, daemons)")
      .option("--json", "print board as JSON only"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { json?: boolean }>();
    throw new CliExit(
      await runCxBoard(await cxCtx(command, f.pack, f), { json: Boolean(opts.json) }),
    );
  });

  addGlobalOptions(
    cx
      .command("brief <name> [outFile]")
      .description("executive markdown brief for a CX program"),
  ).action(async (name: string, outFile: string | undefined, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxBrief(await cxCtx(command, f.pack, f), name, outFile));
  });

  addGlobalOptions(
    cx
      .command("cab-export <name> [outDir]")
      .description("CAB change package: CFN + remediations + proposals/tasks + BRIEF.md"),
  ).action(async (name: string, outDir: string | undefined, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxCabExport(await cxCtx(command, f.pack, f), name, outDir));
  });

  addGlobalOptions(
    cx
      .command("audit <name>")
      .description("show recent CXOS audit events for a spec")
      .option("--limit <n>", "max events", "30"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { limit?: string }>();
    throw new CliExit(await runCxAudit(await cxCtx(command, f.pack, f), name, opts.limit));
  });

  addGlobalOptions(
    cx
      .command("journeys")
      .description("list closed-world journeys from ontology pack")
      .option("--pack <name>", "ontology pack: default|local", "local"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxJourneys(await cxCtx(command, f.pack, f), f.pack));
  });

  addGlobalOptions(
    cx.command("init").description("ensure .cox/cx workspace; seed starter spec if empty"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxInit(await cxCtx(command, f.pack, f)));
  });

  addGlobalOptions(
    cx
      .command("claim <name> <proposalId>")
      .description("alias for apply (ops claim language)")
      .option("--resolve", "mark proposal resolved after apply")
      .option("--actor <id>", "operator identity (or CX_ACTOR)"),
  ).action(async (name: string, proposalId: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { resolve?: boolean; actor?: string }>();
    throw new CliExit(
      await runCxClaim(
        await cxCtx(command, f.pack, { ...f, actor: opts.actor }),
        name,
        proposalId,
        {
          resolve: Boolean(opts.resolve),
          actor: opts.actor,
        },
      ),
    );
  });

  addGlobalOptions(
    cx
      .command("operate <name>")
      .description("one-shot operate: console tick + board line")
      .option("--target <list>", "deployed targets or all", "all")
      .option("--live", "prefer live platform health")
      .option("--auto-live", "hybrid without --live")
      .option("--base-url <url>", "local platform base URL"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxOperate(await cxCtx(command, f.pack, f), name, f.target));
  });

  addGlobalOptions(
    cx
      .command("catalog [section]")
      .description("closed catalog: all|domains|intents|kpis|nba|channels")
      .option("--pack <name>", "ontology pack: default|local", "local"),
  ).action(async (section: string | undefined, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const allowed = ["all", "domains", "intents", "kpis", "nba", "channels"] as const;
    const sec = (section ?? "all") as (typeof allowed)[number];
    if (!(allowed as readonly string[]).includes(sec)) {
      throw new CliExit(2, `section must be one of ${allowed.join("|")}`);
    }
    throw new CliExit(await runCxCatalog(await cxCtx(command, f.pack, f), sec, f.pack));
  });

  addGlobalOptions(
    cx.command("archive <name>").description("soft-archive a CX program (.archived-<name>)"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxArchive(await cxCtx(command, f.pack, f), name));
  });

  addGlobalOptions(
    cx.command("restore <name>").description("restore soft-archived CX program"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxRestore(await cxCtx(command, f.pack, f), name));
  });

  addGlobalOptions(
    cx
      .command("snapshot <name> [outDir]")
      .description("full program snapshot (CAB + spec + health history)"),
  ).action(async (name: string, outDir: string | undefined, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxSnapshot(await cxCtx(command, f.pack, f), name, outDir));
  });

  addGlobalOptions(
    cx
      .command("health-history <name>")
      .description("show recent health score samples from status polls")
      .option("--limit <n>", "max samples", "20"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { limit?: string }>();
    throw new CliExit(await runCxHealthHistory(await cxCtx(command, f.pack, f), name, opts.limit));
  });

  addGlobalOptions(
    cx
      .command("fleet-status")
      .description("fleet board + status poll for each deployed spec")
      .option("--live", "prefer live platform health")
      .option("--auto-live", "hybrid without --live")
      .option("--base-url <url>", "local platform base URL"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(
      await runCxFleetStatus(await cxCtx(command, f.pack, f), { live: Boolean(f.live) }),
    );
  });

  addGlobalOptions(
    cx.command("queue").description("cross-spec work queue (open proposals + tasks)"),
  ).action(async (_o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxQueue(await cxCtx(command, f.pack, f)));
  });

  addGlobalOptions(
    cx
      .command("dashboard [outFile]")
      .description("write self-contained HTML ops dashboard (default cxos-dashboard.html)"),
  ).action(async (outFile: string | undefined, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxDashboard(await cxCtx(command, f.pack, f), outFile));
  });

  addGlobalOptions(
    cx
      .command("graph-find <query>")
      .description("search strong ontology graph nodes by id/name/kind")
      .option("--pack <name>", "ontology pack: default|local", "local"),
  ).action(async (query: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxGraphFind(await cxCtx(command, f.pack, f), query, f.pack));
  });

  addGlobalOptions(
    cx
      .command("seed-operate <name>")
      .description("seed open proposals for operate drills (skip if open work exists)")
      .option("--force", "re-seed even if open proposals exist"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { force?: boolean }>();
    throw new CliExit(
      await runCxSeedOperate(await cxCtx(command, f.pack, f), name, { force: opts.force }),
    );
  });

  addGlobalOptions(
    cx
      .command("aws-drift <name>")
      .description("read-only: local CFN plan vs live stack (never mutates AWS)")
      .option("--skip-live", "only check local template.yaml"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { skipLive?: boolean }>();
    throw new CliExit(
      await runCxDrift(await cxCtx(command, f.pack, f), name, { skipLive: opts.skipLive }),
    );
  });

  addGlobalOptions(
    cx
      .command("sync-export [outFile]")
      .description("export fleet proposals/tasks JSON for multi-host handoff"),
  ).action(async (outFile: string | undefined, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxSyncExport(await cxCtx(command, f.pack, f), outFile));
  });

  addGlobalOptions(
    cx
      .command("sync-import <inFile>")
      .description("import/merge fleet proposals/tasks from board-sync JSON"),
  ).action(async (inFile: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxSyncImport(await cxCtx(command, f.pack, f), inFile));
  });

  addGlobalOptions(
    cx
      .command("deploy-history <name>")
      .description("show build/deploy history samples")
      .option("--limit <n>", "max rows", "20"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { limit?: string }>();
    throw new CliExit(await runCxDeployHistory(await cxCtx(command, f.pack, f), name, opts.limit));
  });

  addGlobalOptions(
    cx
      .command("incident <name>")
      .description("one-shot: status → seed-operate → operate → queue")
      .option("--target <list>", "targets for status/operate", "all")
      .option("--live", "prefer live platform")
      .option("--auto-live", "hybrid without --live")
      .option("--base-url <url>", "local platform base URL")
      .option("--actor <id>", "operator identity"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    const opts = command.optsWithGlobals<CxCmdOpts & { actor?: string }>();
    throw new CliExit(
      await runCxIncident(
        await cxCtx(command, f.pack, { ...f, actor: opts.actor }),
        name,
        f.target,
      ),
    );
  });

  return program;
}

/** Commander usage errors default to exitCode 1 internally; R7.2 wants 2 for all of them. */
function mapExitCode(err: unknown): { code: number; message?: string } {
  if (err instanceof CliExit) {
    return { code: err.code, message: err.message || undefined };
  }
  if (err instanceof CommanderError) {
    if (err.code === "commander.version" || err.code === "commander.helpDisplayed") {
      return { code: err.exitCode };
    }
    return { code: 2 };
  }
  return { code: 1, message: err instanceof Error ? err.message : String(err) };
}

/** Parses argv (in commander's `{from:"user"}` shape) and returns the process exit code. */
export async function runCli(argv: string[], io: CliIo = REAL_IO): Promise<number> {
  const program = createProgram(io);
  try {
    // Default `from: "node"` — argv is the real process.argv shape
    // ([execPath, scriptPath, ...args]), which is what both the bootstrap
    // call below and every test in test/args.test.ts pass.
    await program.parseAsync(argv);
    return 0;
  } catch (err) {
    const { code, message } = mapExitCode(err);
    if (message) io.writeErr(`cox: ${message}\n`);
    return code;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli(process.argv).then((code) => {
    process.exitCode = code;
  });
}
