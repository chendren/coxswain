# SQLite Persistence Plan — CXOS Proposal / Task / Audit Queue

> Replaces filesystem JSON races (`proposals.json`, `tasks.json`, `audit.jsonl`,
> `health-history.jsonl`) with SQLite transactions. Filesystem remains fallback
> until `COX_SQLITE=1` is stable.

---

## 1. Problem

Current CXOS operate queue is per-spec JSON:

| File | Writer | Race |
|---|---|---|
| `.cox/cx/<spec>/proposals.json` | `console` / `watch` / `daemon` (read-modify-write) | Lost-update if two ticks overlap; `writeFile` is not atomic across processes |
| `.cox/cx/<spec>/tasks.json` | `applyProposal` + `transitionTask` | Same RMW race; `task done` can clobber concurrent `apply` |
| `.cox/cx/<spec>/audit.jsonl` | `appendFile` | Safer (append), but no index, no query, no transaction with proposals/tasks |
| `.cox/cx/<spec>/health-history.jsonl` | `status` / `fleet-status` | Append-only, but interleaved writes can truncate on crash |

All callers use `readFile → JSON.parse → mutate → writeFile`. No locking, no
WAL, no atomicity. Daemon (`daemon.pid`/`daemon.json`) adds concurrent
`recordDaemonLastTick` writes on the same spec.

`.gitignore` already excludes daemon runtime files:

```gitignore
.cox/cx/*/daemon.pid
.cox/cx/*/daemon.log
.cox/cx/*/daemon.json
.cox/cx/*/health-history.jsonl
```

Proposal/task/audit JSON are **not** ignored — they are portable state today.
SQLite will need a single ignored DB file.

---

## 2. Goals / Non-Goals

**Goals**

- Atomic proposal/task transitions (single-writer transaction).
- Dedupe proposals without RMW race (`INSERT OR IGNORE` via unique partial index).
- Cross-spec queries for `board`/`queue`/`fleet-status` without N `readFile` fans.
- Append-only audit that participates in the same transaction as proposal/task close-out.
- Zero breaking change for existing callers while `COX_SQLITE != 1`.

**Non-goals (this phase)**

- Replacing `spec.json` / `deployments.json` (workspace lifecycle stays file-based).
- Replacing daemon PID coordination (stays FS + `process.kill(pid,0)`).
- ORM or migration framework — raw SQL + `DatabaseSync`.

---

## 3. File Layout

```
.cox/cx/cxops.db          # single SQLite DB for all specs under this cxRoot
.cox/cx/cxops.db-wal      # WAL file (auto)
.cox/cx/cxops.db-shm      # SHM file (auto)
.cox/cx/<spec>/…json      # still written when COX_SQLITE != 1 (fallback)
```

Why single DB at `cxRoot`:

- `board`/`queue` need cross-spec scans — one DB avoids N file opens.
- `CX_ENV` already shards `cxRoot` (` .cox/cx` vs `.cox/cx-stage`), so per-env DB is natural.
- Per-spec DB would reintroduce fan-out and complicate fleet queries.

New ignore line (add when SQLite goes default):

```gitignore
.cox/cx*/cxops.db*
```

Keep `health-history.jsonl` ignored; SQLite replaces it internally but file
remains for fallback readers.

---

## 4. Exact Schema (v1)

All timestamps are ISO-8601 `TEXT` (UTC, `new Date().toISOString()`).
JSON columns store `JSON.stringify` arrays/objects.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- ------------------------------------------------------------------
-- schema bookkeeping
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- ------------------------------------------------------------------
-- proposals — human-gated work items (replaces proposals.json)
-- ------------------------------------------------------------------
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
  path_json     TEXT NOT NULL DEFAULT '[]',   -- JSON array
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

-- Dedupe: only one open/claimed per (spec, target, kind, nba_rule_id).
-- SQLite partial index enforces this atomically vs. Set-based dedupe today.
-- nba_rule_id may be NULL → coalesce to '' in index.
CREATE UNIQUE INDEX IF NOT EXISTS ux_proposals_open_dedupe
  ON proposals(spec_name, target_id, kind, COALESCE(nba_rule_id,''))
  WHERE status IN ('open','claimed');

