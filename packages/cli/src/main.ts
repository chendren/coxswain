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
  runCxReport,
  runCxSimulate,
  runCxStatus,
  runCxTeardown,
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
    extra?: { live?: boolean; mode?: string; localBaseUrl?: string },
  ): Promise<CxCommandContext> {
    const opts = command.optsWithGlobals<GlobalOpts>();
    const cwd = resolveCwd(opts);
    const wantLive = Boolean(extra?.live) || extra?.mode === "live" || extra?.mode === "hybrid";
    let tierModel: CxCommandContext["tierModel"];
    if (wantLive) {
      try {
        const bus = new EventBus();
        const cfg = loadConfig(cwd);
        const deps = await loadDeps(cfg, cwd, bus);
        tierModel = deps.tierModel;
      } catch (e) {
        write(
          `warning: live models unavailable (${e instanceof Error ? e.message : String(e)}); falling back offline`,
        );
      }
    }
    const mode: CxRuntimeMode | undefined = extra?.live
      ? tierModel
        ? "hybrid"
        : "offline"
      : (extra?.mode as CxRuntimeMode | undefined) ?? "offline";
    return {
      cwd,
      write,
      pack,
      mode,
      tierModel,
      localBaseUrl: extra?.localBaseUrl,
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
    mode?: string;
    pack?: string;
    baseUrl?: string;
  };

  function cxFlags(command: Command): {
    pack?: string;
    live?: boolean;
    mode?: string;
    localBaseUrl?: string;
    target?: string;
  } {
    const opts = command.optsWithGlobals<CxCmdOpts>();
    return {
      pack: opts.pack,
      live: opts.live,
      mode: opts.mode,
      localBaseUrl: opts.baseUrl,
      target: opts.target,
    };
  }

  addGlobalOptions(
    cx.command("doctor").description("CXOS runtime wiring + ontology health"),
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
      .option("--mode <mode>", "offline|live|hybrid")
      .option("--base-url <url>", "local platform base URL")
      .option("--pack <name>", "ontology pack: default|local", "local"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxBuild(await cxCtx(command, f.pack, f), name, f.target, true));
  });

  addGlobalOptions(
    cx
      .command("deploy <name>")
      .description("build and deploy targets")
      .option("--target <list>", "artifacts,local,aws or all", "all")
      .option("--live", "prefer live models/platform when available")
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
      .option("--base-url <url>", "local platform base URL"),
  ).action(async (name: string, _o: GlobalOpts, command: Command) => {
    const f = cxFlags(command);
    throw new CliExit(await runCxConsole(await cxCtx(command, f.pack, f), name, f.target));
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
