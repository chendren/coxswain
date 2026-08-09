# SuperHeavy Plan: Open-Source Release Readiness

# Coxswain + CX OS

| Field | Value |
|---|---|
| **Document type** | SuperHeavy gap map + phased enhancement plan |
| **Goal** | Public OSS release where strangers instantly understand **what it is**, **what it does for them**, **how it works**, **why it is extremely different**, and **why they should adopt** |
| **Date** | 2026-08-09 |
| **Engine repo** | `chendren/coxswain` (private) |
| **Fleet repo** | `chendren/CXOS` (private) |
| **Demo vertical** | `chendren/TelcoCXOS` (private) |
| **Related** | `PRFAQ-CXOS-Coxswain.md` / `.pdf` |

---

## 1. Executive verdict

**Product capability is far ahead of public readiness.**

You already have a real dual product:

1. **Coxswain** (`cox`): token-frugal, spec-driven coding agent with visible three-tier routing and a ledger.
2. **CX OS** (`cox cx …`): closed-world, offline-first, human-gated Customer Experience Operating System (catalog → build → operate → fleet → govern), plan-only AWS.

That combination is rare and defensible. What is **not** release-ready is the **public surface**: private repos, red CI, no license, no discoverability, fragmented story across three repos, and docs written for the builder (you), not for a cold visitor in 90 seconds.

**Release bar:** a stranger can clone, run the offline golden path in under 10 minutes, explain the five hard rules, and decide to adopt without a briefing from you.

---

## 2. Current GitHub status (as of 2026-08-09)

### 2.1 Repository inventory

| Repo | Visibility | License | Topics | Homepage | Issues / PRs | Releases | Discussions / Pages |
|---|---|---|---|---|---|---|---|
| `coxswain` | **Private** | **None** | **None** | **None** | 0 / 0 | **0** | Off / Off |
| `CXOS` | **Private** | **None** | **None** | **None** | 0 / 0 | **0** | Off / Off |
| `TelcoCXOS` | **Private** | **None** | **None** | **None** | 0 / 0 | **0** | Off / Off |

| Signal | coxswain | CXOS |
|---|---|---|
| Created | 2026-07-22 | 2026-08-09 |
| Language | TypeScript | Shell (workspace) |
| Description | Present (agent-focused) | Present (workspace-focused) |
| Local `main` vs `origin` | **Ahead 2** (travel pack + test stabilize) | **Ahead 2** (holiday + travel-core) |
| Untracked assets | Architecture PNG/SVG, PRFAQ | Architecture pack, PRFAQ, some runtime jsonl |

### 2.2 CI / quality gates (blocker)

| Workflow | Latest (main) | Root cause |
|---|---|---|
| **CI** | **Failure** | `pnpm typecheck` parallel: packages cannot resolve `@cox/core` types (`TS2307 Cannot find module '@cox/core'`). Typecheck runs before a topological build of workspace packages. |
| **Release** (changesets) | **Failure** | Same typecheck cascade. |
| **Scorecard** (OSSF) | **Failure** | Private-repo permission: `Resource not accessible by integration` on ListCommits GraphQL. Expected until public + token scopes. |

Local machine (your tree):

- Typecheck: **green** (linked workspace + prior builds).
- Tests: **1 package fail** (`@cox/cli`): 2 assertions in `cx-runtime.test.ts` expect doctor live exit code `1`, received `0`.
- Other packages: pass (25/26 package test jobs).
- `cox doctor --offline`: fails without `ANTHROPIC_API_KEY` (correct for "keys missing"; awkward for "offline demo is first-class" messaging).

**Implication:** opening the repo today would show **red badges** and fail first-time CI. That is a hard launch blocker.

### 2.3 Product surface already shipped (strength)

