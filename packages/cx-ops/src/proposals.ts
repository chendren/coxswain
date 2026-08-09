/**
 * Human-gated CX work proposals — local substitute for spec.appendTask.
 *
 * Graph path: propose → persist → list/claim → resolve
 * Never mutates adapters; console/watch only write proposals.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CxTargetId } from "@cox/cx-core";
import type { ConsoleProposal } from "./console";
import { getCxDb, isSqliteEnabled } from "./sqlite.js";

export type ProposalStatus = "open" | "claimed" | "resolved" | "dismissed";

export interface CxProposal {
  id: string;
  specName: string;
  targetId: CxTargetId;
  kind: ConsoleProposal["kind"];
  summary: string;
  nbaAction?: string;
  nbaRuleId?: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  path: string[];
  /** Operator who claimed / applied (human identity). */
  claimedBy?: string;
  claimedAt?: string;
  /** Operator who resolved or dismissed. */
  resolvedBy?: string;
  resolvedAt?: string;
  dismissedBy?: string;
}

export interface ProposalStoreDeps {
  cxRoot: string;
  now: () => string;
}

function storePath(deps: ProposalStoreDeps, specName: string): string {
  return join(deps.cxRoot, specName, "proposals.json");
}

export async function loadProposals(
  deps: ProposalStoreDeps,
  specName: string,
): Promise<CxProposal[]> {
  if (isSqliteEnabled()) {
    try {
      const db = getCxDb(deps.cxRoot);
      const rows = db
        .prepare<{ id: string; spec_name: string; target_id: string; kind: string; summary: string; nba_action: string | null; nba_rule_id: string | null; status: string; created_at: string; updated_at: string; path_json: string | null; claimed_by: string | null; claimed_at: string | null; resolved_by: string | null; resolved_at: string | null; dismissed_by: string | null }>(
          "SELECT * FROM proposals WHERE spec_name = ? ORDER BY created_at ASC",
        )
        .all(specName);
      return rows.map((r) => ({
        id: r.id,
        specName: r.spec_name,
        targetId: r.target_id as CxTargetId,
        kind: r.kind as ConsoleProposal["kind"],
        summary: r.summary,
        nbaAction: r.nba_action ?? undefined,
        nbaRuleId: r.nba_rule_id ?? undefined,
        status: r.status as ProposalStatus,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        path: r.path_json ? JSON.parse(r.path_json) : [],
        claimedBy: r.claimed_by ?? undefined,
        claimedAt: r.claimed_at ?? undefined,
        resolvedBy: r.resolved_by ?? undefined,
        resolvedAt: r.resolved_at ?? undefined,
        dismissedBy: r.dismissed_by ?? undefined,
      }));
    } catch {
      return [];
    }
  }
  try {
    const raw = await readFile(storePath(deps, specName), "utf8");
    const data = JSON.parse(raw) as { proposals?: CxProposal[] };
    return data.proposals ?? [];
  } catch {
    return [];
  }
}

async function saveProposals(
  deps: ProposalStoreDeps,
  specName: string,
  proposals: CxProposal[],
): Promise<void> {
  if (isSqliteEnabled()) {
    const db = getCxDb(deps.cxRoot);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM proposals WHERE spec_name = ?").run(specName);
      for (const p of proposals) {
        db.prepare(
          "INSERT INTO proposals (id, spec_name, target_id, kind, summary, nba_action, nba_rule_id, status, created_at, updated_at, path_json, claimed_by, claimed_at, resolved_by, resolved_at, dismissed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          p.id,
          p.specName,
          p.targetId,
          p.kind,
          p.summary,
          p.nbaAction ?? null,
          p.nbaRuleId ?? null,
          p.status,
          p.createdAt,
          p.updatedAt,
          JSON.stringify(p.path),
          p.claimedBy ?? null,
          p.claimedAt ?? null,
          p.resolvedBy ?? null,
          p.resolvedAt ?? null,
          p.dismissedBy ?? null,
        );
      }
      db.exec("COMMIT");
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      throw e;
    }
    return;
  }
  const dir = join(deps.cxRoot, specName);
  await mkdir(dir, { recursive: true });
  await writeFile(
    storePath(deps, specName),
    JSON.stringify({ proposals, updatedAt: deps.now() }, null, 2),
    "utf8",
  );
}

