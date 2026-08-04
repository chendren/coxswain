/**
 * CXOS composition root — graph-node practice:
 *   load_config → probe_platform → route_adapters → (live|offline) → emit
 *
 * Strong adapters always win when healthy; weak LLM generate is optional
 * and only used inside designated build nodes.
 */
import { join } from "node:path";
import type { ChatModel, CoxConfig, Tier } from "@cox/core";
import { loadConfig } from "@cox/core";
import { createArtifactsAdapter } from "@cox/cx-artifacts";
import { createAwsAdapter } from "@cox/cx-aws";
import {
  DEFAULT_ONTOLOGY,
  LOCAL_PLATFORM_ONTOLOGY,
  type CxOntology,
  type CxTargetAdapter,
  type CxTargetId,
} from "@cox/cx-core";
import { createLocalAdapter } from "@cox/cx-local";
import {
  createOfflineArtifactsAdapter,
  createOfflineAwsAdapter,
  createOfflineLocalAdapter,
  defaultCxRoot,
  extractJsonText,
  type OrchestratorAdapters,
  type CxWorkspaceDeps,
} from "@cox/cx-ops";

export type CxRuntimeMode = "offline" | "live" | "hybrid";

export interface CxRuntime {
  mode: CxRuntimeMode;
  cwd: string;
  workspace: CxWorkspaceDeps;
  ontology: CxOntology;
  adapters: OrchestratorAdapters;
  generate?: (prompt: string, tier: Tier) => Promise<string>;
  /** How each target was wired (for doctor / path audit). */
  wiring: Record<CxTargetId, "live" | "offline">;
  path: string[];
  localBaseUrl?: string;
  platformHealthy: boolean;
}

export interface CxRuntimeOpts {
  cwd: string;
  /** offline = always deterministic; live = prefer real adapters; hybrid = auto. */
  mode?: CxRuntimeMode;
  pack?: "default" | "local";
  tierModel?: (tier: Tier) => ChatModel;
  localBaseUrl?: string;
  config?: CoxConfig;
  now?: () => string;
  /** Skip network probe (tests). */
  skipProbe?: boolean;
}

/** Stream a ChatModel to a single string (weak-node generation). */
export async function generateFromModel(
  tierModel: (tier: Tier) => ChatModel,
  prompt: string,
  tier: Tier,
): Promise<string> {
  const model = tierModel(tier);
  let text = "";
  for await (const event of model.stream({
    system:
      "You are Coxswain CXOS. Respond with JSON only when asked. Stay inside closed ontology ids. No markdown fences.",
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    tools: [],
    maxTokens: 2048,
  })) {
    if (event.type === "text_delta") text += event.text;
  }
  return extractJsonText(text);
}

/**
 * Deterministic weak-node stubs for live local when no ChatModel is wired.
 * Returns closed-world journey/KPI JSON the local adapter can parse.
 */
export function deterministicLocalGenerate(prompt: string): string {
  const lower = prompt.toLowerCase();
  // KPI frame generation (check before journey — prompts mention journey types too)
  if (
    lower.includes("kpi") ||
    lower.includes("metric") ||
    lower.includes('"metrics"') ||
    lower.includes("sla_compliance")
  ) {
    return JSON.stringify({
      metrics: [
        { name: "total_contacts", target: 100, unit: "count" },
        { name: "sla_compliance_rate", target: 92, unit: "percent" },
        { name: "avg_wait_time", target: 45, unit: "seconds" },
        { name: "deflection_rate", target: 35, unit: "percent" },
      ],
    });
  }
  if (
    lower.includes("journey type") ||
    lower.includes("best match") ||
    lower.includes("journeytype")
  ) {
    if (prompt.includes("billing_dispute")) {
      return JSON.stringify({ journeyType: "billing_dispute" });
    }
    return JSON.stringify({ journeyType: "billing_dispute" });
  }
  // Safe default for unexpected prompts
  return JSON.stringify({
    metrics: [{ name: "total_contacts", target: 100, unit: "count" }],
  });
}

export async function probeLocalPlatform(baseUrl: string, timeoutMs = 2500): Promise<boolean> {
  const root = baseUrl.replace(/\/$/, "");
  // Prefer journey definitions: /api/health/ready returns 503 when ollama is
  // down even though the CX API and SQLite fabric are usable.
  const paths = ["/api/journeys/definitions", "/api/health", "/api/health/ready"];
  for (const p of paths) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${root}${p}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.status >= 200 && res.status < 300) return true;
      // 503 from ready endpoint: still up if body says pipeline ok
      if (res.status === 503 && p.includes("ready")) {
        try {
          const body = (await res.json()) as { checks?: { pipeline?: boolean } };
          if (body.checks?.pipeline) return true;
        } catch {
          /* ignore */
        }
      }
    } catch {
      // try next path
    }
  }
  return false;
}

function resolveLocalBaseUrl(opts: CxRuntimeOpts, cfg: CoxConfig): string {
  return (
    opts.localBaseUrl ??
    cfg.cx.targets.local?.baseUrl ??
    process.env.CX_LOCAL_BASE_URL ??
    "http://127.0.0.1:3143"
  );
}

/**
 * Build the CXOS runtime. Prefers live adapters when generate + platform allow.
 */
