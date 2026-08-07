# CXOS personas, use cases, and value

This document is the **product depth layer** for CXOS: who uses it, what jobs
they hire it for, how value compounds across the closed-world loop, and which
commands map to each job. It complements the technical north star in
[`CXOS.md`](./CXOS.md) and wave summaries.

**Product promise in one line:** turn a CX idea into multi-target artifacts and
an AWS plan, then run a **human-gated** operate loop (health → proposal → task →
done) without silent production mutation.

---

## 1. Why this exists (value spine)

Most CX tooling fails in one of three ways:

| Failure mode | What buyers feel | How CXOS counters |
|---|---|---|
| **Open-world drift** | Agents invent journeys, intents, and remediations that do not match the catalog | Closed ontology packs; NBA pure-match; path audits |
| **Unsafe automation** | Fear of bots rewriting Connect/Lex/prod without CAB | Plan-only AWS; console proposes only; apply = task + note |
| **Demo / delivery friction** | PS needs cloud + keys + brittle scripts to show anything | Offline-first adapters; golden path; hybrid when ready |

Value compounds along a spine every persona can point to:

```text
Trust (closed world + gates)
  → Speed (one-shot run / golden path / offline)
    → Consistency (same ontology across build + operate)
      → Auditability (path[], proposals, remediations, CFN export)
        → Handoff (PM → SA → Ops → Change → Cloud)
```

**Economic story (honest, not marketing fluff):**

- **Cut design-to-demo time** from days of slideware + ad-hoc JSON to a single
  `cx run` under a temp or project cwd.
- **Cut risk of rogue automation** by making mutation a human-owned step with
  artifacts reviewers can read.
- **Cut cross-role rework** by sharing one `.cox/cx/<spec>/` workspace: design
  docs, deployments, proposals, tasks, and exportable CFN live together.
- **Cut dependency on model spend** for CI, workshops, and air-gapped reviews
  (offline mode is first-class, not a degraded toy).

---

## 2. Persona map (primary cast)

Personas are **jobs-to-be-done**, not org-chart titles. One person often wears
two hats. Each row lists primary value and the CXOS surface they live in.

| ID | Persona | Primary job | Primary value | Home surface |
|---|---|---|---|---|
| **P1** | CX Product Manager | Define journey outcomes and gates | Spec phases, shared language with eng/ops | `new` `approve` `run` `report` `nba` |
| **P2** | Contact Center / CX Solutions Architect | Design multi-channel stack from one design | Artifacts-first multi-target + plan-only AWS | `plan` `build` `export-aws` `ontology` |
| **P3** | GenAI / Graph Engineer | Keep strong/weak boundary honest | Ontology graph, absorb rules, offline tests | `ontology *` packs, path audits |
| **P4** | CX Journey Owner / Ops Lead | Day-2 health and remediations | Gated proposals → tasks without silent mutates | `status` `console` `watch` `daemon` `apply` `tasks` |
| **P5** | NOC / Platform SRE (CX stack) | Keep local/live platform green | Doctor, stack-up, LaunchAgents, hybrid wiring | `doctor` `cx:stack-up` macos agents |
| **P6** | Change Manager / Security / Compliance | Prove no silent prod write | Audit trail, plan-only CFN, human apply | export APPLY.md, proposals history, path[] |
| **P7** | AWS Professional Services / Partner | Deliver repeatable CX engagements | Offline golden demos + customer-scoped workspaces | `cx:golden` multi-cwd `run` |
| **P8** | Workshop / Enablement Facilitator | Teach graph-node CX practice | Scriptable demos, ontology show, live optional | demo README, ontology, golden |
| **P9** | QA / Release Engineer | Prove offline and hybrid loops | Deterministic tests, doctor exit codes | vitest e2e, `doctor --live` |
| **P10** | CX Executive / Program Sponsor | See health and progress, not CLI noise | Scores, reports, task rollups (via Ops) | `status` score, `tasks` rollup, `report` |
| **P11** | Customer Success / Retention Lead | Churn and save journeys | NBA on closed journeys, operate proposals | `nba` churn contexts, console |
| **P12** | Line of Business Analyst | Ground requirements in domains | Domains/intents inventory, not free chat | `ontology show` `validate` |

