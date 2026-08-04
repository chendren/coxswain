/**
 * CXOS composition root — wires adapters + workspace under graph-node practice.
 */
import { join } from "node:path";
import type { ChatModel, Tier } from "@cox/core";
import {
  DEFAULT_ONTOLOGY,
  LOCAL_PLATFORM_ONTOLOGY,
  type CxOntology,
  type CxTargetAdapter,
  type CxTargetId,
} from "@cox/cx-core";
import {
  createOfflineArtifactsAdapter,
  createOfflineAwsAdapter,
  createOfflineLocalAdapter,
  defaultCxRoot,
  type OrchestratorAdapters,
  type CxWorkspaceDeps,
} from "@cox/cx-ops";

export type CxRuntimeMode = "offline" | "live";

export interface CxRuntime {
  mode: CxRuntimeMode;
  cwd: string;
  workspace: CxWorkspaceDeps;
  ontology: CxOntology;
  adapters: OrchestratorAdapters;
  generate?: (prompt: string, tier: Tier) => Promise<string>;
}

export interface CxRuntimeOpts {
  cwd: string;
  mode?: CxRuntimeMode;
  pack?: "default" | "local";
  /** Optional live model factory (from loadDeps.tierModel). */
  tierModel?: (tier: Tier) => ChatModel;
  /** Platform URL for live local adapter (future). Offline ignores. */
  localBaseUrl?: string;
  now?: () => string;
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
      "You are Coxswain CXOS. Respond with JSON only when asked. Stay inside closed ontology ids.",
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    tools: [],
    maxTokens: 2048,
  })) {
    if (event.type === "text_delta") text += event.text;
  }
  return text;
}

export function createCxRuntime(opts: CxRuntimeOpts): CxRuntime {
  const mode = opts.mode ?? "offline";
  const now = opts.now ?? (() => new Date().toISOString());
  const cxRoot = defaultCxRoot(opts.cwd);
  const ontology =
    opts.pack === "default" ? DEFAULT_ONTOLOGY : LOCAL_PLATFORM_ONTOLOGY;

  const generate = opts.tierModel
    ? (prompt: string, tier: Tier) => generateFromModel(opts.tierModel!, prompt, tier)
    : undefined;

  const workspace: CxWorkspaceDeps = { cxRoot, now };

  // Offline composition: deterministic strong-graph adapters (full loop on disk).
  // Live mode currently uses the same offline adapters for local/aws until
  // platform/AWS credentials are wired; artifacts remain offline-deterministic
  // unless generate is provided (then still seed-based for reliability).
  const adapters: OrchestratorAdapters = {
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
  };

  // Live mode note: when localBaseUrl is set we still use offline local until
  // createLocalAdapter is wired with real HTTP in a follow-up. Structure is ready.
  void mode;
  void opts.localBaseUrl;

  return {
    mode,
    cwd: opts.cwd,
    workspace,
    ontology,
    adapters,
    generate,
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
