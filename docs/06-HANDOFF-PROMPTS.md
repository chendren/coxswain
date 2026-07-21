# Handoff — kickoff prompts for builder agents

Six workstreams run in parallel, one agent (or terminal session) each.
Recommended: **Sonnet-class builders** — the specs are written so a Sonnet
can execute them without architectural judgment calls. Escalate a stuck task
to an Opus-class session rather than letting a builder improvise.

## Step 0 — human, once

```bash
cd ~/coxswain
git add -A && git commit -m "baseline: core contracts + docs + spec packs"
# one branch per workstream if using worktrees:
for ws in providers router-ledger agent-tools spec-engine steering-hooks tui-cli; do
  git branch "ws/$ws"; done
```

Then start six sessions (six terminals with `claude`, or worktrees, or your
muster fleet — each worker gets one prompt below verbatim).

## Kickoff prompt template

Every workstream uses the same shape — only the name changes:

```
You are the builder for the <WS-NAME> workstream of the Coxswain project.

Setup:
- Repo: ~/coxswain, branch ws/<WS-NAME>.
- Read in this order, fully, before writing any code:
  1. CLAUDE.md
  2. docs/04-CONVENTIONS.md
  3. packages/core/src/types.ts   (frozen contracts — never edit)
  4. docs/specs/<WS-NAME>/requirements.md, design.md, tasks.md
- Only for router-ledger: also read docs/05-ROUTING-AND-LEDGER.md (authoritative).
- Only for tui-cli: also read docs/01-ARCHITECTURE.md and docs/05 §2 (render formats).

Rules:
- Write only inside your packages (listed in your design.md) and check off
  your own docs/specs/<WS-NAME>/tasks.md. Never modify packages/core, other
  packages, or shared docs. Contract friction → append to INTEGRATION-NOTES.md.
- Execute tasks.md strictly top to bottom. One commit per task:
  "ws/<WS-NAME>: task N — <title>". A task is done only when its
  verification command passes; paste the passing output into the commit body.
- pnpm --filter <your packages> typecheck && test must be green before every commit.
- Dependencies: only those named in your design.md. No network in tests.
- If a task fails twice, or specs contradict, STOP: write what you tried to
  INTEGRATION-NOTES.md and move to the next non-dependent task.

Begin with task 1 now.
```

Workstream names: `providers`, `router-ledger`, `agent-tools`,
`spec-engine`, `steering-hooks`, `tui-cli`.

## Integration session (after lanes are green — M2 in docs/03)

Run this one on a stronger model (Opus-class), single session:

```
You are the integrator for Coxswain (~/coxswain). All six ws/* branches have
green typecheck+tests. Read docs/03-BUILD-PLAN.md §Sequencing and
INTEGRATION-NOTES.md first. Merge lanes into an integration branch in this
order: providers → router-ledger → agent-tools → spec-engine →
steering-hooks → tui-cli. After each merge run the full workspace
typecheck+test. Then complete @cox/cli's composition root until milestone M2
passes: an interactive session using MockChatModel answers a prompt
end-to-end with routing announcement, status line updates, and a ledger
entry. Resolve INTEGRATION-NOTES.md items; you MAY edit packages/core here —
you are the only role allowed to. Document every core change in
INTEGRATION-NOTES.md under "Contract changes".
```

## Progress tracking

Each workstream's `tasks.md` checkboxes are the ground truth. Quick scan:

```bash
grep -c "^- \[x\]" docs/specs/*/tasks.md   # done per lane
grep -c "^- \[ \]" docs/specs/*/tasks.md   # remaining per lane
```
