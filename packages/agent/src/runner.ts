import type {
  AgentEvent,
  AgentRunner,
  AgentRunResult,
  AgentTask,
  BudgetState,
  ChatMessage,
  ChatModel,
  CoxConfig,
  HookOutcome,
  HookPayload,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  Router,
  RoutingInput,
  StopReason,
  Tier,
  TokenUsage,
  Tool,
  ToolContext,
  ToolRegistry,
  ToolResult,
} from "@cox/core";
import { addUsage, computeCostUsd, pricingFor, ZERO_USAGE } from "@cox/core";
import { createAllowlist, permissionKey, type Allowlist } from "./allowlist";
import { assemble, buildAssistantMessage, buildToolResultMessage } from "./assemble";
import { createSignalTracker } from "./escalation";
import { inputPreview, resultPreview } from "./preview";

const DEFAULT_MAX_TURNS = 40;

export interface AgentRunnerDeps {
  router: Router;
  modelForTier: (t: Tier) => ChatModel;
  tools: ToolRegistry;
  permissionMode: PermissionMode;
  config: CoxConfig;
  budgetState: () => Promise<BudgetState>;
  /**
   * Resolves a permission_request to a decision. Not in design.md's literal
   * deps list — required to implement R6.1 (ToolContext.requestPermission
   * needs a working implementation and nothing else in `deps` supplies one).
   * See INTEGRATION-NOTES.md.
   */
  requestPermission: (req: PermissionRequest) => Promise<PermissionDecision>;
  preToolUse?: (p: HookPayload) => Promise<HookOutcome[]>;
  postToolUse?: (p: HookPayload) => Promise<HookOutcome[]>;
  now?: () => number;
}

type ToolCall = { id: string; name: string; input: unknown };
type ToolCallResult = { toolUseId: string; content: string; isError: boolean };

