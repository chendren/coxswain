import type { CxArtifact } from "../artifacts";
import type { CxOntology } from "./types";
import { buildStrongGraph, type CxStrongGraph } from "./graph";
import {
  absorbIntentTaxonomy,
  absorbKpiFrame,
  resolveArtifactAgainstGraph,
  type ResolveReport,
} from "./resolve";
import { validateArtifact } from "./validate";
import { matchNbaRules } from "./evaluate";
import type { CxNbaContext, CxNbaRule } from "./types";

/**
 * Graph-of-nodes agent control flow for closed-world CXOS builds.
 *
 * Mirrors 2026 practice:
 * - Strong nodes: ontology catalog (deterministic)
 * - Weak nodes: model JSON (bounded generation)
 * - Resolve: hub-key identity absorption
 * - Intent router: which closed sets apply per artifact kind
 * - Bounded reflection: re-generate only when closed-set validation fails
 * - Failure-aware routing: hard fail vs absorb vs retry
 */

export type PipelineNodeId =
  | "load_strong"
  | "route_kind"
  | "generate_weak"
  | "parse_weak"
  | "resolve_identity"
  | "validate_closed_world"
  | "absorb"
  | "recommend_nba"
  | "emit"
  | "fail";

export interface PipelineState {
  ontology: CxOntology;
  graph: CxStrongGraph;
  kind?: CxArtifact["kind"];
  raw?: string;
  artifact?: CxArtifact;
  resolve?: ResolveReport;
  nba?: CxNbaRule[];
  attempts: number;
  maxAttempts: number;
  path: PipelineNodeId[];
  errors: string[];
  done: boolean;
  ok: boolean;
}

export interface PipelineHooks {
  /** Phase 2 weak extraction: model call. */
  generateWeak?: (ctx: {
    kind: CxArtifact["kind"];
    ontology: CxOntology;
    graph: CxStrongGraph;
    attempt: number;
    feedback?: string;
  }) => Promise<string>;
  /** Parse raw JSON into artifact (caller supplies adapter parse). */
  parseWeak?: (kind: CxArtifact["kind"], raw: string) => CxArtifact;
  /** Optional NBA context after absorb. */
  nbaContext?: CxNbaContext;
}

export interface PipelineResult {
  state: PipelineState;
  artifact?: CxArtifact;
  nba?: CxNbaRule[];
}

function transition(state: PipelineState, node: PipelineNodeId): PipelineState {
  return { ...state, path: [...state.path, node] };
}

/**
 * Intent router: which strong kinds must resolve for this artifact.
 * Journey maps stay free-form at design time (soft resolve only);
 * intent taxonomy and KPI frames are hard closed-world.
 */
export function routeClosedKinds(kind: CxArtifact["kind"]): Array<
  "domain" | "intent" | "kpi" | "journey" | "none"
> {
  switch (kind) {
    case "intentTaxonomy":
      return ["domain", "intent"];
    case "kpiFrame":
      return ["kpi"];
    case "journeyMap":
      return ["none"];
    default:
      return ["none"];
  }
}

/**
 * Run the deterministic pipeline over an already-parsed artifact
 * (no model call). Used for offline proof and post-parse validation.
 */