| Layer | Evidence |
|---|---|
| Coding agent | Spec/steering/hooks/TUI/router/ledger; ~26 packages; 114 test files |
| CX OS layers | Catalog, program, observe, operate, fleet, govern, fabric (documented + CLI) |
| Vertical packs | Retail, financial, healthcare, travel (+ registry); telco demo separate |
| Fleet workspace | 6 programs under `CXOS/.cox/cx/` (core, fin, health, travel, holiday-returns, starter) |
| Hard rules | Encoded in docs and operate path: no silent mutation, plan-only AWS, offline-first, strong graph, import law |
| Security posture start | `SECURITY.md`, Dockerfile, SBOM path, scorecard workflow (not yet green) |
| Demo/scripts | `examples/cx-demo` golden path, multi-program, runbook, personas doc |

### 2.4 OSS hygiene checklist

| Item | Status |
|---|---|
| LICENSE | **Missing** all repos |
| CONTRIBUTING.md | **Missing** |
| CODE_OF_CONDUCT.md | **Missing** |
| CHANGELOG / Keep-a-Changelog | **Missing** |
| Public ROADMAP | Embedded in README only; not issue-linked |
| npm package publish | Root `private: true`; changesets present but broken on CI |
| Install story | From source via `tsx` / `pnpm cox`; no binary, no `npx`, no Homebrew |
| Docs site | None (no Pages, no Docusaurus/VitePress) |
| Architecture in-repo | Local only / untracked in places; PRFAQ exists |
| Personal machine paths | Present in a few docs/NOTES (`/Users/chadhendren/...`) |
| Secrets in git | None found; `.env` gitignored |
| Branch protection / required checks | Not verified; scorecard already complains about private access |

### 2.5 Narrative gap (why people will bounce)

Cold visitor sees either:

- **Agent README** (routing, ledger, Kiro/Claude Code comparisons), with CXOS as a section, **or**
- **Workspace README** (73 lines) that assumes `COXSWAIN_ROOT` and private clone paths.

They do **not** yet get a single landing narrative:

> "This is the open-source **Customer Experience Operating System** powered by a **token-frugal coding agent**. Closed world. Offline first. Human-gated. Plan-only cloud. Receipts on every model call."

Without that, the product looks like "another coding CLI" or "internal workshop files," not a category-defining OSS system.

---

## 3. Positioning (what strangers must learn in 90 seconds)

### 3.1 What it is

**Coxswain + CX OS** is a local-first system that turns a CX idea into a multi-target, auditable program and runs a human-gated operate loop, while treating model spend as a first-class, visible decision.

| Product | One line |
|---|---|
| **Coxswain** | Spec-driven coding agent with scout/builder/architect routing and a cost ledger. |
| **CX OS** | Closed-world CX build + operate OS on top of Coxswain (`cox cx`). |
| **Together** | Design once, build three targets, operate with proposals (never silent prod), hand CAB/AWS plans to humans. |

### 3.2 What it will do for them

| Job | Outcome |
|---|---|
| CX PM / SA | Idea → gated program + journey/KPI/NBA artifacts in one session |
| Ops / Journey owner | Health → proposal → claim → task → done with audit trail |
| Compliance / Change | Plan-only CFN + APPLY.md + CAB package; no CreateStack from the tool |
| PS / workshop | Offline golden path without keys or cloud |
| Platform eng | Token savings with receipts; budgets; cache-aware prompts |

### 3.3 How it works (one diagram worth of words)

```text
Idea string
  -> Pack registry (retail / fin / health / travel / default / telco)
  -> Spec gates (requirements -> design -> tasks)
  -> Build: artifacts -> local bind -> AWS plan-only
  -> Observe: doctor / status / simulate / report
  -> Operate: console proposes only -> human claim/apply -> tasks
  -> Fleet: board / queue / dashboard
  -> Govern: brief / audit / snapshot / cab-export
Engine underneath: router + ledger + agent loop + steering + hooks
```

### 3.4 Why it is extremely different