Secondary (benefit without daily CLI): **Contact center supervisors**, **agent
workforce**, **billing ops**, **fraud ops** — they receive outcomes (better
journeys, fewer wild remediations) via P1/P4/P11, not via `cox` itself.

---

## 3. Journey archetypes (breadth)

Use cases map to **closed-world journey families** already native to CX design
(billing, retention, onboarding, claims-like dispute, service recovery). CXOS
does not invent new verticals out of thin air; it **grounds** work in the pack.

| Archetype | Example idea string | Typical KPIs | Heavy personas |
|---|---|---|---|
| **Billing dispute / inquiry** | `"reduce dispute handle time"` | AHT, first-contact resolution, transfer rate | P1 P2 P4 |
| **Churn prevention / save** | `"retain cancel-intent customers"` | Save rate, offer acceptance, CSAT | P1 P11 P4 |
| **Plan change / upgrade** | `"smooth plan change without double bill"` | Containment, callback rate | P1 P2 |
| **Onboarding / activation** | `"shorten time-to-first-value"` | Activation %, drop-off by stage | P1 P2 P10 |
| **Service recovery / outage care** | `"proactive care when service degraded"` | Contact volume, apology SLA | P4 P5 P10 |
| **Identity / account access** | `"reduce auth failure escalations"` | Auth success, transfer to agent | P2 P6 |
| **Collections / payment promise** (careful, gated) | `"payment arrangement with guardrails"` | Promise-to-pay, compliance holds | P1 P6 P4 |

Each archetype still follows the same **spine**: design once → build three
targets → operate with gates → export AWS for humans.

---

## 4. Depth: persona playbooks

### P1 — CX Product Manager

**Context:** Owns a journey KPI board. Tired of slide decks that diverge from
what engineering built and what ops actually does.

**Jobs:**

1. Capture an idea as a gated CX program, not a chat thread.
2. Approve requirements before design/build spend.
3. See whether the operating loop is producing real work (tasks) or noise.
4. Align NBA language with business policy (closed rules, not LLM vibes).

**Happy path (depth):**

```bash
# New program in a project folder (not global /tmp for real work)
pnpm cox --cwd ~/cx/acme cx run billing-dispute \
  "reduce billing dispute handle time without increasing refunds"

pnpm cox --cwd ~/cx/acme cx report billing-dispute
pnpm cox --cwd ~/cx/acme cx nba journey=billing_dispute stage=... confidence=0.9
pnpm cox --cwd ~/cx/acme cx tasks billing-dispute --all
```

**Decisions they make with CXOS:**

- Approve vs rewrite requirements (`approve`).
- Whether a proposal is business-valid (read summary + remediation before Ops applies).
- Whether AWS export is ready for architecture review (with P2/P6).

**Value:** single source of truth for the program; phases make governance visible;
NBA is explainable against the ontology, not a black-box agent.

**Failure avoided:** shipping a “AI journey” that invents stages Finance never
approved.

---

### P2 — Contact Center / CX Solutions Architect

**Context:** Designs Amazon Connect + Lex + Bedrock (and local omnichannel)
from one customer design. Needs IaC they can take to a change board.

**Jobs:**

1. Multi-target build from one design (artifacts → local → aws plan).
2. Produce applyable CFN without Coxswain holding cloud credentials for CreateStack.
3. Keep architecture docs and agent definitions next to the spec.
4. Compare offline plan vs live-local behavior when Nexus is up.

**Happy path:**

```bash
pnpm cox --cwd ~/cx/acme cx plan billing-dispute --target all
pnpm cox --cwd ~/cx/acme cx build billing-dispute --target all
pnpm cox --cwd ~/cx/acme cx export-aws billing-dispute ./exports/billing-dispute-aws
# review template.yaml + APPLY.md → hand to cloud team
```

**Live local validation (optional):**

```bash
./scripts/cx-stack-up.sh
pnpm cox --cwd ~/cx/acme cx doctor --live
pnpm cox --cwd ~/cx/acme cx build billing-dispute --live --target local,artifacts
pnpm cox --cwd ~/cx/acme cx simulate billing-dispute --target local --live
```

