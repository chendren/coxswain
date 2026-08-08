/**
 * Seed open proposals for operate drills (demo never starts with empty queue).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CxTargetId } from "@cox/cx-core";
import type { CxProposal, ProposalStoreDeps } from "./proposals";
import { loadProposals } from "./proposals";

export interface SeedOperateOpts {
  force?: boolean;
  now?: string;
}

/** Deterministic seed proposals for a telco / CSP operate drill. */
export async function seedOperateDrill(
  deps: ProposalStoreDeps,
  specName: string,
  opts?: SeedOperateOpts,
): Promise<{ path: string[]; added: CxProposal[]; skipped: number }> {
  const path = ["load_proposals", "seed_operate_drill", "persist", "emit"];
  const existing = await loadProposals(deps, specName);
  const open = existing.filter((p) => p.status === "open" || p.status === "claimed");
  if (open.length > 0 && !opts?.force) {
    return { path, added: [], skipped: open.length };
  }

  const now = opts?.now ?? deps.now();
  const stamp = now.replace(/[^0-9]/g, "").slice(0, 14);
  const seeds: Omit<CxProposal, "id">[] = [
    {
      specName,
      targetId: "local" as CxTargetId,
      kind: "investigate",
      summary: "Local journey health degraded — billing_dispute stage under_review elevated AHT",
      nbaAction: "investigate_billing_queue",
      nbaRuleId: "SEED_BILLING_AHT",
      status: "open",
      createdAt: now,
      updatedAt: now,
      path: ["seed_operate", "billing"],
    },
    {
      specName,
      targetId: "local" as CxTargetId,
      kind: "remediate",
      summary: "Churn-risk spike: cancel_requested volume above threshold — review save offers",
      nbaAction: "retention_offer_review",
      nbaRuleId: "SEED_CHURN_SPIKE",
      status: "open",
      createdAt: now,
      updatedAt: now,
      path: ["seed_operate", "churn"],
    },
    {
      specName,
      targetId: "artifacts" as CxTargetId,
      kind: "investigate",
      summary: "Technical troubleshooting journey: diagnose path may need NOC handoff playbook",
      nbaAction: "refresh_noc_runbook",
      nbaRuleId: "SEED_TECH_NOC",
      status: "open",
      createdAt: now,
      updatedAt: now,
      path: ["seed_operate", "tech"],
    },
  ];

  const added: CxProposal[] = seeds.map((s, i) => ({
    ...s,
    id: `prop_seed_${stamp}_${i}`,
  }));

  const all = opts?.force
    ? [...existing.filter((p) => p.status === "resolved" || p.status === "dismissed"), ...added]
    : [...existing, ...added];

  await mkdir(join(deps.cxRoot, specName), { recursive: true });
  await writeFile(
    join(deps.cxRoot, specName, "proposals.json"),
    JSON.stringify({ proposals: all, updatedAt: now }, null, 2),
    "utf8",
  );
  return { path, added, skipped: 0 };
}