| Everyone else | You |
|---|---|
| One flagship model for everything | Tiered routing with **receipts and savings math** |
| Open-world agents invent journeys | **Closed ontology** + pure NBA match |
| Demo dies without cloud/keys | **Offline-first** adapters and golden path |
| Automation writes prod | **Propose-only** ops; **never CreateStack** from Coxswain |
| Chat transcript as system of record | Spec workspace + audit path + CAB package |
| Coding agent **or** contact-center suite | **Both loops** in one composition root |

**Five hard rules (quoteable brand):**

1. No silent production mutation  
2. AWS is plan-only  
3. Offline-first  
4. Strong graph first  
5. Import law (CLI sole composition root)

### 3.5 Why they should adopt

1. **Trust** for regulated CX and CAB boards (human gates + plan-only cloud).  
2. **Speed** from idea to healthy multi-target program offline.  
3. **Economics** with visible tier routing and ledger savings.  
4. **Teachability** for workshops and PS (golden path, runbooks, packs).  
5. **Architecture honesty**: strong graph for control; models only where generation is allowed.

---

## 4. Gap matrix (ranked for OSS launch)

Score: **P0** launch-blocking · **P1** first-week trust · **P2** growth · **P3** later.

| ID | Gap | Priority | Why it matters |
|---|---|---|---|
| G01 | CI red: typecheck cannot resolve `@cox/core` | **P0** | Public main must be green |
| G02 | Local CLI test flake/fail (doctor exit codes) | **P0** | CI coverage gate will fail after typecheck fixed |
| G03 | No LICENSE | **P0** | Not legally open source |
| G04 | Repos private | **P0** | Nobody can see it |
| G05 | No CONTRIBUTING / CoC / security entry path for strangers | **P0** | OSSF + contributor trust |
| G06 | Split brain: 3 private repos, weak story linking | **P0** | Confusion on "what do I clone?" |
| G07 | Hero narrative missing (landing README + one-pager) | **P0** | 90-second comprehension |
| G08 | Install friction (clone monorepo, no binary/npx) | **P1** | Time-to-first-success |
| G09 | Offline doctor fails when Anthropic key missing | **P1** | Contradicts offline-first promise |
| G10 | CHANGELOG + semver release + GitHub Release notes | **P1** | Adoption and upgrades |
| G11 | Docs site / architecture gallery not published | **P1** | "How it works" for non-CLI readers |
| G12 | Scorecard + branch protection for public repo | **P1** | Security reputation |
| G13 | Personal paths scrubbed from docs | **P1** | Professional OSS polish |
| G14 | Unpushed commits + untracked diagrams | **P1** | Public tree incomplete |
| G15 | npm publish strategy (or explicit "from source only") | **P1** | Install expectations |
| G16 | Comparison page vs Claude Code / Kiro / Copilot / LangGraph / Connect | **P1** | Differentiation |
| G17 | Recorded terminal demos (VHS/asciinema) + GIF in README | **P1** | Instant understanding |
| G18 | Issue templates + good first issues | **P2** | Community bootstrap |
| G19 | Windows support or explicit non-support | **P2** | Support load |
| G20 | Pack authoring guide ("add a vertical in one day") | **P2** | Ecosystem growth |
| G21 | MCP later, binary packaging, subagent fan-out | **P3** | Roadmap, not launch |

---

## 5. SuperHeavy program: parallel lanes to OSS-ready

Same pattern as prior SuperHeavy waves: **Map → mass-parallel Build lanes → Verify integrator → Release gate**.

### 5.1 North-star exit criteria (Definition of Done for public launch)