**Value:** architecture consistency across neutral docs, local platform bind, and
AWS plan; separation of **design authority** (CXOS) from **deploy authority**
(human + scoped AWS).

**Failure avoided:** demo-only JSON that cannot become a reviewable stack plan.

---

### P3 — GenAI / Graph Engineer

**Context:** Accountable for not letting weak models poison strong hubs.

**Jobs:**

1. Validate ontology pack integrity and graph shape.
2. Prove offline e2e without keys (CI and laptop).
3. Inspect control-flow path audits after console/report.
4. Extend packs carefully (closed-world discipline).

**Happy path:**

```bash
pnpm cox cx ontology validate --pack local
pnpm cox cx ontology graph --pack local
pnpm cox cx ontology show --pack default
# CI-shaped:
OPENAI_API_KEY= XAI_API_KEY= ANTHROPIC_API_KEY= pnpm --filter @cox/cx-ops test
```

**Value:** strong/weak boundary is operational, not slideware; absorb and match
paths are inspectable.

**Failure avoided:** “agentic CX” demos that rewrite identity and intents every run.

---

### P4 — CX Journey Owner / Ops Lead

**Context:** Owns day-2 for a live or pre-prod journey. Needs a queue, not a
chatbot that “fixed prod.”

**Jobs:**

1. Pulse health with a score, not only raw metrics.
2. Generate proposals from status (console/watch/daemon).
3. Claim work into tasks with remediation notes.
4. Close work so proposals resolve and the board stays honest.

**Happy path (operate loop depth):**

```bash
pnpm cox --cwd ~/cx/acme cx status billing-dispute --live
# summary score=… healthy=… degraded=…

pnpm cox --cwd ~/cx/acme cx console billing-dispute --live
# next: cox cx apply billing-dispute prop_…

pnpm cox --cwd ~/cx/acme cx proposals billing-dispute
pnpm cox --cwd ~/cx/acme cx apply billing-dispute prop_…          # claimed + task
# execute remediation markdown outside Coxswain (platform console, runbooks)

pnpm cox --cwd ~/cx/acme cx tasks billing-dispute
# rollup open=… + remediation= paths

pnpm cox --cwd ~/cx/acme cx task billing-dispute task_… done
# source proposal → resolved
```

**Daemon mode (breadth for follow-the-sun):**

```bash
pnpm cox --cwd ~/cx/acme cx daemon start billing-dispute --live
pnpm cox --cwd ~/cx/acme cx daemon status billing-dispute
# running pid=… ticks=n/max last=… proposals_open=N log=…
```

**Value:** ITIL-ish work management for CX AI: detect → propose → human claim →
execute elsewhere → resolve. Fits regulated and enterprise buyers.

**Failure avoided:** unsupervised “self-healing” that changes production flows.

---

### P5 — NOC / Platform SRE

**Context:** Owns laptop and lab stacks (Ollama + Nexus), not the business NBA.

**Jobs:**

1. Make `/api/health/ready` green (embed model + platform).
2. Install always-on agents for demos and workshops.
3. Fail closed when someone claims “live” but stack is down.

**Happy path:**

```bash
./scripts/cx-stack-up.sh
# or:
export CX_PLATFORM_DIR=~/Projects/cx-platform/omnichannel-cx-platform
./scripts/macos/install-launchagents.sh

pnpm cox cx doctor --live
# exit 1 if stack not ready under live/hybrid — by design
```

**Value:** clear ready gate; reproducible local CX fabric for everyone else.

---

### P6 — Change Manager / Security / Compliance

**Context:** Must sign off on anything that touches AWS or production policy.

**Jobs:**

1. Verify Coxswain cannot CreateStack or silent-mutate adapters.
2. Review exported CFN + APPLY.md as a change package.
3. Use proposal/task history and path audits as evidence of human gates.
4. Require claim → resolve transitions (legal edges) for process integrity.

**Review package:**

```text
cx-export/<spec>-aws/
  template.yaml      # AWSTemplateFormatVersion present
  APPLY.md           # human deploy command
  architectureDoc.json
remediations/*.md    # what humans were asked to do
proposals.json       # open → claimed → resolved trail
tasks.json           # done trail with sourceProposalId
```