-- ------------------------------------------------------------------
-- tasks — proposal apply bridge (replaces tasks.json)
-- ------------------------------------------------------------------
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
  evidence_json       TEXT NOT NULL DEFAULT '[]'   -- JSON array of TaskEvidence
);

CREATE INDEX IF NOT EXISTS idx_tasks_spec_status
  ON tasks(spec_name, status);
CREATE INDEX IF NOT EXISTS idx_tasks_source
  ON tasks(source_proposal_id) WHERE source_proposal_id IS NOT NULL;

-- ------------------------------------------------------------------
-- audit — append-only event trail (replaces audit.jsonl)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  kind        TEXT NOT NULL,
  spec_name   TEXT NOT NULL,
  message     TEXT NOT NULL,
  ref         TEXT,
  path_json   TEXT,          -- JSON array or NULL
  actor       TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_spec_at
  ON audit(spec_name, at);
CREATE INDEX IF NOT EXISTS idx_audit_spec_kind
  ON audit(spec_name, kind);

-- ------------------------------------------------------------------
-- health_history — deployment health samples (replaces health-history.jsonl)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  spec_name   TEXT NOT NULL,
  at          TEXT NOT NULL,
  score       INTEGER NOT NULL,
  healthy     INTEGER NOT NULL,
  degraded    INTEGER NOT NULL,
  down        INTEGER NOT NULL,
  errors      INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  entries_json TEXT NOT NULL DEFAULT '[]'  -- JSON array of HealthEntry
);

CREATE INDEX IF NOT EXISTS idx_health_spec_at
  ON health_history(spec_name, at);
