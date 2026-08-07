# CXOS Incident Mode

Short operator narrative for day-2 incidents: **status → operate → queue → claim**.

CLI already exposes these commands (`cox cx status`, `operate`, `queue`, `claim`).
This doc is the playbook only; no extra CLI helper is required.

**Related:** full command map in [`CXOS-COMPLETE.md`](./CXOS-COMPLETE.md);
personas scenario S2 in [`CXOS-PERSONAS-USE-CASES.md`](./CXOS-PERSONAS-USE-CASES.md);
legal edges and apply semantics in [`CXOS.md`](./CXOS.md).

---

## What incident mode is

When health drops, a proposal appears, or the fleet queue has open work, run this
loop. CXOS **proposes** only. Humans **claim**, execute remediations outside
Coxswain, then **close** tasks. No silent adapter or AWS mutations.

| Step | Command | Role |
|---|---|---|
| 1. Observe | `cox cx status [name] [--live]` | Health scores, deployment state; appends health-history samples |
| 2. Tick | `cox cx operate <name> [--live]` | One console tick (propose) + board line + next hints |
| 3. Prioritize | `cox cx queue` | Cross-spec open/claimed proposals + open tasks, urgency sorted |
| 4. Claim | `cox cx claim <name> <proposalId>` | Alias for `apply`: task + remediation; proposal → **claimed** |

Optional close-out after human work:

```bash
pnpm cox cx tasks <name>
pnpm cox cx task <name> <taskId> done   # default: auto-resolve source proposal
```

---

## Narrative (one program)

Assume program `billing` is deployed and something looks wrong.

### 1. Status (detect)

```bash
pnpm cox cx status billing --live
pnpm cox cx health-history billing --limit 10
```

Read target health (`healthy` / `degraded` / `down` / error) and the score rollup.
Use `--live` when the local platform or hybrid stack should be probed for real.
Without `--live`, offline adapters report disk-backed health only.

Fleet-wide alternative:

```bash
pnpm cox cx fleet-status --live
# or: pnpm cx:fleet -- --live
```

### 2. Operate (propose)

```bash
pnpm cox cx operate billing --live
# script: pnpm cx:operate -- billing
```

What it does:

1. Runs one **console** tick: load strong ontology → poll status → route intent
   (`healthy` → none, `degraded` → investigate, `down` → remediate) → recommend
   NBA → **propose_gated** (persist open proposals only).
2. Prints a **board** line for this spec (open/claimed props, open tasks, daemon).
3. Hints next commands: `proposals`, then `claim`.

Nothing mutates deployments. Proposals land in `.cox/cx/billing/proposals.json`.

For continuous ticks instead of one-shot: `watch` or `daemon start` (still propose-only).

### 3. Queue (prioritize)

```bash
pnpm cox cx queue
# script: pnpm cx:queue
```

Cross-spec work queue: every open or claimed proposal and every pending /
in_progress task. Proposal rows show urgency (`remediate` high, `investigate`
med), age, and `next=apply|resolve|…`. When next is apply, the CLI prints a
ready `cox cx claim <spec> <id>` line.

Empty queue means generate work first (`operate` / `console`) or all work is
resolved.

Per-spec list if you already know the program:

```bash
pnpm cox cx proposals billing
pnpm cox cx tasks billing
```

### 4. Claim (own the work)

```bash
pnpm cox cx claim billing prop_…
# equivalent: pnpm cox cx apply billing prop_…
# script: pnpm cx:claim -- billing prop_…
```

Effects:

- Creates a **task** and `remediations/<proposalId>.md` under the program dir.
- Proposal status becomes **claimed** (default). Use `--resolve` only if you
  also want the proposal marked **resolved** in the same step (rare mid-incident).

Then execute the remediation markdown with platform tools, runbooks, or scoped
cloud credentials. Coxswain does not apply CFN or change the live stack for you.

### 5. Close (evidence)

```bash
pnpm cox cx task billing task_… done
pnpm cox cx proposals billing --all
pnpm cox cx audit billing --limit 20
```

`task … done` auto-resolves the source proposal unless you pass
`--no-resolve-source`. Legal proposal edges:

```text
open      → claimed | dismissed | resolved
claimed   → resolved | dismissed | open   # open = release claim
dismissed → open
resolved  → (terminal)
```

---

## Compact incident script

Copy-paste skeleton (replace `billing` and ids):

```bash
# Detect
pnpm cox cx status billing --live
pnpm cox cx health-history billing

# Propose + prioritize
pnpm cox cx operate billing --live
pnpm cox cx queue

# Own highest-urgency open proposal (id from queue / operate output)
pnpm cox cx claim billing prop_REPLACE

# After human remediation
pnpm cox cx tasks billing
pnpm cox cx task billing task_REPLACE done

# Evidence
pnpm cox cx audit billing
pnpm cox cx snapshot billing   # optional handoff package
```

Root scripts when you prefer package.json entrypoints:

| Script | Maps to |
|---|---|
| `pnpm cx:operate -- <name>` | `cox cx operate` |
| `pnpm cx:queue` | `cox cx queue` |
| `pnpm cx:claim -- <name> <proposalId>` | `cox cx claim` |
| `pnpm cx:fleet -- --live` | `cox cx fleet-status` |

---

## Hard rules (do not skip)

1. **Propose ≠ mutate.** `operate` / `console` / `watch` / `daemon` only write
   proposals (and related ops state). Claim/apply writes task + remediation only.
2. **No live AWS CreateStack from Coxswain.** AWS path is plan-only; humans apply.
3. **Claim is ops language for apply.** Same code path; prefer `claim` on the floor.
4. **Close the loop.** Leaving proposals `claimed` with open tasks hides true
   backlog on `board` and `queue`.

---

## When to leave incident mode

- `cox cx queue` shows no open proposals and no open tasks for the affected specs.
- `cox cx status <name> --live` scores are healthy (or accepted degraded with a
  tracked follow-up task).
- Optional: `brief` / `cab-export` / `snapshot` for change-board evidence.

Day-2 continuous operate (daemon + board) is normal ops, not incident mode. Use
this doc when you need a fast, human-gated path from red health to closed work.
