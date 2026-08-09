/**
 * SQLite persistence for CXOS operate queue.
 *
 * Single DB at `{cxRoot}/cxops.db` (i.e. .cox/cx/cxops.db) with WAL.
 * Uses `node:sqlite` (Node 22.5+, experimental) via DatabaseSync.
 * Filesystem remains fallback when COX_SQLITE != "1".
 *
 * Design doc: docs/SQLITE-PLAN.md
 */

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { CxProposal } from "./proposals";
import type { CxTask } from "./tasks";
import type { CxAuditEvent } from "./audit";
import type { HealthSample } from "./health-history";

// ---------------------------------------------------------------------------
// Flag + path helpers
// ---------------------------------------------------------------------------

export function isSqliteEnabled(): boolean {
  return process.env.COX_SQLITE === "1";
}

export function sqliteDbPath(cxRoot: string): string {
  return join(cxRoot, "cxops.db");
}

// ---------------------------------------------------------------------------
// Minimal DB abstraction over node:sqlite DatabaseSync
// ---------------------------------------------------------------------------

export interface CxStatement<T extends object = Record<string, unknown>> {
  get(...params: unknown[]): T | undefined;
  all(...params: unknown[]): T[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface CxSqliteDb {
  readonly cxRoot: string;
  readonly dbPath: string;
  exec(sql: string): void;
  prepare<T extends object = Record<string, unknown>>(sql: string): CxStatement<T>;
  close(): void;
  /** Raw underlying DatabaseSync instance (for PRAGMA / transaction helpers). */
  readonly raw: unknown;
}

type DatabaseSyncCtor = new (path: string) => {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  };
  close(): void;
};

let DatabaseSyncCtor: DatabaseSyncCtor | null = null;
let ctorTried = false;

function getDatabaseSyncCtor(): DatabaseSyncCtor {
  if (ctorTried && DatabaseSyncCtor) return DatabaseSyncCtor;
  if (ctorTried && !DatabaseSyncCtor) {
    throw new Error(
      "node:sqlite unavailable — use Node >= 22.5 or set COX_SQLITE=0 to use filesystem fallback",
    );
  }
  ctorTried = true;
  try {
    const require = createRequire(import.meta.url);
    const mod = require("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };
    if (!mod.DatabaseSync) throw new Error("DatabaseSync missing");
    DatabaseSyncCtor = mod.DatabaseSync;
    return DatabaseSyncCtor;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `node:sqlite unavailable (${msg}) — use Node >= 22.5 or set COX_SQLITE=0`,
    );
  }
}

// Per-cxRoot singleton (process-local)
const dbCache = new Map<string, CxSqliteDb>();

export function getCxDb(cxRoot: string): CxSqliteDb {
  const existing = dbCache.get(cxRoot);
  if (existing) return existing;

  const Ctor = getDatabaseSyncCtor();
  const dbPath = sqliteDbPath(cxRoot);

  // Ensure cxRoot dir exists (DB file parent)
  try {
    mkdirSync(cxRoot, { recursive: true });
  } catch {
    // ignore — open will fail with a clear error
  }

  const raw = new Ctor(dbPath);
  const db: CxSqliteDb = {
    cxRoot,
    dbPath,
    raw,
    exec(sql: string) {
      raw.exec(sql);
    },
    prepare<T extends object>(sql: string): CxStatement<T> {
      const stmt = raw.prepare(sql);
      return {
        get(...params: unknown[]) {
          return stmt.get(...params) as T | undefined;
        },
        all(...params: unknown[]) {
          return stmt.all(...params) as T[];
        },
        run(...params: unknown[]) {
          return stmt.run(...params);
        },
      };
    },
    close() {
      raw.close();
      dbCache.delete(cxRoot);
    },
  };

  // Pragmas (idempotent)
  try {
    db.exec("PRAGMA journal_mode = WAL;");
  } catch {
    // journal_mode may fail on :memory: or readonly — non-fatal
  }
  try {
    db.exec("PRAGMA foreign_keys = ON;");
  } catch {
    // ignore
  }
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
  } catch {
    // ignore
  }

