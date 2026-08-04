/**
 * Console-mode scaffold (graph-node practice).
 *
 * Design non-goals for full autonomous watchers still apply (no appendTask).
 * This module implements one **commands+console tick**:
 *   load_strong → poll_status → intent_route → recommend_nba → propose (not mutate) → emit
 *
 * Proposals are structured, human-gated work items — never live mutations.
 */
import type {
  CxDeployment,
  CxHealth,
  CxOntology,
  CxTargetAdapter,
  CxTargetId,
} from "@cox/cx-core";
import { DEFAULT_ONTOLOGY, recommendNba, type CxNbaContext } from "@cox/cx-core";
import { getStatus } from "./status";

export type ConsoleProposalKind = "remediate" | "investigate" | "scale" | "none";

export interface ConsoleProposal {
  targetId: CxTargetId;
  kind: ConsoleProposalKind;
  summary: string;
  nba?: ReturnType<typeof recommendNba>;
  health?: CxHealth;
  /** Graph control path for this proposal. */
  path: string[];
}

export interface ConsoleTickResult {
  path: string[];
  proposals: ConsoleProposal[];
  polledAt: string;
}

export interface ConsoleTarget {
  targetId: CxTargetId;
  adapter: CxTargetAdapter;
  dep: CxDeployment;
  /** Optional journey context for NBA matching. */
  nbaContext?: CxNbaContext;
}

export interface ConsoleTickDeps {
  ontology?: CxOntology;
  now?: () => string;
}

/**
 * One console poll cycle. Zero mutations. Zero model calls.
 * Intent router: degraded/down → investigate+NBA; healthy → none.
 */
export async function runConsoleTick(
  targets: ConsoleTarget[],
  deps: ConsoleTickDeps = {},
): Promise<ConsoleTickResult> {
  const ontology = deps.ontology ?? DEFAULT_ONTOLOGY;
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const path = ["load_strong", "poll_status"];
  const proposals: ConsoleProposal[] = [];

  for (const t of targets) {
    const ppath = [`target:${t.targetId}`];
    try {
      const health = await getStatus(t.adapter, t.dep);
      ppath.push(`health:${health.level}`);

      if (health.level === "healthy") {
        ppath.push("route:none", "emit");
        proposals.push({
          targetId: t.targetId,
          kind: "none",
          summary: `${t.targetId} healthy — no action`,
          health,
          path: ppath,
        });
        continue;
      }

      // Intent router: degraded → investigate; down → remediate
      const kind: ConsoleProposalKind =
        health.level === "down" ? "remediate" : "investigate";
      ppath.push(`route:${kind}`);

      const ctx: CxNbaContext = {
        journey: t.nbaContext?.journey ?? "billing_dispute",
        stage: t.nbaContext?.stage ?? (health.level === "down" ? "escalated" : "under_review"),
        confidence: t.nbaContext?.confidence ?? (health.level === "down" ? 0.9 : 0.6),
        ...t.nbaContext,
      };
      ppath.push("recommend_nba");
      const nba = recommendNba(ontology, ctx);
      ppath.push("propose_gated", "emit");

      const primary = nba.primary;
      proposals.push({
        targetId: t.targetId,
        kind,
        summary: primary
          ? `${t.targetId} is ${health.level}: propose ${primary.action} (${primary.id}) — human gate required`
          : `${t.targetId} is ${health.level}: no NBA rule matched — human investigation required`,
        nba,
        health,
        path: ppath,
      });
    } catch (e) {
      ppath.push("fail", "route:investigate", "emit");
      proposals.push({
        targetId: t.targetId,
        kind: "investigate",
        summary: `${t.targetId} status error: ${e instanceof Error ? e.message : String(e)}`,
        path: ppath,
      });
    }
  }

  path.push("emit");
  return { path, proposals, polledAt: now };
}