function proposalId(now: string, targetId: string, i: number): string {
  const stamp = now.replace(/[^0-9]/g, "").slice(0, 14);
  return `prop_${stamp}_${targetId}_${i}`;
}

/**
 * Persist new proposals from a console tick.
 * Dedupes open proposals with the same target+kind+nbaRuleId.
 */
export async function appendProposalsFromTick(
  deps: ProposalStoreDeps,
  specName: string,
  tickProposals: ConsoleProposal[],
): Promise<{ path: string[]; added: CxProposal[]; skipped: number }> {
  const path = ["load_proposals", "dedupe", "persist", "emit"];
  const existing = await loadProposals(deps, specName);
  const openKeys = new Set(
    existing
      .filter((p) => p.status === "open" || p.status === "claimed")
      .map((p) => `${p.targetId}|${p.kind}|${p.nbaRuleId ?? ""}`),
  );

  const added: CxProposal[] = [];
  let skipped = 0;
  const now = deps.now();
  let i = 0;
  for (const t of tickProposals) {
    if (t.kind === "none") continue;
    const key = `${t.targetId}|${t.kind}|${t.nba?.primary?.id ?? ""}`;
    if (openKeys.has(key)) {
      skipped++;
      continue;
    }
    openKeys.add(key);
    const prop: CxProposal = {
      id: proposalId(now, t.targetId, i++),
      specName,
      targetId: t.targetId,
      kind: t.kind,
      summary: t.summary,
      nbaAction: t.nba?.primary?.action,
      nbaRuleId: t.nba?.primary?.id,
      status: "open",
      createdAt: now,
      updatedAt: now,
      path: t.path,
    };
    added.push(prop);
  }

  if (added.length > 0) {
    await saveProposals(deps, specName, [...existing, ...added]);
  }
  return { path, added, skipped };
}

/** Legal human-gated edges. Same status is always allowed (idempotent). */
const LEGAL_EDGES: Record<ProposalStatus, readonly ProposalStatus[]> = {
  open: ["open", "claimed", "dismissed", "resolved"],
  claimed: ["claimed", "resolved", "dismissed", "open"],
  dismissed: ["dismissed", "open"],
  resolved: ["resolved"],
};

export function isLegalProposalTransition(
  from: ProposalStatus,
  to: ProposalStatus,
): boolean {
  return (LEGAL_EDGES[from] ?? []).includes(to);
}

/** Suggested operator next command verb for a proposal row. */
export function suggestedProposalNext(
  status: ProposalStatus,
): "apply" | "resolve" | "dismiss" | "reopen" | "none" {
  if (status === "open") return "apply";
  if (status === "claimed") return "resolve";
  if (status === "dismissed") return "reopen";
  return "none";
}

/**
 * Pure urgency score 0-100 from kind + age (hours).
 * remediate base 70, investigate 45, else 25; +1 per hour capped +30.
 */
export function proposalUrgencyScore(kind: string, ageHours: number): number {
  let base = 25;
  if (kind === "remediate") base = 70;
  else if (kind === "investigate") base = 45;
  const age = Math.max(0, Math.min(30, Math.floor(ageHours)));
  return Math.min(100, base + age);
}

export async function transitionProposal(
  deps: ProposalStoreDeps,
  specName: string,
  id: string,
  status: ProposalStatus,
  opts?: { actor?: string },
): Promise<CxProposal | null> {
  const all = await loadProposals(deps, specName);
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const current = all[idx]!;
  if (!isLegalProposalTransition(current.status, status)) {
    throw new Error(
      `illegal proposal transition ${current.status} → ${status} (id=${id})`,
    );
  }
  const now = deps.now();
  const actor = opts?.actor?.trim() || undefined;
  const next: CxProposal = { ...current, status, updatedAt: now };
  if (status === "claimed" && actor) {
    next.claimedBy = actor;
    next.claimedAt = now;
  }
  if (status === "resolved" && actor) {
    next.resolvedBy = actor;
    next.resolvedAt = now;
  }
  if (status === "dismissed" && actor) {
    next.dismissedBy = actor;
    next.resolvedAt = now;
  }
  all[idx] = next;
  await saveProposals(deps, specName, all);
  return next;
}

export async function listOpenProposals(
  deps: ProposalStoreDeps,
  specName: string,
): Promise<CxProposal[]> {
  const all = await loadProposals(deps, specName);
  return all.filter((p) => p.status === "open" || p.status === "claimed");
}
