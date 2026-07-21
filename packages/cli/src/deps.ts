/**
 * @cox/cli — the M1-safe NotWired boundary (R8.2).
 *
 * `loadDeps` is the ONLY place in this package allowed to import another
 * `@cox/*` engine package (providers/router/ledger/agent/tools/spec/
 * steering/hooks) — every other file reaches engines only through the
 * `EngineDeps` values this function returns. Each package is dynamic-
 * imported and runtime-checked for its factory before use; while a lane is
 * still a stub (no factory exported), this throws `NotWiredError` naming
 * that package so `cox replay`, `cox doctor --offline`, `--help`, and arg
 * parsing keep working (docs/specs/tui-cli/design.md "deps.ts — the
 * M1-safe boundary").
 *
 * Because `EngineDeps.agent`/`.specs` must be fully-constructed instances
 * (an `AgentRunner`/`SpecEngine`, not a factory), this function also does
 * the cross-wiring that docs/specs/tui-cli/design.md's "wire.ts order"
 * section describes (registry → ledger → router → tools/steering/hooks →
 * agent → specs), including the `route`/`preToolUse`/`postToolUse`/
 * phase-hook closures — there is no way to hand back a working `agent`
 * without having already built them. `wire.ts` builds the remaining
 * session-level pieces (snapshot store, ledger-writer subscriber,
 * `SessionController`) on top of what this returns. See
 * `packages/cli/NOTES.md` for the full explanation of this split and the
 * factory-signature mismatches against tui-cli's own design.md sketch.
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  pricingFor,
  type AgentEvent,
  type AgentRunner,
  type BudgetState,
  type ChatModel,
  type CoxConfig,
  type EventBus,
  type HookEngine,
  type HookOutcome,
  type HookPayload,
  type Ledger,
  type PermissionDecision,
  type PermissionMode,
  type PermissionRequest,
  type ProviderRegistry,
  type Router,
  type SpecEngine,
  type SteeringStore,
  type Tier,
  type ToolRegistry,
} from "@cox/core";

export class NotWiredError extends Error {
  readonly pkg: string;
  constructor(pkg: string) {
    super(`${pkg} not wired`);
    this.name = "NotWiredError";
    this.pkg = pkg;
  }
}

export interface EngineDeps {
  registry: ProviderRegistry;
  router: Router;
  ledger: Ledger;
  agent: AgentRunner;
  specs: SpecEngine;
  steering: SteeringStore;
  hooks: HookEngine;
  tools: ToolRegistry;
}

/**
 * `loadDeps` additionally stamps a generated session id, because
 * `@cox/agent`'s real `createAgentRunner` binds `budgetState` as a zero-arg
 * `() => Promise<BudgetState>` closure (docs/specs/agent-tools/design.md) —
 * there is no per-call sessionId seam. `wire.ts` reuses this value as
 * `SessionController.sessionId` so ledger writes, budget checks, and hook
 * payloads all agree on one session identity. Not part of the `EngineDeps`
 * shape tui-cli/design.md defines — an documented extra property, same
 * spirit as `@cox/ledger`'s documented `lastReadSkippedLines`.
 *
 * Also exposes `resolvePermission`: design.md's session.ts section says
 * "resolvePermission(d) resolves the promise created by the wired
 * ToolContext.requestPermission (cli supplies that function when
 * constructing tools/agent...)" — but agent-tools/design.md's *published*
 * `createAgentRunner` signature has no `requestPermission` parameter at
 * all, so there is no documented seam to inject one. `loadDeps` adds it
 * speculatively (see the `AgentModule` type below and
 * INTEGRATION-NOTES.md) and parks the resolver here so `session.ts` can
 * bridge `SessionController.resolvePermission` to it without needing to
 * know how `agent` is actually wired inside.
 */
export interface LoadedDeps extends EngineDeps {
  sessionId: string;
  resolvePermission: (decision: PermissionDecision) => void;
  /**
   * The per-tier failover ChatModel closure built in step 1, exposed so
   * commands/oneshot.ts (explain/suggest, R9.1) can use the exact same
   * tier -> model resolution `agent` uses, instead of reconstructing a
   * simpler (fallback-less) version from `registry` itself.
   */
  tierModel: (tier: Tier) => ChatModel;
  /** @cox/steering's STEERING_TEMPLATES constant (R12.1's `cox steer init`). */
  steeringTemplates: Record<"product" | "tech" | "structure", string>;
}