**Value:** control evidence without bolting a second GRC tool onto a demo agent.

---

### P7 — AWS Professional Services / Partner Delivery

**Context:** Multi-customer, multi-workspace, needs demos that work on a plane
and deliveries that survive security review.

**Jobs:**

1. Offline golden path in customer discovery workshops.
2. Per-engagement cwd isolation (`--cwd` / project folders).
3. Export AWS plans into customer IaC pipelines.
4. Leave an operate loop the customer’s Ops Lead can own after exit.

**Engagement skeleton:**

```bash
# Discovery (offline, no customer cloud)
pnpm cx:golden

# Customer lab folder
pnpm cox --cwd ~/clients/acme/cxos cx run acme-billing "…"
pnpm cox --cwd ~/clients/acme/cxos cx export-aws acme-billing ~/clients/acme/iac/cxos-billing

# Knowledge transfer
pnpm cox --cwd ~/clients/acme/cxos cx console acme-billing
# teach apply → task → done; leave WAVE/CXOS docs
```

**Value:** reusable delivery asset; reduces custom glue per account; aligns with
AWS Well-Architected change discipline (plan, review, apply).

---

### P8 — Workshop / Enablement Facilitator

**Context:** Teaching graph-node AI + CX operating loops in 90–180 minutes.

**Jobs:**

1. Zero-cloud module that always works.
2. Optional “level up” to live local stack.
3. Visible strong graph and NBA matching.

**Workshop beats:**

| Module | Command | Teaching point |
|---|---|---|
| Strong catalog | `ontology show/validate/graph` | Closed world |
| One-shot build | `cx run` / `cx:golden` | Spec → multi-target |
| Operate gate | `console` → `apply` → `task done` | Humans own mutation |
| AWS boundary | `export-aws` | Plan ≠ deploy |
| Live optional | `stack-up` + `doctor --live` | Hybrid honesty |

**Value:** curriculum-shaped product, not a slide-only story.

---

### P9 — QA / Release Engineer

**Context:** Blocks regressions in offline e2e and live doctor semantics.

**Jobs:**

1. Keep key-cleared tests green.
2. Assert export always has `AWSTemplateFormatVersion`.
3. Assert doctor fails closed when live stack is unhealthy.

**Value:** product trust for every other persona.

---

### P10 — CX Executive / Program Sponsor

**Context:** Will not run the CLI daily; will ask P4/P1 for a scoreboard.

**What they consume (via operators):**

- Status **summary score** (fleet health of targets).
- Task rollup (`open / pending / in_progress / done`).
- Report narratives grounded in ontology NBA, not freeform doom posts.
- Assurance that cloud apply remains human-owned (P6 talking point).

**Value:** governance narrative: speed without reckless automation.

---

### P11 — Customer Success / Retention Lead

**Context:** Cancel and save moments; policy-sensitive offers.

**Jobs:**

1. Ground NBA in churn/save stages (`cox cx nba journey=… stage=…`).
2. Operate proposals when save journeys degrade.
3. Keep offer actions in remediation notes for agent coaching, not silent pushes.

**Value:** retention actions stay **policy-aligned** and reviewable.

---

### P12 — Line of Business Analyst

**Context:** Owns domain language (billing vs retention vs access).

**Jobs:**

1. Inventory domains, intents, journeys, KPIs via ontology show.
2. Validate pack before a program kickoff.
3. Challenge weak labels that fail absorb into strong hubs (with P3).

**Value:** business vocabulary stays authoritative.

---

### Fleet queue, HTML dashboard, and graph-find (P4 + P10)

**Context:** Single-spec `tasks` / `proposals` break down when a cwd holds many
CX programs. P4 needs one work queue across the fleet. P10 needs a shareable
scoreboard without living in the CLI.

**Jobs:**

1. List open proposals and open tasks across all specs (urgency + age + next).
2. Emit a browser-safe HTML board (offline, no CDNs, no auto-mutation).
3. Ground ticket and remediation language in strong ontology nodes.

**Happy path:**