export async function createCxRuntime(opts: CxRuntimeOpts): Promise<CxRuntime> {
  const path: string[] = ["load_config"];
  const cfg = opts.config ?? loadConfig(opts.cwd);
  const now = opts.now ?? (() => new Date().toISOString());
  const cxRoot = defaultCxRoot(opts.cwd);
  const mode: CxRuntimeMode = opts.mode ?? (opts.tierModel ? "hybrid" : "offline");
  const pack = opts.pack ?? "local";
  const ontology = pack === "default" ? DEFAULT_ONTOLOGY : LOCAL_PLATFORM_ONTOLOGY;
  const workspace: CxWorkspaceDeps = { cxRoot, now };

  const generate = opts.tierModel
    ? (prompt: string, tier: Tier) => generateFromModel(opts.tierModel!, prompt, tier)
    : undefined;

  path.push(generate ? "weak_generate_ready" : "weak_generate_absent");

  const localBaseUrl = resolveLocalBaseUrl(opts, cfg);
  let platformHealthy = false;
  if (!opts.skipProbe && mode !== "offline") {
    path.push("probe_platform");
    platformHealthy = await probeLocalPlatform(localBaseUrl);
    path.push(platformHealthy ? "platform_healthy" : "platform_down");
  } else {
    path.push("probe_skipped");
  }

  const wantLive = mode === "live" || mode === "hybrid";
  // Only treat models as live when the configured primary scout provider key exists.
  // Presence of unrelated keys (e.g. XAI only) still fails anthropic-backed tiers.
  const anthropicKey = process.env[cfg.providers.anthropic.apiKeyEnv];
  const modelLive = Boolean(generate) && Boolean(anthropicKey && anthropicKey.length > 0);
  path.push(modelLive ? "model_keys_present" : "model_keys_absent");

  const wiring: Record<CxTargetId, "live" | "offline"> = {
    artifacts: "offline",
    local: "offline",
    aws: "offline",
  };

  // ── artifacts ──────────────────────────────────────────────
  path.push("route:artifacts");
  let artifacts: CxTargetAdapter;
  if (wantLive && modelLive && generate) {
    path.push("wire:artifacts:live");
    wiring.artifacts = "live";
    artifacts = createArtifactsAdapter({
      cxRoot,
      now,
      generate,
      ontology: DEFAULT_ONTOLOGY,
      absorbWeak: true,
    });
  } else {
    path.push("wire:artifacts:offline");
    artifacts = createOfflineArtifactsAdapter({
      cxRoot,
      now,
      generate: modelLive ? generate : undefined,
      ontology: DEFAULT_ONTOLOGY,
    });
  }

  // ── local ──────────────────────────────────────────────────
  // Live platform does not require an LLM: deterministic graph-bound
  // generate stubs journey/KPI JSON when tierModel is absent.
  path.push("route:local");
  let local: CxTargetAdapter;
  if (wantLive && platformHealthy) {
    // Prefer deterministic local generate unless we have working model keys —
    // live platform bind must not depend on Anthropic for journey match/KPIs.
    path.push(modelLive ? "wire:local:live" : "wire:local:live_deterministic");
    wiring.local = "live";
    const localGenerate = modelLive && generate
      ? generate
      : async (prompt: string, _tier: Tier) => deterministicLocalGenerate(prompt);
    local = createLocalAdapter({
      cxRoot,
      now,
      generate: localGenerate,
      baseUrl: localBaseUrl,
      randomFn: Math.random,
    });
  } else {
    path.push("wire:local:offline");
    local = createOfflineLocalAdapter({
      cxRoot,
      now,
      generate,
      ontology: LOCAL_PLATFORM_ONTOLOGY,
    });
  }

  // ── aws (plan-only live when model keys present) ───────────
  path.push("route:aws");
  let aws: CxTargetAdapter;
  if (wantLive && modelLive && generate) {
    path.push("wire:aws:live_plan_only");
    wiring.aws = "live";
    aws = createAwsAdapter({
      cxRoot,
      now,
      generate,
    });
  } else {
    path.push("wire:aws:offline");
    aws = createOfflineAwsAdapter({
      cxRoot,
      now,
      generate: modelLive ? generate : undefined,
      ontology: DEFAULT_ONTOLOGY,
    });
  }

  path.push("emit");

  return {
    mode,
    cwd: opts.cwd,
    workspace,
    ontology,
    adapters: { artifacts, local, aws },
    generate,
    wiring,
    path,
    localBaseUrl,
    platformHealthy,
  };
}

/** Sync offline-only factory for tests that cannot await. */
export function createOfflineCxRuntime(opts: Omit<CxRuntimeOpts, "mode">): CxRuntime {
  const now = opts.now ?? (() => new Date().toISOString());
  const cxRoot = defaultCxRoot(opts.cwd);
  const pack = opts.pack ?? "local";
  const ontology = pack === "default" ? DEFAULT_ONTOLOGY : LOCAL_PLATFORM_ONTOLOGY;
  const generate = opts.tierModel
    ? (prompt: string, tier: Tier) => generateFromModel(opts.tierModel!, prompt, tier)
    : undefined;

  return {
    mode: "offline",
    cwd: opts.cwd,
    workspace: { cxRoot, now },
    ontology,
    adapters: {
      artifacts: createOfflineArtifactsAdapter({
        cxRoot,
        now,
        generate,
        ontology: DEFAULT_ONTOLOGY,
      }),
      local: createOfflineLocalAdapter({
        cxRoot,
        now,
        generate,
        ontology: LOCAL_PLATFORM_ONTOLOGY,
      }),
      aws: createOfflineAwsAdapter({
        cxRoot,
        now,
        generate,
        ontology: DEFAULT_ONTOLOGY,
      }),
    },
    generate,
    wiring: { artifacts: "offline", local: "offline", aws: "offline" },
    path: ["load_config", "force_offline", "emit"],
    platformHealthy: false,
  };
}

export function requireAdapter(
  adapters: OrchestratorAdapters,
  id: CxTargetId,
): CxTargetAdapter {
  const a = adapters[id];
  if (!a) throw new Error(`adapter "${id}" not wired`);
  return a;
}

export function runtimeCxRoot(cwd: string): string {
  return join(defaultCxRoot(cwd));
}