function newSessionId(): string {
  return `ses_${randomBytes(4).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Per-package factory shapes, hand-transcribed from each lane's own
// design.md (docs/specs/<lane>/design.md — read there, not here, for the
// authoritative signature). Stub packages export none of these yet, so the
// type TypeScript would otherwise infer from `import("@cox/x")` is just
// whatever the current stub happens to export (a `PACKAGE` marker string) —
// unusable. `safeImport` below casts through `unknown` to describe the
// shape we expect once the lane lands; this is the ONLY place in this
// package that does so. The runtime `need()` check (not the type system)
// is what actually guards against stubs.
// ---------------------------------------------------------------------------

interface ProvidersModule {
  createProviderRegistry?: (config: CoxConfig) => ProviderRegistry;
  createFailoverChatModel?: (models: ChatModel[]) => ChatModel;
}

interface LedgerModule {
  createLedger?: (deps: {
    filePath: string;
    config: CoxConfig;
    pricing: typeof pricingFor;
    now: () => string;
  }) => Ledger;
}

interface RouterModule {
  createRouter?: (deps: {
    config: CoxConfig;
    ledger: Ledger;
    classifyModel: () => ChatModel;
    now: () => string;
  }) => Router;
}

interface ToolsModule {
  createBuiltinTools?: (opts: { cwd: string; config: CoxConfig }) => ToolRegistry;
}

interface SteeringModule {
  createSteeringStore?: (deps: { config: CoxConfig }) => SteeringStore;
  STEERING_TEMPLATES?: Record<"product" | "tech" | "structure", string>;
}

interface HooksModule {
  createHookEngine?: (deps: {
    cwd: string;
    config: CoxConfig;
    env?: NodeJS.ProcessEnv;
  }) => HookEngine;
}

interface AgentModule {
  createAgentRunner?: (deps: {
    router: Router;
    modelForTier: (t: Tier) => ChatModel;
    tools: ToolRegistry;
    permissionMode: PermissionMode;
    config: CoxConfig;
    budgetState: () => Promise<BudgetState>;
    preToolUse?: (p: HookPayload) => Promise<HookOutcome[]>;
    postToolUse?: (p: HookPayload) => Promise<HookOutcome[]>;
    // NOT in agent-tools/design.md's published signature — added
    // speculatively per tui-cli/design.md's own assumption that cli
    // supplies this when constructing agent/tools. Ignored (harmlessly,
    // real JS objects don't reject unknown properties) if the real
    // factory doesn't accept it; see INTEGRATION-NOTES.md.
    requestPermission?: (req: PermissionRequest) => Promise<PermissionDecision>;
    now?: () => number;
  }) => AgentRunner;
}

interface SpecModule {
  createSpecEngine?: (deps: {
    cwd: string;
    runner: AgentRunner;
    onEvent: (e: AgentEvent) => void;
    onPhaseChange?: (p: HookPayload) => Promise<void>;
    onTaskComplete?: (p: HookPayload) => Promise<void>;
    now: () => string;
  }) => SpecEngine;
}

/** The sole `unknown` cast in this package — see file header comment. */
async function safeImport<T>(pkg: string, thunk: () => Promise<unknown>): Promise<T> {
  try {
    return (await thunk()) as T;
  } catch {
    throw new NotWiredError(pkg);
  }
}

function need<T>(pkg: string, factory: T | undefined): T {
  if (typeof factory !== "function") throw new NotWiredError(pkg);
  return factory;
}

/** Like `need`, but for a required plain value export (not a factory function) — e.g. STEERING_TEMPLATES. */
function needValue<T>(pkg: string, value: T | undefined): T {
  if (value === undefined) throw new NotWiredError(pkg);
  return value;
}

function mergeTierOverride(outcomes: HookOutcome[]): Tier | undefined {
  for (let i = outcomes.length - 1; i >= 0; i--) {
    const tier = outcomes[i]?.output?.tierOverride;
    if (tier === "scout" || tier === "builder" || tier === "architect") return tier;
  }
  return undefined;
}

export async function loadDeps(
  cfg: CoxConfig,
  cwd: string,
  bus: EventBus,
): Promise<LoadedDeps> {
  const now = () => new Date().toISOString();
  const sessionId = newSessionId();

  // 1. providers — registry + memoized per-tier failover chat models.
  const providersMod = await safeImport<ProvidersModule>("@cox/providers", () =>
    import("@cox/providers"),
  );
  const createProviderRegistry = need("@cox/providers", providersMod.createProviderRegistry);
  const createFailoverChatModel = need("@cox/providers", providersMod.createFailoverChatModel);
  const registry = createProviderRegistry(cfg);
  const tierModelCache = new Map<Tier, ChatModel>();
  const tierModel = (tier: Tier): ChatModel => {
    const cached = tierModelCache.get(tier);
    if (cached) return cached;
    const entry = cfg.tiers[tier];
    const models = [entry.primary, ...entry.fallbacks].map((ref) => registry.getModel(ref));
    const model = createFailoverChatModel(models);
    tierModelCache.set(tier, model);
    return model;
  };

  // 2. ledger — the router's budget governor reads it.
  const ledgerMod = await safeImport<LedgerModule>("@cox/ledger", () => import("@cox/ledger"));
  const createLedger = need("@cox/ledger", ledgerMod.createLedger);
  const ledger = createLedger({
    filePath: join(cwd, ".cox", "ledger.jsonl"),
    config: cfg,
    pricing: pricingFor,
    now,
  });

  // 3. router.
  const routerMod = await safeImport<RouterModule>("@cox/router", () => import("@cox/router"));
  const createRouter = need("@cox/router", routerMod.createRouter);
  const router = createRouter({ config: cfg, ledger, classifyModel: () => tierModel("scout"), now });

  // 4. tools, steering, hooks — siblings, no cross-deps among themselves.
  const toolsMod = await safeImport<ToolsModule>("@cox/tools", () => import("@cox/tools"));
  const createBuiltinTools = need("@cox/tools", toolsMod.createBuiltinTools);
  const tools = createBuiltinTools({ cwd, config: cfg });

  const steeringMod = await safeImport<SteeringModule>("@cox/steering", () =>
    import("@cox/steering"),
  );
  const createSteeringStore = need("@cox/steering", steeringMod.createSteeringStore);
  const steering = createSteeringStore({ config: cfg });
  const steeringTemplates = needValue("@cox/steering", steeringMod.STEERING_TEMPLATES);

  const hooksMod = await safeImport<HooksModule>("@cox/hooks", () => import("@cox/hooks"));
  const createHookEngine = need("@cox/hooks", hooksMod.createHookEngine);
  const hooks = createHookEngine({ cwd, config: cfg });

  // 5. agent. `@cox/agent`'s createAgentRunner takes a `router: Router`
  // (the whole interface), not a `route` closure — so the "fire
  // PreModelCall, merge tierOverride" step from design.md's wire.ts sketch
  // is implemented here as a Router decorator (INTEGRATION-NOTES.md).
  // Blocking on PreModelCall is intentionally not implemented: docs/01's
  // dataflow only documents "[may override tier]" for this hook (unlike
  // UserPromptSubmit's "[may block]"), and `Router.route`'s return type has
  // no channel to signal cancellation.
  const agentMod = await safeImport<AgentModule>("@cox/agent", () => import("@cox/agent"));
  const createAgentRunner = need("@cox/agent", agentMod.createAgentRunner);

  const routerWithHooks: Router = {
    async route(input) {
      const outcomes = await hooks.fire({
        event: "PreModelCall",
        sessionId: input.sessionId,
        cwd,
        data: { kind: input.kind, tier: input.userOverrideTier },
      });
      if (outcomes.length > 0) {
        bus.emit({ type: "hook_fired", event: "PreModelCall", outcomes });
      }
      const tierOverride = mergeTierOverride(outcomes);
      return router.route(tierOverride ? { ...input, hookOverrideTier: tierOverride } : input);
    },
    reconsider(current, input, signals) {
      return router.reconsider(current, input, signals);
    },
  };

  // Bridges SessionController.resolvePermission (session.ts) to whatever
  // ToolContext.requestPermission the real agent runner ends up calling —
  // see the LoadedDeps and AgentModule comments above for why this is
  // speculative rather than a documented seam.
  let pendingPermissionResolve: ((d: PermissionDecision) => void) | null = null;
  const requestPermission = (req: PermissionRequest): Promise<PermissionDecision> =>
    new Promise((resolve) => {
      pendingPermissionResolve = resolve;
      bus.emit({ type: "permission_request", request: req });
    });
  const resolvePermission = (decision: PermissionDecision): void => {
    const resolve = pendingPermissionResolve;
    pendingPermissionResolve = null;
    resolve?.(decision);
  };

  const agent = createAgentRunner({
    router: routerWithHooks,
    modelForTier: tierModel,
    tools,
    permissionMode: cfg.permissions.mode,
    config: cfg,
    budgetState: () => ledger.budgetState(sessionId),
    preToolUse: (p) => hooks.fire(p),
    postToolUse: (p) => hooks.fire(p),
    requestPermission,
  });

  // 6. specs. Decorates `agent` to prepend steering to the fixed
  // SPEC_SYSTEM prompt (docs/specs/spec-engine/design.md: "cli wrapping the
  // runner dep with a decorator... the engine neither knows nor imports
  // @cox/steering").
  const specMod = await safeImport<SpecModule>("@cox/spec", () => import("@cox/spec"));
  const createSpecEngine = need("@cox/spec", specMod.createSpecEngine);

  const runnerWithSteering: AgentRunner = {
    async run(task, onEvent, signal) {
      const docs = await steering.loadAll(cwd);
      const sel = steering.select(docs, [], []);
      const stableSteering = sel.systemDocs.map((d) => d.body).join("\n\n");
      const system = stableSteering ? `${stableSteering}\n\n${task.system}` : task.system;
      return agent.run({ ...task, system }, onEvent, signal);
    },
  };

  const fireHookNotification = async (p: HookPayload): Promise<void> => {
    const outcomes = await hooks.fire(p);
    if (outcomes.length > 0) bus.emit({ type: "hook_fired", event: p.event, outcomes });
  };

  const specs = createSpecEngine({
    cwd,
    runner: runnerWithSteering,
    onEvent: (e) => bus.emit(e),
    onPhaseChange: fireHookNotification,
    onTaskComplete: fireHookNotification,
    now,
  });

  return {
    registry,
    router,
    ledger,
    agent,
    specs,
    steering,
    hooks,
    tools,
    sessionId,
    resolvePermission,
    tierModel,
    steeringTemplates,
  };
}