1. **Green CI** on public `main` (typecheck, build, tests, offline golden path, doctor offline success without paid keys).  
2. **Apache-2.0 or MIT** LICENSE on all public repos; SPDX in package.json.  
3. **One hero README** (coxswain) + thin CXOS companion README that points up.  
4. **90-second story** above the fold: what / for whom / hard rules / 4-command demo.  
5. **Offline golden path** documented and CI-enforced: `cx run` + board + cab-export without API keys.  
6. **Architecture pack** committed (3 diagrams + PRFAQ link).  
7. **CONTRIBUTING + CoC + SECURITY** + issue templates.  
8. **v0.1.0 GitHub Release** with CHANGELOG, install, and known limitations.  
9. **Topics + description + homepage** set for discoverability.  
10. **No red lies:** M3 live smoke either done or clearly "optional live" not "GA incomplete."

### 5.2 Phase 0 — Integrity (serial, 1–2 days)

**Lane 0A — CI topology fix**

- Change typecheck to: build `@cox/core` (+ `@cox/cx-core`) first, then recursive typecheck; **or** use project references; **or** `pnpm -r --filter ...^...` order.
- Ensure CI installs with frozen lockfile and fails closed on audit (policy choice).
- Bump Actions Node 20 → 22 LTS before Node 20 hard-fail on runners.

**Lane 0B — Test truth**

- Fix `cx-runtime.test.ts` doctor exit-code contract (either restore exit 1 when live stack down, or update tests + docs intentionally).
- Make `cox doctor --offline` return 0 when keys are absent but offline path is healthy (warn on missing keys; do not fail the offline promise).
- Add CI step: `pnpm cx:golden` (or `examples/cx-demo/golden-path.sh`) with keys scrubbed.

**Lane 0C — Push hygiene**

- Push local ahead commits for coxswain + CXOS.
- Commit architecture SVG/PNG + PRFAQ (md + pdf) into `docs/`.
- Scrub `/Users/chadhendren` paths from NOTES/docs.

**Gate:** `pnpm typecheck && pnpm test && pnpm build` green locally **and** on GitHub Actions.

### 5.3 Phase 1 — Legal & community skeleton (parallel)

| Lane | Deliverable |
|---|---|
| **1A License** | Choose **Apache-2.0** (recommended for graph/enterprise adoption clarity) or MIT; apply monorepo-wide + CXOS + TelcoCXOS |
| **1B Community files** | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant), `SECURITY.md` already exists (public-friendly rewrite), `SUPPORT.md` |
| **1C Templates** | `.github/ISSUE_TEMPLATE/` (bug, feature, pack request), `PULL_REQUEST_TEMPLATE.md`, `GOOD_FIRST_ISSUES.md` |
| **1D Changelog** | `CHANGELOG.md` from 0.1.0; changesets wired to real versioning |

### 5.4 Phase 2 — Narrative SuperHeavy (parallel; this is the adoption engine)

| Lane | Deliverable | Answers |
|---|---|---|
| **2A Hero README rewrite** | coxswain README: above-the-fold positioning, hard rules, 4-command demo, architecture thumbnail, "not another coding agent" section | What / do for me / different / adopt |
| **2B WHY.md** | 2-page essay: problem, tenet table, economic story, anti-features | Why adopt |
| **2C HOW-IT-WORKS.md** | Seven-layer OS + engine package map + E2E flow; embed architecture PNGs | How it works |
| **2D COMPARISON.md** | Matrix vs Claude Code, Kiro, Copilot CLI, generic agent frameworks, pure Connect tooling | Extremely different |
| **2E ADOPTION.md** | Paths: workshop, PS engagement, internal LOB pilot, pack extension | Why / how to start |
| **2F CXOS README** | Companion: "this is a fleet workspace; engine lives in coxswain"; link golden path |
| **2G Demo media** | 20–35s real CLI recording (offline holiday or billing path) + README GIF | Instant comprehension |
| **2H Website stub** | Optional GitHub Pages or single `docs/index.html` landing with diagrams | Discoverability |

**Copy constraints (non-negotiable):**

- Lead with **CX OS outcomes**, not only agent cleverness.  
- State hard rules in the first screen.  
- Never claim live CreateStack or silent prod remediation.  
- Offline demo is the default hero path.

