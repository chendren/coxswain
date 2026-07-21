import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EventBus, configSchema } from "@cox/core";
import type {
  AgentEvent,
  AgentRunner,
  AgentTask,
  BudgetConfig,
  BudgetState,
  HookEngine,
  HookOutcome,
  Ledger,
  LedgerEntry,
  SteeringDoc,
  SteeringSelection,
  SteeringStore,
} from "@cox/core";
import type { LoadedDeps } from "../src/deps";
import { createSessionController } from "../src/session";
import { runLedgerReport } from "../src/commands/ledger";
import { runModelsReport } from "../src/commands/models";
import { runSteerInit } from "../src/commands/steer";

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

function fakeHooks(): HookEngine {
  return {
    async fire() {
      return [];
    },
    agentHooks() {
      return [];
    },
  };
}

function fakeSteering(opts: {
  docs?: SteeringDoc[];
  selection?: Partial<SteeringSelection>;
}): SteeringStore {
  return {
    async loadAll() {
      return opts.docs ?? [];
    },
    select() {
      return {
        systemDocs: opts.selection?.systemDocs ?? [],
        contextDocs: opts.selection?.contextDocs ?? [],
        totalTokens: opts.selection?.totalTokens ?? 0,
      };
    },
  };
}

function fakeAgent(): AgentRunner & { calls: AgentTask[] } {
  const calls: AgentTask[] = [];
  return {
    calls,
    async run(task, onEvent) {
      calls.push(task);
      onEvent({ type: "turn_done", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0 });
      return {
        finalText: "ok",
        history: task.history,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
        stopReason: "end_turn",
      };
    },
  };
}

function minimalLoadedDeps(over: Partial<LoadedDeps>): LoadedDeps {
  const notUsed = new Proxy(
    {},
    {
      get() {
        throw new Error("unexpected access on an engine not needed by this test");
      },
    },
  );
  return {
    registry: notUsed as never,
    router: notUsed as never,
    ledger: notUsed as never,
    agent: fakeAgent(),
    specs: notUsed as never,
    steering: fakeSteering({}),
    hooks: fakeHooks(),
    tools: notUsed as never,
    sessionId: "ses_test",
    resolvePermission: vi.fn(),
    tierModel: () => notUsed as never,
    steeringTemplates: { product: "", tech: "", structure: "" },
    ...over,
  };
}

const cfg = configSchema.parse({});

function baseControllerOpts(deps: LoadedDeps, bus: EventBus, budgets: BudgetConfig) {
  return {
    deps,
    bus,
    cfg,
    cwd: "/proj",
    snapshot: { onEvent: () => {}, get: () => ({} as never) },
    budgets,
  };
}

describe("R8.5: /model sets and /model auto clears the override", () => {
  it("subsequent turns use the override tier until /model auto clears it", async () => {
    const bus = new EventBus();
    const agent = fakeAgent();
    const deps = minimalLoadedDeps({ agent });
    const controller = createSessionController(baseControllerOpts(deps, bus, cfg.budgets));

    controller.submitCommand("model", ["architect"]);
    await flush();
    controller.submitPrompt("first");
    await flush();
    expect(agent.calls[0]!.userOverrideTier).toBe("architect");

    controller.submitCommand("model", ["auto"]);
    await flush();
    controller.submitPrompt("second");
    await flush();
    expect(agent.calls[1]!.userOverrideTier).toBeUndefined();
  });

  it("rejects an invalid tier name without touching the override", async () => {
    const bus = new EventBus();
    const events: AgentEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const agent = fakeAgent();
    const deps = minimalLoadedDeps({ agent });
    const controller = createSessionController(baseControllerOpts(deps, bus, cfg.budgets));

    controller.submitCommand("model", ["nonsense"]);
    await flush();
    expect(events.some((e) => e.type === "error")).toBe(true);
    controller.submitPrompt("x");
    await flush();
    expect(agent.calls[0]!.userOverrideTier).toBeUndefined();
  });
});