export function createAgentRunner(deps: AgentRunnerDeps): AgentRunner {
  const now = deps.now ?? Date.now;
  const allowlist = createAllowlist();

  return {
    async run(
      task: AgentTask,
      onEvent: (e: AgentEvent) => void,
      signal?: AbortSignal,
    ): Promise<AgentRunResult> {
      const maxTurns = task.maxTurns ?? DEFAULT_MAX_TURNS;
      const toolSpecs = deps.tools.list().map((t) => t.spec);

      const messages: ChatMessage[] = [
        ...task.history,
        { role: "user", content: [{ type: "text", text: task.prompt }] },
      ];
      let prevLen = task.history.length;

      // R1.1
      let decision = await deps.router.route(buildRoutingInput(task, messages));
      onEvent({ type: "routing_decision", decision, kind: task.kind });
      let model = deps.modelForTier(decision.tier);

      const tracker = createSignalTracker({
        toolErrorStreak: deps.config.routing.escalation.toolErrorStreak,
      });

      let totalUsage: TokenUsage = ZERO_USAGE;
      let totalCost = 0;
      let lastBudgetLevel: BudgetState["level"] = "ok";

      for (let turn = 1; turn <= maxTurns; turn++) {
        // R7.3 (pre-iteration abort check)
        if (signal?.aborted) {
          return {
            finalText: "",
            history: messages,
            usage: totalUsage,
            costUsd: totalCost,
            stopReason: "aborted",
          };
        }

        // R7.1, R7.2
        const budget = await deps.budgetState();
        if (budget.level !== lastBudgetLevel) {
          if (budget.level === "warn" || budget.level === "exceeded") {
            onEvent({ type: "budget_alert", state: budget });
          }
          lastBudgetLevel = budget.level;
        }
        if (budget.level === "exceeded" && deps.config.budgets.hardStop) {
          return {
            finalText: "",
            history: messages,
            usage: totalUsage,
            costUsd: totalCost,
            stopReason: "budget_stop",
          };
        }

        // R2.1, R2.3
        const req = assemble(task.system, messages, toolSpecs, prevLen);
        prevLen = messages.length;

        onEvent({ type: "model_call_started", model: decision.model, tier: decision.tier });
        const t0 = now();

        let text = "";
        const toolUses: ToolCall[] = [];
        let usage: TokenUsage = ZERO_USAGE;
        let stopReason: StopReason = "end_turn";

        try {
          for await (const ev of model.stream(req, signal)) {
            switch (ev.type) {
              case "text_delta":
                text += ev.text;
                onEvent({ type: "text_delta", text: ev.text });
                break;
              case "thinking_delta":
                onEvent({ type: "thinking_delta", text: ev.text });
                break;
              case "tool_use":
                toolUses.push({ id: ev.id, name: ev.name, input: ev.input });
                break;
              case "usage":
                usage = ev.usage;
                break;
              case "done":
                stopReason = ev.stopReason;
                break;
            }
          }
        } catch (err) {
          // R7.3 (mid-stream abort)
          if (signal?.aborted) {
            return {
              finalText: text,
              history: messages,
              usage: totalUsage,
              costUsd: totalCost,
              stopReason: "aborted",
            };
          }
          throw err;
        }

        const pricing = pricingFor(decision.model.provider, decision.model.model);
        const costUsd = pricing ? computeCostUsd(usage, pricing) : null;
        const durationMs = now() - t0;
        onEvent({
          type: "model_call_finished",
          model: decision.model,
          usage,
          costUsd,
          stopReason,
          durationMs,
        });
        totalUsage = addUsage(totalUsage, usage);
        totalCost += costUsd ?? 0;

        // R2.2
        messages.push(buildAssistantMessage(text, toolUses));

        // R1.3, R1.5
        if (stopReason === "end_turn" || stopReason === "max_tokens" || stopReason === "refusal") {
          onEvent({ type: "agent_message", text });
          onEvent({ type: "turn_done", usage: totalUsage, costUsd: totalCost });
          return { finalText: text, history: messages, usage: totalUsage, costUsd: totalCost, stopReason };
        }

        // stopReason === "tool_use": R1.2, R1.6, R5.*, R6.*
        const results: ToolCallResult[] = [];
        for (const call of toolUses) {
          const result = await executeOneCall(call, {
            tools: deps.tools,
            mode: deps.permissionMode,
            allowlist,
            cwd: task.cwd,
            sessionId: task.sessionId,
            onEvent,
            preToolUse: deps.preToolUse,
            postToolUse: deps.postToolUse,
            requestPermission: deps.requestPermission,
            signal,
          });
          results.push(result);
          tracker.record(call, result); // R4.1, R4.2
        }
        messages.push(buildToolResultMessage(results));

        // R4.3
        if (deps.config.routing.escalation.enabled) {
          const signals = tracker.drainNew();
          if (signals.length > 0) {
            const nextInput = buildRoutingInput(task, messages);
            const next = await deps.router.reconsider(decision, nextInput, signals);
            if (next) {
              onEvent({ type: "escalation", from: decision.tier, to: next.tier, reasons: next.reasons });
              decision = next;
              model = deps.modelForTier(next.tier);
              onEvent({ type: "routing_decision", decision: next, kind: task.kind });
            }
          }
        }
      }

      // R1.4
      return {
        finalText: "",
        history: messages,
        usage: totalUsage,
        costUsd: totalCost,
        stopReason: "max_turns",
      };
    },
  };
}

/**
 * R1.1: builds a RoutingInput from the task; contextTokens is chars/4 over
 * system + the current messages array. Called once up front (messages =
 * history + the fresh prompt, equivalent to "system+history+prompt") and
 * again on each R4.3 reconsider (messages has grown since, giving a fresh
 * estimate rather than a stale one).
 */
function buildRoutingInput(task: AgentTask, messages: ChatMessage[]): RoutingInput {
  return {
    kind: task.kind,
    text: task.prompt,
    complexityHint: task.complexityHint,
    contextTokens: estimateContextTokens(task.system, messages),
    userOverrideTier: task.userOverrideTier,
    sessionId: task.sessionId,
    specName: task.specName,
    taskId: task.taskId,
  };
}

function estimateContextTokens(system: string, messages: ChatMessage[]): number {
  const chars = system.length + messages.reduce((sum, m) => sum + messageChars(m), 0);
  return Math.ceil(chars / 4);
}