### 5.5 Phase 3 — Product enhancements that make OSS credible (parallel)

These are **significant** enhancements (not just docs). Each lane is package-scoped like prior SuperHeavy.

| Lane | Enhancement | Rationale for OSS |
|---|---|---|
| **3A Offline-first doctor** | Doctor modes: offline / hybrid / live with correct exit codes; keys optional offline | First command success |
| **3B `cox cx quickstart`** | One command: init + sample idea + board + print next steps | Time-to-value |
| **3C Install story** | Documented: (1) from source, (2) optional `npm i -g` when packages public, (3) Docker image for workshops | Multiple entry points |
| **3D Pack SDK** | `docs/PACK-AUTHORING.md` + template package `cx-pack-template` + registry checklist | Ecosystem |
| **3E Public sample workspace** | Slim `examples/cx-workspace` or keep CXOS public with **sanitized** committed specs (no personal audit noise) | "What will it do" concrete |
| **3F Guardrails demo** | Explicit test that CreateStack is never called; proposal-only console invariant tests | Trust differentiation |
| **3G Ledger showcase** | Fixture session + `cox ledger` report in README showing savings % | Economic differentiation |
| **3H Telemetry off-by-default** | Document no phoning home; optional anonymous stats later | OSS trust |
| **3I Windows note** | Official: macOS/Linux supported; Windows experimental or WSL-only | Support clarity |
| **3J SBOM + provenance** | Green release workflow; attach SBOM to GitHub Release | Enterprise adopters |

### 5.6 Phase 4 — Discoverability & launch ops

| Lane | Work |
|---|---|
| **4A Repo settings** | Public; topics: `customer-experience`, `cx`, `ai-agents`, `cli`, `ontology`, `amazon-connect`, `offline-first`, `typescript`; homepage URL |
| **4B Single entry** | Decision: **Primary public repo = coxswain** (engine + CX). CXOS and TelcoCXOS public as companions **or** fold sample workspace into `examples/`. Prefer **one primary** to avoid split attention. |
| **4C Release v0.1.0** | Tag, notes, known limitations, link PRFAQ + architecture |
| **4D Launch kit** | Short blog / LinkedIn / X thread: problem → hard rules → 4 commands → diagram |
| **4E Scorecard** | Re-run OSSF after public; fix branch protection, pinned actions, code review |
| **4F Community seed** | 5–10 labeled good-first-issues (docs typos, pack copy, tests) |

### 5.7 Recommended repo topology for launch

**Option A (recommended): Engine-primary**

```text
chendren/coxswain          PUBLIC  -- product monorepo (agent + CX OS packages)
  examples/cx-demo         offline golden path
  examples/workspaces/*    optional sample fleets
chendren/CXOS              PUBLIC  -- optional "full fleet" companion (or archive later)
chendren/TelcoCXOS         PUBLIC  -- vertical demo (or examples/telco)
```

**Option B: Umbrella org/README only** if you want a fourth meta-repo later.

Do **not** launch three equal-weight repos without a clear "start here."

---

## 6. SuperHeavy execution workflow (agent lanes)

Suggested mass-parallel blast after Phase 0 is green (mirrors `cxos-superheavy.rhai`):

| Wave | Parallel jobs |
|---|---|
| **Map** | Read-only inventory of README/docs gaps; generate issue backlog G01–G21 |
| **Build-Docs** | Hero README, WHY, HOW, COMPARISON, ADOPTION, PACK-AUTHORING |
| **Build-Legal** | LICENSE, CoC, CONTRIBUTING, templates |
| **Build-Product** | doctor offline, quickstart, invariant tests, pack template |
| **Build-Media** | Architecture commit, demo tape, dashboard screenshot |
| **Build-CI** | typecheck order, golden path job, Node 22, release notes |
| **Verify** | Full test+build; run golden path; scorecard dry-run; README link check |
| **Release** | Public flip checklist; tag v0.1.0; announce |