describe("R8.5: /budget extend mutates the retained budgets object", () => {
  it("is visible on the next ledger.budgetState() call", async () => {
    const budgets: BudgetConfig = { warnAt: 0.8, hardStop: true, sessionUsd: 5 };
    const ledger: Ledger = {
      async record() {},
      async query() {
        return [];
      },
      async summary() {
        return {
          entries: 0,
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          costUsd: 0,
          byTier: {},
          byModel: {},
          baselineArchitectCostUsd: 0,
        };
      },
      async budgetState(): Promise<BudgetState> {
        // Reads live from the shared `budgets` object, like the real ledger does off config.budgets.
        return { level: "ok", spentUsd: 0, spentTokens: 0, limitUsd: budgets.sessionUsd };
      },
    };
    const bus = new EventBus();
    const deps = minimalLoadedDeps({ ledger });
    const controller = createSessionController(baseControllerOpts(deps, bus, budgets));

    expect((await ledger.budgetState("s")).limitUsd).toBe(5);
    controller.submitCommand("budget", ["extend", "10"]);
    await flush();
    expect((await ledger.budgetState("s")).limitUsd).toBe(15);
    expect(budgets.sessionUsd).toBe(15);
  });

  it("rejects a non-numeric or non-positive amount without mutating budgets", async () => {
    const budgets: BudgetConfig = { warnAt: 0.8, hardStop: true, sessionUsd: 5 };
    const bus = new EventBus();
    const events: AgentEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const deps = minimalLoadedDeps({});
    const controller = createSessionController(baseControllerOpts(deps, bus, budgets));

    controller.submitCommand("budget", ["extend", "not-a-number"]);
    await flush();
    expect(budgets.sessionUsd).toBe(5);
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});

describe("R8.5: /context lists steering docs with token weights and the system prompt size", () => {
  it("emits an agent_message panel listing every loaded doc", async () => {
    const bus = new EventBus();
    const events: AgentEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const docs: SteeringDoc[] = [
      { name: "tech", path: "/x/tech.md", inclusion: "always", body: "x".repeat(168), tokens: 42, imported: false },
      { name: "auth", path: "/x/auth.md", inclusion: "fileMatch", fileMatchPattern: "src/**", body: "y", tokens: 3, imported: false },
    ];
    const deps = minimalLoadedDeps({ steering: fakeSteering({ docs }) });
    const controller = createSessionController(baseControllerOpts(deps, bus, cfg.budgets));

    controller.submitCommand("context", []);
    await flush();

    const panel = events.find((e) => e.type === "agent_message");
    expect(panel).toBeDefined();
    const text = panel && panel.type === "agent_message" ? panel.text : "";
    expect(text).toMatch(/system prompt: ~\d+ tokens/);
    expect(text).toContain("tech");
    expect(text).toContain("42");
    expect(text).toContain("auth");
    expect(text).toContain("fileMatch");
  });
});

describe("R11.2: cox ledger prints via the shared renderLedgerTable", () => {
  it("runLedgerReport writes the rendered table", async () => {
    const ledger: Ledger = {
      async record() {},
      async query() {
        return [];
      },
      async summary() {
        return {
          entries: 3,
          usage: { inputTokens: 300, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 },
          costUsd: 0.03,
          byTier: {
            scout: {
              calls: 1,
              usage: { inputTokens: 300, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 },
              costUsd: 0.03,
            },
          },
          byModel: {},
          baselineArchitectCostUsd: 0.1,
        };
      },
      async budgetState() {
        return { level: "ok", spentUsd: 0, spentTokens: 0 };
      },
    };
    const lines: string[] = [];
    await runLedgerReport({ ledger, write: (l) => lines.push(l) });
    const output = lines.join("\n");
    expect(output).toContain("tier");
    expect(output).toContain("scout");
    expect(output).toContain("savings vs all-architect baseline");
    expect(output).toContain("cache:");
  });
});

describe("R11.1: cox models prints tiers/models/pricing, marking unknown pricing n/a", () => {
  it("marks an unrecognized provider/model as pricing n/a", () => {
    const customCfg = configSchema.parse({
      tiers: {
        scout: { primary: { provider: "openai-compat:mystery", model: "some-model" }, fallbacks: [] },
        builder: { primary: { provider: "anthropic", model: "claude-sonnet-5" }, fallbacks: [] },
        architect: { primary: { provider: "anthropic", model: "claude-opus-4-8" }, fallbacks: [] },
      },
    });
    const lines: string[] = [];
    runModelsReport({ cfg: customCfg, write: (l) => lines.push(l) });
    const output = lines.join("\n");
    expect(output).toContain("pricing n/a");
    expect(output).toContain("scout:");
    expect(output).toMatch(/\$3\.00\/\$15\.00/);
  });
});

describe("R12.1: cox steer init", () => {
  async function tmpProject(): Promise<string> {
    return mkdtemp(join(tmpdir(), "cox-steer-"));
  }

  it("writes missing templates only, skipping files that already exist", async () => {
    const cwd = await tmpProject();
    await mkdir(join(cwd, ".cox", "steering"), { recursive: true });
    await writeFile(join(cwd, ".cox", "steering", "tech.md"), "hand-edited content", "utf8");

    const lines: string[] = [];
    await runSteerInit({
      cwd,
      templates: { product: "PRODUCT TEMPLATE", tech: "TECH TEMPLATE", structure: "STRUCTURE TEMPLATE" },
      sessionId: "s",
      write: (l) => lines.push(l),
      isTTY: false,
    });

    const product = await readFile(join(cwd, ".cox", "steering", "product.md"), "utf8");
    const tech = await readFile(join(cwd, ".cox", "steering", "tech.md"), "utf8");
    const structure = await readFile(join(cwd, ".cox", "steering", "structure.md"), "utf8");
    expect(product).toBe("PRODUCT TEMPLATE");
    expect(tech).toBe("hand-edited content"); // untouched
    expect(structure).toBe("STRUCTURE TEMPLATE");
    expect(lines.some((l) => l.includes("product.md"))).toBe(true);
    expect(lines.some((l) => l.includes("tech.md") && /skip/i.test(l))).toBe(true);
  });

  it("offers the agent fill-in only when isTTY, and only after the injected confirm fn says yes", async () => {
    const cwd = await tmpProject();
    const confirm = vi.fn().mockResolvedValue(true);
    const agent = fakeAgent();
    await runSteerInit({
      cwd,
      templates: { product: "P" },
      sessionId: "s",
      write: () => {},
      isTTY: true,
      agent,
      confirm,
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]!.userOverrideTier).toBe("architect");
  });

  it("does not prompt or run the agent when not a TTY", async () => {
    const cwd = await tmpProject();
    const confirm = vi.fn();
    const agent = fakeAgent();
    await runSteerInit({ cwd, templates: { product: "P" }, sessionId: "s", write: () => {}, isTTY: false, agent, confirm });
    expect(confirm).not.toHaveBeenCalled();
    expect(agent.calls).toHaveLength(0);
  });

  it("does not run the agent when the user declines the prompt", async () => {
    const cwd = await tmpProject();
    const confirm = vi.fn().mockResolvedValue(false);
    const agent = fakeAgent();
    await runSteerInit({ cwd, templates: { product: "P" }, sessionId: "s", write: () => {}, isTTY: true, agent, confirm });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(agent.calls).toHaveLength(0);
  });

  it("does not prompt at all when every template already existed (nothing new to fill in)", async () => {
    const cwd = await tmpProject();
    await mkdir(join(cwd, ".cox", "steering"), { recursive: true });
    await writeFile(join(cwd, ".cox", "steering", "product.md"), "existing", "utf8");
    const confirm = vi.fn();
    await runSteerInit({
      cwd,
      templates: { product: "P" },
      sessionId: "s",
      write: () => {},
      isTTY: true,
      agent: fakeAgent(),
      confirm,
    });
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("R8.5: /spec, /steer, /hook dispatch without crashing (smoke)", () => {
  it("/spec new calls specs.create and emits an agent_message", async () => {
    const bus = new EventBus();
    const events: AgentEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const created: { name: string; idea: string }[] = [];
    const specs = {
      async create(name: string, idea: string) {
        created.push({ name, idea });
        return { name, createdAt: "", phases: { requirements: "missing", design: "missing", tasks: "missing" }, tasks: [], approvals: [] };
      },
      async load() {
        return null;
      },
      async list() {
        return [];
      },
      async generate() {
        throw new Error("not used");
      },
      async approve() {
        throw new Error("not used");
      },
      async runTask() {
        throw new Error("not used");
      },
    };
    const deps = minimalLoadedDeps({ specs: specs as never });
    const controller = createSessionController(baseControllerOpts(deps, bus, cfg.budgets));

    controller.submitCommand("spec", ["new", "auth-flow", "add", "login"]);
    await flush();

    expect(created).toEqual([{ name: "auth-flow", idea: "add login" }]);
    expect(events.some((e) => e.type === "agent_message")).toBe(true);
  });

  it("/hook run <name> runs the matching agent hook on its configured tier", async () => {
    const bus = new EventBus();
    const agent = fakeAgent();
    const hooks: HookEngine = {
      async fire() {
        return [] as HookOutcome[];
      },
      agentHooks() {
        return [{ name: "lint-on-save", trigger: { type: "manual" }, tier: "scout", prompt: "run the linter" }];
      },
    };
    const deps = minimalLoadedDeps({ agent, hooks });
    const controller = createSessionController(baseControllerOpts(deps, bus, cfg.budgets));

    controller.submitCommand("hook", ["run", "lint-on-save"]);
    await flush();

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]!.userOverrideTier).toBe("scout");
    expect(agent.calls[0]!.prompt).toBe("run the linter");
  });

  it("/hook run <unknown> emits a local error", async () => {
    const bus = new EventBus();
    const events: AgentEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const deps = minimalLoadedDeps({});
    const controller = createSessionController(baseControllerOpts(deps, bus, cfg.budgets));

    controller.submitCommand("hook", ["run", "does-not-exist"]);
    await flush();
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});