  initSchema(db);
  dbCache.set(cxRoot, db);
  return db;
}

export function closeCxDb(cxRoot: string): void {
  const db = dbCache.get(cxRoot);
  if (db) db.close();
}

export function closeAllCxDbs(): void {
  for (const db of dbCache.values()) {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
  dbCache.clear();
}

// ---------------------------------------------------------------------------
// Schema (idempotent)
// ---------------------------------------------------------------------------

export function initSchema(db: CxSqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id            TEXT PRIMARY KEY,
      spec_name     TEXT NOT NULL,
      target_id     TEXT NOT NULL,
      kind          TEXT NOT NULL CHECK (kind IN ('remediate','investigate','scale','none')),
      summary       TEXT NOT NULL,
      nba_action    TEXT,
      nba_rule_id   TEXT,
      status        TEXT NOT NULL CHECK (status IN ('open','claimed','resolved','dismissed')),
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      path_json     TEXT NOT NULL DEFAULT '[]',
      claimed_by    TEXT,
      claimed_at    TEXT,
      resolved_by   TEXT,
      resolved_at   TEXT,
      dismissed_by  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_proposals_spec_status
      ON proposals(spec_name, status);
    CREATE INDEX IF NOT EXISTS idx_proposals_spec_target
      ON proposals(spec_name, target_id);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_proposals_open_dedupe
      ON proposals(spec_name, target_id, kind, COALESCE(nba_rule_id,''))
      WHERE status IN ('open','claimed');

    CREATE TABLE IF NOT EXISTS tasks (
      id                  TEXT PRIMARY KEY,
      spec_name           TEXT NOT NULL,
      title               TEXT NOT NULL,
      detail              TEXT NOT NULL,
      status              TEXT NOT NULL CHECK (status IN ('pending','in_progress','done','cancelled')),
      source_proposal_id  TEXT REFERENCES proposals(id) ON DELETE SET NULL,
      target_id           TEXT,
      nba_action          TEXT,
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL,
      path_json           TEXT NOT NULL DEFAULT '[]',
      assigned_to         TEXT,
      closed_by           TEXT,
      closed_at           TEXT,
      evidence_json       TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_spec_status
      ON tasks(spec_name, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_source
      ON tasks(source_proposal_id) WHERE source_proposal_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS audit (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      at          TEXT NOT NULL,
      kind        TEXT NOT NULL,
      spec_name   TEXT NOT NULL,
      message     TEXT NOT NULL,
      ref         TEXT,
      path_json   TEXT,
      actor       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_spec_at
      ON audit(spec_name, at);
    CREATE INDEX IF NOT EXISTS idx_audit_spec_kind
      ON audit(spec_name, kind);

    CREATE TABLE IF NOT EXISTS health_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      spec_name     TEXT NOT NULL,
      at            TEXT NOT NULL,
      score         INTEGER NOT NULL,
      healthy       INTEGER NOT NULL,
      degraded      INTEGER NOT NULL,
      down          INTEGER NOT NULL,
      errors        INTEGER NOT NULL,
      total         INTEGER NOT NULL,
      entries_json  TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_health_spec_at
      ON health_history(spec_name, at);
  `);

  // Record migration version 1 if missing
  try {
    const row = db
      .prepare<{ cnt: number }>("SELECT COUNT(*) as cnt FROM schema_migrations WHERE version = 1")
      .get();
    if (row && row.cnt === 0) {
      db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)").run(
        new Date().toISOString(),
      );
    } else if (!row) {
      db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, ?)").run(
        new Date().toISOString(),
      );
    }
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Row types + mappers
// ---------------------------------------------------------------------------

export interface ProposalRow {
  id: string;
  spec_name: string;
  target_id: string;
  kind: string;
  summary: string;
  nba_action: string | null;
  nba_rule_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  path_json: string;
  claimed_by: string | null;
  claimed_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  dismissed_by: string | null;
}

export interface TaskRow {
  id: string;
  spec_name: string;
  title: string;
  detail: string;
  status: string;
  source_proposal_id: string | null;
  target_id: string | null;
  nba_action: string | null;
  created_at: string;
  updated_at: string;
  path_json: string;
  assigned_to: string | null;
  closed_by: string | null;
  closed_at: string | null;
  evidence_json: string;
}

export interface AuditRow {
  id: number;
  at: string;
  kind: string;
  spec_name: string;
  message: string;
  ref: string | null;
  path_json: string | null;
  actor: string | null;
}

export interface HealthRow {
  id: number;
  spec_name: string;
  at: string;
  score: number;
  healthy: number;
  degraded: number;
  down: number;
  errors: number;
  total: number;
  entries_json: string;
}

function parseJsonArray<T>(raw: string | null, fallback: T[]): T[] {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw) as T[];
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function rowToProposal(row: ProposalRow): CxProposal {
  return {
    id: row.id,
    specName: row.spec_name,
    targetId: row.target_id as CxProposal["targetId"],
    kind: row.kind as CxProposal["kind"],
    summary: row.summary,
    nbaAction: row.nba_action ?? undefined,
    nbaRuleId: row.nba_rule_id ?? undefined,
    status: row.status as CxProposal["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    path: parseJsonArray<string>(row.path_json, []),
    claimedBy: row.claimed_by ?? undefined,
    claimedAt: row.claimed_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    dismissedBy: row.dismissed_by ?? undefined,
  };
}

export function proposalToRow(p: CxProposal): ProposalRow {
  return {
    id: p.id,
    spec_name: p.specName,
    target_id: p.targetId,
    kind: p.kind,
    summary: p.summary,
    nba_action: p.nbaAction ?? null,
    nba_rule_id: p.nbaRuleId ?? null,
    status: p.status,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    path_json: JSON.stringify(p.path ?? []),
    claimed_by: p.claimedBy ?? null,
    claimed_at: p.claimedAt ?? null,
    resolved_by: p.resolvedBy ?? null,
    resolved_at: p.resolvedAt ?? null,
    dismissed_by: p.dismissedBy ?? null,
  };
}

export function rowToTask(row: TaskRow): CxTask {
  return {
    id: row.id,
    specName: row.spec_name,
    title: row.title,
    detail: row.detail,
    status: row.status as CxTask["status"],
    sourceProposalId: row.source_proposal_id ?? undefined,
    targetId: (row.target_id as CxTask["targetId"]) ?? undefined,
    nbaAction: row.nba_action ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    path: parseJsonArray<string>(row.path_json, []),
    assignedTo: row.assigned_to ?? undefined,
    closedBy: row.closed_by ?? undefined,
    closedAt: row.closed_at ?? undefined,
    evidence: parseJsonArray(row.evidence_json, []),
  };
}

export function taskToRow(t: CxTask): TaskRow {
  return {
    id: t.id,
    spec_name: t.specName,
    title: t.title,
    detail: t.detail,
    status: t.status,
    source_proposal_id: t.sourceProposalId ?? null,
    target_id: t.targetId ?? null,
    nba_action: t.nbaAction ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    path_json: JSON.stringify(t.path ?? []),
    assigned_to: t.assignedTo ?? null,
    closed_by: t.closedBy ?? null,
    closed_at: t.closedAt ?? null,
    evidence_json: JSON.stringify(t.evidence ?? []),
  };
}

export function rowToAudit(row: AuditRow): CxAuditEvent {
  return {
    at: row.at,
    kind: row.kind,
    specName: row.spec_name,
    message: row.message,
    ref: row.ref ?? undefined,
    path: row.path_json ? parseJsonArray<string>(row.path_json, []) : undefined,
    actor: row.actor ?? undefined,
  };
}

export function rowToHealth(row: HealthRow): HealthSample {
  return {
    at: row.at,
    score: row.score,
    healthy: row.healthy,
    degraded: row.degraded,
    down: row.down,
    errors: row.errors,
    total: row.total,
    entries: parseJsonArray(row.entries_json, []),
  };
}

// ---------------------------------------------------------------------------
// JSON → SQLite migration (idempotent)
// ---------------------------------------------------------------------------

export interface MigrateResult {
  specs: number;
  proposals: number;
  tasks: number;
  audits: number;
  healthSamples: number;
}

export async function migrateJsonToSqlite(
  cxRoot: string,
  db?: CxSqliteDb,
): Promise<MigrateResult> {
  const targetDb = db ?? getCxDb(cxRoot);
  // Lazy import to avoid circular deps (workspace imports sqlite)
  const { loadProposals } = await import("./proposals.js");
  const { loadCxTasks } = await import("./tasks.js");
  const { loadAuditEvents } = await import("./audit.js");
  const { loadHealthHistory } = await import("./health-history.js");
  const { listCxSpecs } = await import("./workspace.js");

  const deps = { cxRoot, now: () => new Date().toISOString() };
  const specs = await listCxSpecs(deps);

  let proposals = 0;
  let tasks = 0;
  let audits = 0;
  let healthSamples = 0;

  for (const specName of specs) {
    // Proposals — INSERT OR IGNORE by PK
    const props = await loadProposals(deps, specName);
    for (const p of props) {
      const row = proposalToRow(p);
      const res = targetDb
        .prepare(
          `INSERT OR IGNORE INTO proposals
           (id, spec_name, target_id, kind, summary, nba_action, nba_rule_id, status, created_at, updated_at, path_json, claimed_by, claimed_at, resolved_by, resolved_at, dismissed_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          row.spec_name,
          row.target_id,
          row.kind,
          row.summary,
          row.nba_action,
          row.nba_rule_id,
          row.status,
          row.created_at,
          row.updated_at,
          row.path_json,
          row.claimed_by,
          row.claimed_at,
          row.resolved_by,
          row.resolved_at,
          row.dismissed_by,
        );
      proposals += res.changes;
    }

    // Tasks — INSERT OR IGNORE by PK
    const ts = await loadCxTasks(deps, specName);
    for (const t of ts) {
      const row = taskToRow(t);
      const res = targetDb
        .prepare(
          `INSERT OR IGNORE INTO tasks
           (id, spec_name, title, detail, status, source_proposal_id, target_id, nba_action, created_at, updated_at, path_json, assigned_to, closed_by, closed_at, evidence_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          row.spec_name,
          row.title,
          row.detail,
          row.status,
          row.source_proposal_id,
          row.target_id,
          row.nba_action,
          row.created_at,
          row.updated_at,
          row.path_json,
          row.assigned_to,
          row.closed_by,
          row.closed_at,
          row.evidence_json,
        );
      tasks += res.changes;
    }

    // Audit — dedupe on (spec_name, at, kind, message) to make re-runs safe
    const events = await loadAuditEvents(deps, specName, 0);
    for (const e of events) {
      const exists = targetDb
        .prepare<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM audit WHERE spec_name = ? AND at = ? AND kind = ? AND message = ?",
        )
        .get(specName, e.at, e.kind, e.message);
      if (exists && exists.cnt > 0) continue;
      const res = targetDb
        .prepare(
          "INSERT INTO audit(at, kind, spec_name, message, ref, path_json, actor) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          e.at,
          e.kind,
          e.specName,
          e.message,
          e.ref ?? null,
          e.path ? JSON.stringify(e.path) : null,
          e.actor ?? null,
        );
      audits += res.changes;
    }

    // Health history — dedupe on (spec_name, at)
    const samples = await loadHealthHistory(deps, specName, 0);
    for (const s of samples) {
      const exists = targetDb
        .prepare<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM health_history WHERE spec_name = ? AND at = ?",
        )
        .get(specName, s.at);
      if (exists && exists.cnt > 0) continue;
      const res = targetDb
        .prepare(
          "INSERT INTO health_history(spec_name, at, score, healthy, degraded, down, errors, total, entries_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          specName,
          s.at,
          s.score,
          s.healthy,
          s.degraded,
          s.down,
          s.errors,
          s.total,
          JSON.stringify(s.entries),
        );
      healthSamples += res.changes;
    }
  }

  return { specs: specs.length, proposals, tasks, audits, healthSamples };
}