```bash
pnpm cox --cwd ~/cx/acme cx queue
# proposals + tasks across fleet; urg, age, claim/done hints

pnpm cox --cwd ~/cx/acme cx dashboard
# wrote …/cxos-dashboard.html  (fleet board + open queue tables)

pnpm cox --cwd ~/cx/acme cx graph-find billing
# strong nodes: domain / journey / intent hits with hub keys
```

**Who uses what:**

| Surface | P4 Ops Lead | P10 Exec / Sponsor |
|---|---|---|
| `queue` | Daily standup of claimable work | Rarely; prefers rollups |
| `dashboard` | Shift handoff board (open in browser) | Primary non-CLI view (via Ops) |
| `graph-find` | Name remediations against real hubs | Sanity-check vocabulary in reviews |

**Value:** multi-spec ops without a second tool; HTML is read-only presentation
of board + queue; graph-find keeps free-text names out of the operate loop.

**Failure avoided:** exec status theater from ad-hoc spreadsheets; ops inventing
journey labels that are not in the pack.

---

## 5. Cross-persona scenarios (breadth × depth)

These are multi-role stories that only work because the **workspace is shared**.

### S1 — Greenfield journey program (2 weeks compressed to days)

| Day | Who | What |
|---|---|---|
| 0 | P1 + P12 | Ontology inventory; draft idea string; `cx new` / `cx run` offline |
| 1 | P2 | `plan` + `build` all targets; architecture review of artifacts |
| 2 | P5 | Stack-up; doctor live; rebuild local live |
| 3 | P1 + P4 | Simulate, report, first console proposals |
| 4 | P6 + P2 | `export-aws`; CAB package; human CFN in non-prod |
| 5+ | P4 | Daemon or watch; tasks board; continuous close-out |

### S2 — Incident-style operate (hours)

| Step | Who | What |
|---|---|---|
| Detect | P5/P4 | `status --live` score drops / platform not ready |
| Propose | P4 | `console` or daemon tick → proposals |
| Claim | P4 | `apply` → task + remediation |
| Execute | P4 + platform tools | Human actions outside Coxswain |
| Close | P4 | `task … done` → proposal resolved |
| Evidence | P6 | proposals.json + remediations + path audits |

### S3 — Partner multi-account factory

| Step | Who | What |
|---|---|---|
| Template | P7 | Offline golden + internal runbook |
| Clone | P7 | New `--cwd` per customer engagement |
| Customize | P1/P2 | Idea string + pack choice |
| Hand off | P7 → customer P4 | Operate loop training + export-aws into customer IaC |

### S4 — Air-gapped / regulated review

| Step | Who | What |
|---|---|---|
| Build | P2/P3 | Offline-only build; no external model keys |
| Review | P6 | Read CFN + remediation templates offline |
| Approve | P10/P6 | Human gate before any cloud credential use |

### S5 — Workshop to paid engagement

| Step | Who | What |
|---|---|---|
| Teach | P8 | Golden + ontology modules |
| Prove | P7 | Customer idea on offline `cx run` in-room |
| Convert | P1/P2 | Project cwd becomes engagement workspace |

### S6 — Brownfield absorb (conceptual, product-ready pattern)

Weak labels from live generate (when keys exist) resolve into strong hubs where
possible (`absorbWeak` practice). Personas: P3 owns absorb quality; P2 consumes
stable ids in architecture; P4 never operates on floating free-text kinds.

---

## 6. Mode matrix (when to use offline / hybrid / live)

| Situation | Mode | Why |
|---|---|---|
| Plane / CI / first teach | **offline** | Zero network dependencies |
| Laptop with Ollama + Nexus | **hybrid/live local** | Real health + sim; AWS still plan-only |
| Model-assisted docs | **hybrid** with keys | Weak generate for artifacts/docs only |
| Production AWS apply | **outside CXOS** | Human CFN / pipeline with scoped roles |
| “Is live safe to claim?” | `doctor --live` | Exit 1 if stack not ready |

---

## 7. Value by persona (summary table)