Workflow file to add: `.grok/workflows/oss-release-superheavy.rhai` (Map / Build parallel / Verify).

---

## 7. Messaging kit (paste-ready)

### 7.1 Elevator (25 words)

> Coxswain runs CX OS: closed-world, offline-first customer experience programs with human-gated ops, plan-only AWS, and model routing that shows the receipts.

### 7.2 GitHub About blurb

> Spec-driven, token-frugal coding agent + Customer Experience Operating System. Closed ontology. Offline demos. Propose-only ops. Plan-only AWS. Never silent prod mutation.

### 7.3 README hero section outline

1. Badge row: CI, license, node, coverage  
2. One-liner + hard rules chips  
3. GIF/terminal demo  
4. "Who it's for" table  
5. 4-command quickstart (offline)  
6. How it works (diagram)  
7. Why different (comparison table)  
8. Architecture links  
9. Contributing  
10. Roadmap / non-goals  

### 7.4 Anti-positioning (say this so you are not misread)

- Not a hosted contact-center SaaS.  
- Not an auto-remediation bot for production Connect.  
- Not "we call CreateStack for you."  
- Not open-world agent chaos with a CX skin.

---

## 8. Risks if you open-source too early

| Risk | Mitigation |
|---|---|
| Red CI on day one | Phase 0 gate |
| Framed as "yet another agent CLI" | Hero narrative + CX OS lead |
| Support load from Windows / live AWS expectations | Explicit support matrix + hard rules |
| License ambiguity kills enterprise trial | Apache-2.0 early |
| Personal paths / workshop cruft | Scrub + sanitize examples |
| Scorecard fails publicly | Fix branch protection after public |

---

## 9. Suggested timeline

| Week | Focus | Outcome |
|---|---|---|
| **W0** | Phase 0 integrity | Green CI, fixed doctor/tests, pushed trees |
| **W1** | Phase 1 + 2 narrative | Legal files + hero docs + media |
| **W2** | Phase 3 product polish | quickstart, pack template, invariant tests, install path |
| **W3** | Phase 4 launch | Public repos, v0.1.0, scorecard pass path, announce |

Aggressive: W0–W1 only if CI is fixed first and docs SuperHeavy runs in parallel after.

---

## 10. Immediate next actions (ordered)

1. **Fix CI typecheck order** (G01) and **doctor/test contracts** (G02, G09).  
2. **Push** unpushed commits; commit architecture + PRFAQ.  
3. **Add LICENSE (Apache-2.0 recommended)** + CONTRIBUTING + CoC.  
4. **Rewrite coxswain README** as the hero landing (Section 7.3).  
5. **Decide topology** (engine-primary recommended).  
6. **Tag v0.1.0** only after green CI + offline golden path in CI.  
7. **Flip public** + topics + Release notes + short launch post.

---

## 11. Success metrics post-launch (30 days)

| Metric | Target |
|---|---|
| Stars / forks | Directional only; not vanity primary |
| Golden path issues | < 3 "could not run offline" bugs |
| Time-to-first `cx board` green (external) | < 15 minutes median (survey or support) |
| Docs PRs | At least a few community doc fixes |
| Pack interest | 1 external pack attempt or pack-request issue |
| CI | Remain green on main |

---

## 12. Document control

| Version | Date | Notes |
|---|---|---|
| 0.1 | 2026-08-09 | Initial SuperHeavy OSS plan from live GitHub + local audit |

**Evidence sources:** `gh` repo/workflow/run logs for `chendren/coxswain|CXOS|TelcoCXOS`; local typecheck/test; docs and architecture pack; prior SuperHeavy wave summaries.

**Companion docs:** `PRFAQ-CXOS-Coxswain.md`, `CXOS-ARCHITECTURE.*`, `COXSWAIN-ARCHITECTURE.*`, `COMBINED-ARCHITECTURE.*`.