```

**Column mapping vs. current interfaces**

| Interface field | Column | Notes |
|---|---|---|
| `CxProposal.path: string[]` | `path_json` | `JSON.stringify` / `JSON.parse` |
| `CxProposal.nbaAction` | `nba_action` | nullable |
| `CxProposal.claimedBy` | `claimed_by` | set on `claimed` transition |
| `CxProposal.dismissedBy` | `dismissed_by` | `resolved_at` reused for dismissed timestamp (parity with `proposals.ts:193`) |
| `CxTask.evidence: TaskEvidence[]` | `evidence_json` | append-only JSON array |
| `CxTask.path` | `path_json` | |
| `CxAuditEvent.path` | `path_json` | nullable |
| `HealthSample.entries` | `entries_json` | |
| `*_at` timestamps | `*_at` TEXT | ISO-8601, indexed |

---

## 5. Transaction Semantics

Every mutating operation runs in `BEGIN IMMEDIATE; … COMMIT;` (via
`DatabaseSync` transaction helper). On `SQLITE_BUSY`, retry with
`busy_timeout=5000`.

| Operation | Current FS | SQLite TX |
|---|---|---|
| `appendProposalsFromTick` | `load → Set dedupe → save` | `INSERT OR IGNORE` per proposal via partial unique index; `INSERT` batch in one TX; returns `{added, skipped}` by counting `changes` |
| `transitionProposal` | `load → LEGAL_EDGES check → save` | `SELECT … FOR` + app-side `isLegalProposalTransition` + `UPDATE … WHERE id=? AND status=?`; throw on illegal edge (same error text) |
| `applyProposal` | `load tasks → push → save → write md → transitionProposal` | `INSERT INTO tasks` + `UPDATE proposals SET status='claimed'` in one TX; remediation `.md` still on FS (outside TX, best-effort after commit) |
| `transitionTask` (+ auto-resolve source proposal) | two separate `readFile/writeFile` | `UPDATE tasks` + optional `UPDATE proposals SET status='resolved'` in one TX |
| `appendAuditEvent` | `appendFile` | `INSERT INTO audit` |
| `appendHealthSample` | `appendFile` | `INSERT INTO health_history` |

Remediation markdown (`remediations/<proposalId>.md`) stays on the filesystem —
it is operator-facing docs, not queue state. Optional future: `remediations`
table.

---

## 6. Migration Path (JSON → SQLite with Fallback)

### 6.1 Feature flag

- `COX_SQLITE=1` enables SQLite; any other value (including unset) uses filesystem.
- Check via `isSqliteEnabled()` (`process.env.COX_SQLITE === "1"`).
- `workspace.ts` re-exports `isSqliteEnabled()` and `sqliteDbPath(cxRoot)` so CLI can log mode.
- No env var → no behavior change. Existing tests run unmodified.

### 6.2 DB bootstrap

On first `getCxDb(cxRoot)` call when enabled:

1. `mkdir -p cxRoot`.
2. Open `DatabaseSync(join(cxRoot, "cxops.db"))`.
3. `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`
4. Run `initSchema(db)` (idempotent `CREATE TABLE IF NOT EXISTS` + indexes).
5. Insert `schema_migrations(version=1)` if missing.

If `node:sqlite` is unavailable (Node < 22.5), `getCxDb` throws with
`node:sqlite unavailable — use Node >= 22.5 or set COX_SQLITE=0`. Caller
falls back to FS when `getCxDb` throws and `COX_SQLITE` was not explicitly 1
— but when `COX_SQLITE=1` the error is surfaced.

### 6.3 One-time JSON import

`migrateJsonToSqlite(cxRoot, db, opts?)` — idempotent, safe to re-run:

- For each spec in `listCxSpecs` (FS):
  - `loadProposals` (FS) → `INSERT OR IGNORE INTO proposals` (by `id` PK).
  - `loadCxTasks` (FS) → `INSERT OR IGNORE INTO tasks`.
  - `loadAuditEvents` (FS, `limit=0` = all) → `INSERT INTO audit` where not already present (dedupe on `(spec_name, at, kind, message)` — audit has no natural PK).
  - `loadHealthHistory` (FS, `limit=0`) → `INSERT INTO health_history`.
- After import, original `*.json`/`*.jsonl` files are **kept** (not deleted).
- A sentinel file `.cox/cx/.sqlite-migrated` or `schema_migrations` flag prevents re-import.

Recommended rollout:

```
1. Deploy code with COX_SQLITE=0 (default) — no migration runs.
2. Operators opt-in per env: COX_SQLITE=1 cox cx status <spec> --live
   → triggers lazy migrate on first SQLite call, logs "migrated N proposals…".
3. Verify: cox cx proposals <spec> and cox cx tasks <spec> read from SQLite.
4. Flip default in CI/staging, then prod.
```

### 6.4 Fallback / rollback

- Unset `COX_SQLITE` → immediate FS fallback; no data loss because FS files
  were kept and SQLite remains on disk (ignored by git).
- If SQLite is needed again, re-run migration — `INSERT OR IGNORE` makes it safe.
- Future `COX_SQLITE=2` (write-both) is reserved for dual-write verification
  but not implemented in this skeleton.

### 6.5 `.gitignore` change when SQLite becomes default

Add:

```gitignore
.cox/cx*/cxops.db*
```

Keep existing ignores for `daemon.*` and `health-history.jsonl` (health history
remains append-only in both backends during transition).

---

## 7. Adapter Interface (`packages/cx-ops/src/sqlite.ts`)

Public surface (minimal skeleton — see file for implementation):

```ts
// Feature flag + path helpers
export function isSqliteEnabled(): boolean;
export function sqliteDbPath(cxRoot: string): string;

// DB lifecycle
export function getCxDb(cxRoot: string): CxSqliteDb;
export function closeCxDb(cxRoot: string): void;
export function closeAllCxDbs(): void;
export interface CxSqliteDb {
  readonly cxRoot: string;
  readonly dbPath: string;
  exec(sql: string): void;
  prepare<T extends object>(sql: string): CxStatement<T>;
}
export interface CxStatement<T> { get(...params: unknown[]): T | undefined; all(...params: unknown[]): T[]; run(...params: unknown[]): { changes: number }; }