export function runClosedWorldPass(
  ontology: CxOntology,
  artifact: CxArtifact,
  opts?: { absorb?: boolean; nbaContext?: CxNbaContext },
): PipelineResult {
  let state: PipelineState = {
    ontology,
    graph: buildStrongGraph(ontology),
    kind: artifact.kind,
    artifact,
    attempts: 1,
    maxAttempts: 1,
    path: [],
    errors: [],
    done: false,
    ok: false,
  };
  state = transition(state, "load_strong");
  state = transition(state, "route_kind");
  state = transition(state, "parse_weak");
  state.artifact = artifact;

  const report = resolveArtifactAgainstGraph(state.graph, artifact);
  state = transition(state, "resolve_identity");
  state.resolve = report;

  const validation = validateArtifact(ontology, artifact);
  state = transition(state, "validate_closed_world");

  const mustClose = routeClosedKinds(artifact.kind);
  const requiresClosed = !mustClose.includes("none");

  if (requiresClosed && (report.rejected > 0 || !validation.ok)) {
    if (opts?.absorb) {
      state = transition(state, "absorb");
      if (artifact.kind === "kpiFrame") {
        state.artifact = absorbKpiFrame(state.graph, artifact);
        if (
          artifact.metrics.length > 0 &&
          state.artifact.kind === "kpiFrame" &&
          state.artifact.metrics.length === 0
        ) {
          state = transition(state, "fail");
          state.errors.push("absorb removed all KPI metrics; none mapped to strong ontology ids");
          state.done = true;
          state.ok = false;
          return { state, artifact: state.artifact };
        }
      } else if (artifact.kind === "intentTaxonomy") {
        state.artifact = absorbIntentTaxonomy(state.graph, artifact);
        if (
          artifact.domains.length > 0 &&
          state.artifact.kind === "intentTaxonomy" &&
          state.artifact.domains.length === 0
        ) {
          state = transition(state, "fail");
          state.errors.push("absorb removed all intent domains; none mapped to strong ontology ids");
          state.done = true;
          state.ok = false;
          return { state, artifact: state.artifact };
        }
      }
      // re-validate absorbed form
      const again = validateArtifact(ontology, state.artifact!);
      const againResolve = resolveArtifactAgainstGraph(state.graph, state.artifact!);
      state.resolve = againResolve;
      if (!again.ok || againResolve.rejected > 0) {
        state = transition(state, "fail");
        state.errors.push(
          ...again.issues.map((i) => i.message),
          ...againResolve.issues.map((i) => i.message),
        );
        state.done = true;
        state.ok = false;
        return { state, artifact: state.artifact };
      }
    } else {
      state = transition(state, "fail");
      state.errors.push(
        ...validation.issues.map((i) => i.message),
        ...report.issues.map((i) => i.message),
      );
      state.done = true;
      state.ok = false;
      return { state, artifact };
    }
  } else if (opts?.absorb && (artifact.kind === "kpiFrame" || artifact.kind === "intentTaxonomy")) {
    state = transition(state, "absorb");
    if (artifact.kind === "kpiFrame") {
      state.artifact = absorbKpiFrame(state.graph, artifact);
    } else {
      state.artifact = absorbIntentTaxonomy(state.graph, artifact);
    }
  }

  if (opts?.nbaContext) {
    state = transition(state, "recommend_nba");
    state.nba = matchNbaRules(ontology, opts.nbaContext);
  }

  state = transition(state, "emit");
  state.done = true;
  state.ok = true;
  return { state, artifact: state.artifact, nba: state.nba };
}

/**
 * Full graph-node loop with optional weak generation and bounded retries.
 * Generate/parse hooks are required when `seedArtifact` is omitted.
 */
export async function runGraphNodePipeline(opts: {
  ontology: CxOntology;
  kind: CxArtifact["kind"];
  hooks: PipelineHooks;
  seedArtifact?: CxArtifact;
  maxAttempts?: number;
  absorb?: boolean;
}): Promise<PipelineResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const graph = buildStrongGraph(opts.ontology);
  let state: PipelineState = {
    ontology: opts.ontology,
    graph,
    kind: opts.kind,
    attempts: 0,
    maxAttempts,
    path: ["load_strong", "route_kind"],
    errors: [],
    done: false,
    ok: false,
  };

  let feedback: string | undefined;
  while (state.attempts < maxAttempts) {
    state.attempts += 1;
    let artifact = opts.seedArtifact;

    if (!artifact) {
      state = transition(state, "generate_weak");
      if (!opts.hooks.generateWeak || !opts.hooks.parseWeak) {
        state = transition(state, "fail");
        state.errors.push("generateWeak and parseWeak hooks required without seedArtifact");
        state.done = true;
        return { state };
      }
      const raw = await opts.hooks.generateWeak({
        kind: opts.kind,
        ontology: opts.ontology,
        graph,
        attempt: state.attempts,
        feedback,
      });
      state.raw = raw;
      state = transition(state, "parse_weak");
      try {
        artifact = opts.hooks.parseWeak(opts.kind, raw);
      } catch (e) {
        feedback = e instanceof Error ? e.message : String(e);
        state.errors.push(feedback);
        continue;
      }
    }

    const pass = runClosedWorldPass(opts.ontology, artifact, {
      absorb: opts.absorb,
      nbaContext: opts.hooks.nbaContext,
    });
    // merge path
    state = {
      ...pass.state,
      attempts: state.attempts,
      maxAttempts,
      path: [...state.path, ...pass.state.path.filter((p) => p !== "load_strong" && p !== "route_kind")],
      errors: [...state.errors, ...pass.state.errors],
      raw: state.raw,
    };

    if (pass.state.ok) {
      return { state: { ...state, done: true, ok: true }, artifact: pass.artifact, nba: pass.nba };
    }

    feedback = pass.state.errors.join("; ");
    // only retry when we can regenerate
    if (opts.seedArtifact || !opts.hooks.generateWeak) {
      state.done = true;
      state.ok = false;
      return { state, artifact: pass.artifact };
    }
  }

  state = transition(state, "fail");
  state.done = true;
  state.ok = false;
  state.errors.push(`exhausted ${maxAttempts} attempts`);
  return { state };
}

/** Deterministic ops recommendation: pure NBA match over ontology rules. */
export function recommendNba(
  ontology: CxOntology,
  context: CxNbaContext,
): { rules: CxNbaRule[]; primary?: CxNbaRule } {
  const rules = matchNbaRules(ontology, context);
  return { rules, primary: rules[0] };
}