function messageChars(m: ChatMessage): number {
  return m.content.reduce((sum, block) => {
    if (block.type === "text") return sum + block.text.length;
    if (block.type === "tool_use") {
      return sum + block.name.length + safeJsonLength(block.input);
    }
    return sum + block.content.length; // tool_result
  }, 0);
}

function safeJsonLength(v: unknown): number {
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return 0;
  }
}

interface ExecOpts {
  tools: ToolRegistry;
  mode: PermissionMode;
  allowlist: Allowlist;
  cwd: string;
  sessionId: string;
  onEvent: (e: AgentEvent) => void;
  preToolUse?: (p: HookPayload) => Promise<HookOutcome[]>;
  postToolUse?: (p: HookPayload) => Promise<HookOutcome[]>;
  requestPermission: (req: PermissionRequest) => Promise<PermissionDecision>;
  signal?: AbortSignal;
}

// R3.1, R3.3: brackets the tool's full handling (hooks + permission + exec).
async function executeOneCall(call: ToolCall, opts: ExecOpts): Promise<ToolCallResult> {
  const summary = `${call.name}: ${inputPreview(call.input)}`;
  opts.onEvent({ type: "tool_call_started", id: call.id, name: call.name, summary });

  const result = await runOneCall(call, opts);

  opts.onEvent({
    type: "tool_call_finished",
    id: call.id,
    name: call.name,
    isError: result.isError,
    resultPreview: resultPreview(result.content),
  });

  return { toolUseId: call.id, content: result.content, isError: result.isError };
}

async function runOneCall(call: ToolCall, opts: ExecOpts): Promise<ToolResult> {
  const tool = opts.tools.get(call.name);
  if (!tool) {
    // R1.6
    const names = opts.tools.list().map((t) => t.spec.name).join(", ") || "(none registered)";
    return { content: `unknown tool "${call.name}" — available tools: ${names}`, isError: true };
  }

  // R5.1
  if (opts.preToolUse) {
    const outcomes = await opts.preToolUse({
      event: "PreToolUse",
      sessionId: opts.sessionId,
      cwd: opts.cwd,
      data: { tool: call.name, input: call.input },
    });
    const blocked = outcomes.find((o) => o.action === "block");
    if (blocked) {
      return { content: blocked.stderr ?? `blocked by hook: ${blocked.hook}`, isError: true };
    }
  }

  // R6.1-R6.4
  const gate = await gatePermission(tool, call, opts);
  if (gate.decision === "deny") {
    return { content: gate.message, isError: true };
  }

  const ctx: ToolContext = {
    cwd: opts.cwd,
    sessionId: opts.sessionId,
    signal: opts.signal,
    requestPermission: opts.requestPermission,
    emit: opts.onEvent,
  };
  let result = await tool.execute(call.input, ctx);

  // R5.2
  if (opts.postToolUse) {
    const outcomes = await opts.postToolUse({
      event: "PostToolUse",
      sessionId: opts.sessionId,
      cwd: opts.cwd,
      data: { tool: call.name, input: call.input, result },
    });
    const blocked = outcomes.find((o) => o.action === "block");
    if (blocked) {
      result = { ...result, content: `${result.content}\n[hook] ${blocked.stderr ?? ""}` };
    }
  }

  return result;
}

async function gatePermission(
  tool: Tool,
  call: ToolCall,
  opts: ExecOpts,
): Promise<{ decision: "allow" } | { decision: "deny"; message: string }> {
  const req = tool.permissionFor(call.input, opts.mode);
  if (!req) return { decision: "allow" };

  // R6.4
  if (opts.mode === "plan") {
    return { decision: "deny", message: "denied: plan mode" };
  }

  // R6.3
  const key = permissionKey(call.name, call.input);
  if (opts.allowlist.has(opts.sessionId, key)) {
    return { decision: "allow" };
  }

  // R6.1
  opts.onEvent({ type: "permission_request", request: req });
  const decision = await opts.requestPermission(req);
  if (decision === "deny") {
    // R6.2
    return { decision: "deny", message: `user denied: ${req.summary}` };
  }
  if (decision === "allowAlways") {
    opts.allowlist.remember(opts.sessionId, key);
  }
  return { decision: "allow" };
}