| Persona | Time saved | Risk reduced | Artifact they keep |
|---|---|---|---|
| P1 PM | Spec/demo prep | Off-policy journeys | Spec + report + tasks |
| P2 SA | Multi-target glue | Unreviewable “AI IaC” | CFN export + architecture docs |
| P3 Graph eng | Ad-hoc eval harness | Hub pollution | Ontology validate + tests |
| P4 Ops | Ticket drafting | Silent prod mutation | Proposals + remediations |
| P5 SRE | Stack guesswork | False “live” claims | Doctor + LaunchAgents |
| P6 Compliance | Evidence chase | Undocumented changes | APPLY.md + path/proposal trail |
| P7 PS/Partner | Per-account reinvention | Demo fail in room | Golden + per-cwd workspaces |
| P8 Facilitator | Curriculum build | Flaky live-only labs | Scripted modules |
| P9 QA | Manual regression | Silent hybrid flakiness | Offline e2e |
| P10 Exec | Status theater | Unowned automation risk | Scores + rollups (via Ops) |
| P11 CS | Policy-blind saves | Bad offers in prod | NBA + remediation notes |
| P12 Analyst | Glossary drift | Ambiguous intents | Ontology inventory |

---

## 8. Anti-personas (who should not use CXOS as primary tool)

| Anti-persona | Why not | Better fit |
|---|---|---|
| Fully autonomous “set and forget” bot owner | Product refuses silent prod mutation | Different control plane |
| Raw CloudFormation-only engineer with no CX domain | Ontology/NBA overhead without benefit | Direct IaC repos |
| Freeform creative chatbot product | Closed-world by design | Open chat stack |
| Real-time agent desktop UI user | CLI/ops system, not CCP replacement | Connect CCP / custom UI |

Clarifying anti-personas protects roadmap honesty and buyer fit.

---

## 9. Command cheatsheet by persona

| Need | Command |
|---|---|
| One-shot program | `cox cx run <name> "<idea>"` |
| Health + score | `cox cx status <name> [--live]` |
| Stack honesty | `cox cx doctor [--live]` |
| Propose work | `cox cx console <name> [--live]` |
| List work | `cox cx proposals <name>` / `cox cx tasks <name>` |
| Claim | `cox cx apply <name> <propId> [--resolve]` |
| Close | `cox cx task <name> <taskId> done` |
| AWS handoff | `cox cx export-aws <name> [outDir]` |
| Catalog | `cox cx ontology show\|validate\|graph` |
| NBA probe | `cox cx nba journey=… stage=… [k=v…]` |
| Always-on local | `scripts/macos/install-launchagents.sh` |
| Offline demo | `pnpm cx:golden` |

---

## 10. Expansion vectors (product depth still available)

Ranked by persona pull, not engineering curiosity:

1. **Multi-spec ops board** (`tasks` / `proposals` across all specs) — P4 P10  
2. **Richer path pretty-print by phase** on `run` mega-paths — P3 P8  
3. **Proposal urgency / age columns** — P4  
4. **CAB export bundle** (zip: CFN + remediations + proposal trail + report) — P6 P7  
5. **Pack authoring workflow** for LOB analysts — P12 P3  
6. **Read-only exec markdown report** (`cx brief <name>`) — P10  
7. **Muster/fleet hooks** for multi-agent delivery rooms — P7 P8  

These are intentional backlog signals, not commitments.

---

## 11. One-page narrative for stakeholders

> CXOS is how we **design, prove, and operate** customer experience programs
> without pretending a coding agent should own production. Product defines a
> gated spec. Architecture gets three targets from one design, including an AWS
> plan humans apply. Ops gets a proposal and task queue grounded in a closed
> ontology and health scores. Security gets an audit trail and a hard ban on
> silent cloud mutation. Partners and workshops get an offline golden path that
> still levels up to a live local stack when Ollama and the platform are ready.

---

## Related docs

| Doc | Role |
|---|---|
| [`CXOS.md`](./CXOS.md) | Technical north star and CLI/module map |
| [`WAVE2-SUMMARY.md`](./WAVE2-SUMMARY.md) | Operator stack (export, metrics, LaunchAgents) |
| [`WAVE3-SUMMARY.md`](./WAVE3-SUMMARY.md) | Path audit, daemon ticks, filters |
| [`WAVE4-SUMMARY.md`](./WAVE4-SUMMARY.md) | Claim edges, apply --resolve, task board |
| [`../examples/cx-demo/README.md`](../examples/cx-demo/README.md) | Runnable demo entry |