// Schema
export function initSchema(db: CxSqliteDb): void;

// Migration
export interface MigrateResult { specs: number; proposals: number; tasks: number; audits: number; healthSamples: number; }
export async function migrateJsonToSqlite(cxRoot: string, db?: CxSqliteDb): Promise<MigrateResult>;

// Row helpers (used by proposal/task/audit stores when flag on)
export function rowToProposal(row: ProposalRow): CxProposal;
export function proposalToRow(p: CxProposal): ProposalRow;
export function rowToTask(row: TaskRow): CxTask;
export function taskToRow(t: CxTask): TaskRow;
```

`CxSqliteDb` wraps `node:sqlite` `DatabaseSync` when available, else throws
with a clear message. `better-sqlite3` is **not** a dependency in this
skeleton to keep the install surface minimal; add it later as an optional
peer if Node < 22 support is needed (adapter would detect `require("better-sqlite3")`).

---

## 8. Integration Points (when COX_SQLITE=1)

| Module | Change |
|---|---|
| `workspace.ts` | Re-exports `isSqliteEnabled`/`sqliteDbPath` from `sqlite.ts`; no behavior change to `spec.json`/`deployments.json` |
| `proposals.ts` | Branch: if `isSqliteEnabled()` → use `getCxDb` + TX; else FS (current code) |
| `tasks.ts` | Same branch + shared TX with proposals for `applyProposal`/`transitionTask` |
| `audit.ts` | Branch to `INSERT INTO audit` |
| `health-history.ts` | Branch to `INSERT INTO health_history` |
| `board.ts` / `fleet-queue.ts` | `SELECT … WHERE spec_name IN (…)` instead of N `readFile` |
| `cli` (future) | Log `sqlite: on/off` in `doctor` / `status` when flag set |

The skeleton in this PR only wires `workspace.ts` (flag helpers). Full store
branches are deferred to keep the diff reviewable and to let `typecheck`
pass before behavioral changes.

---

## 9. Verification

```bash
pnpm --filter @cox/cx-ops typecheck
pnpm --filter @cox/cx-ops test          # existing tests still pass (flag off)
COX_SQLITE=1 pnpm --filter @cox/cx-ops test  # exercises SQLite path once stores branch
node --experimental-vm-modules -e "import('node:sqlite')"
```

Manual smoke:

```bash
# filesystem (default)
pnpm cox cx console demo --target local
pnpm cox cx proposals demo

# sqlite
COX_SQLITE=1 pnpm cox cx console demo --target local
COX_SQLITE=1 pnpm cox cx proposals demo
ls -lh .cox/cx/cxops.db*
```

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `DatabaseSync` is experimental (Node 22) | Isolate behind `CxSqliteDb` interface; swap to `better-sqlite3` if API stabilizes differently |
| WAL files not ignored → committed by accident | Add `cxops.db*` to `.gitignore` before making SQLite default |
| Partial index dedupe vs. current Set dedupe semantics | Keep `COALESCE(nba_rule_id,'')`; match exact `open|claimed` filter |
| Remediation `.md` outside TX | Accept — docs are best-effort; task/proposal TX commits first, then write file |
| Concurrent migration (two processes on first `COX_SQLITE=1`) | `INSERT OR IGNORE` + `CREATE TABLE IF NOT EXISTS` makes it idempotent; optional file lock on `.sqlite-migrating` |

---

## 11. Next Steps

1. Branch `proposals.ts`/`tasks.ts`/`audit.ts`/`health-history.ts` to SQLite when flag on.
2. Update `board.ts`/`fleet-queue.ts` to use single `SELECT` path.
3. Add `vitest` suite: concurrent `appendProposalsFromTick` (2 overlapping ticks) asserts no lost updates under SQLite vs. allowed race under FS.
4. Flip `.gitignore` + default flag in staging.
