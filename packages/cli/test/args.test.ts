import { describe, expect, it } from "vitest";
import { createProgram, runCli, type CliIo } from "../src/main";

function captureIo(): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      writeOut: (s) => out.push(s),
      writeErr: (s) => err.push(s),
    },
    out,
    err,
  };
}

describe("R7.1: command surface", () => {
  it("registers exactly the docs/00 top-level commands plus replay", () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name()).sort();
    expect(names).toEqual(
      [
        "cx",
        "doctor",
        "explain",
        "health",
        "hook",
        "ledger",
        "models",
        "replay",
        "spec",
        "steer",
        "suggest",
      ].sort(),
    );
  });

  it("registers spec new|approve|design|tasks|run|status", () => {
    const program = createProgram();
    const spec = program.commands.find((c) => c.name() === "spec");
    expect(spec).toBeDefined();
    expect(spec!.commands.map((c) => c.name()).sort()).toEqual(
      ["approve", "design", "new", "run", "status", "tasks"].sort(),
    );
  });

  it("registers steer init and hook run", () => {
    const program = createProgram();
    const steer = program.commands.find((c) => c.name() === "steer");
    const hook = program.commands.find((c) => c.name() === "hook");
    expect(steer!.commands.map((c) => c.name())).toEqual(["init"]);
    expect(hook!.commands.map((c) => c.name())).toEqual(["run"]);
  });

  it("registers the four global flags on the root program", () => {
    const program = createProgram();
    const longFlags = program.options.map((o) => o.long);
    expect(longFlags).toEqual(
      expect.arrayContaining(["--cwd", "--model", "--print", "--yolo"]),
    );
  });
});

describe("R7.2: exit codes", () => {
  it("--version exits 0", async () => {
    const { io } = captureIo();
    const code = await runCli(["node", "cox", "--version"], io);
    expect(code).toBe(0);
  });

  it("--help exits 0", async () => {
    const { io, out } = captureIo();
    const code = await runCli(["node", "cox", "--help"], io);
    expect(code).toBe(0);
    expect(out.join("")).toMatch(/Coxswain/);
  });

  it("subcommand --help exits 0", async () => {
    const { io } = captureIo();
    const code = await runCli(["node", "cox", "spec", "--help"], io);
    expect(code).toBe(0);
  });

  it("invalid -m tier exits 2 and lists the valid tiers", async () => {
    const { io, err } = captureIo();
    const code = await runCli(["node", "cox", "-m", "nope"], io);
    expect(code).toBe(2);
    const message = err.join("");
    expect(message).toMatch(/scout/);
    expect(message).toMatch(/builder/);
    expect(message).toMatch(/architect/);
  });

  it("unknown subcommand exits 2 (usage error via exitOverride)", async () => {
    const { io } = captureIo();
    const code = await runCli(["node", "cox", "spec", "bogus"], io);
    expect(code).toBe(2);
  });

  it("an unmatched top-level token falls through to the default (interactive) action", async () => {
    // The root command owns a default action (bare `cox`), so a stray
    // top-level token is treated as an argument to it rather than a
    // command-not-found error — commander behavior when excess arguments
    // are allowed on a command that has its own action. It still reaches
    // the default action's own logic (R6.1: non-TTY stdout without
    // --print is a usage error) rather than "unknown command".
    const { io } = captureIo();
    const code = await runCli(["node", "cox", "bogus"], io);
    expect(code).toBe(2);
  });

  it("unknown option exits 2", async () => {
    const { io } = captureIo();
    const code = await runCli(["node", "cox", "--nope"], io);
    expect(code).toBe(2);
  });

  it("missing required argument exits 2", async () => {
    const { io } = captureIo();
    const code = await runCli(["node", "cox", "spec", "new"], io);
    expect(code).toBe(2);
  });

  it("R6.1: bare invocation on a non-TTY stdout without --print is a usage error (exit 2)", async () => {
    const { io } = captureIo();
    const code = await runCli(["node", "cox"], io);
    expect(code).toBe(2);
  });

  it("--print reaches the real composition root; without an API key the provider error surfaces as exit 1", async () => {
    // Post-integration: engines are wired, so the run proceeds until the
    // anthropic adapter's lazy key read fails. Ensure the key is absent
    // regardless of the developer's shell environment.
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const { io, out, err } = captureIo();
      const code = await runCli(["node", "cox", "--print", "hello"], io);
      expect(code).toBe(1);
      expect([...out, ...err].join("")).toMatch(/ANTHROPIC_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("one-shot commands are a runtime exit 1 while unimplemented/unwired", async () => {
    const { io } = captureIo();
    const code = await runCli(["node", "cox", "explain", "what", "is", "this"], io);
    expect(code).toBe(1);
  });

  it("global flags parse in any position without changing the exit-code contract", async () => {
    const { io } = captureIo();
    const code = await runCli(
      ["node", "cox", "explain", "text", "-m", "scout", "--yolo"],
      io,
    );
    expect(code).toBe(1); // still unwired at this stage — parsing succeeded though
  });
});
