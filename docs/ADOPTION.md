# Adoption paths

How teams put CX OS on Coxswain to work: workshops, AWS Professional Services engagements, line-of-business pilots, and vertical pack extension. All paths respect the hard rules: offline-first, propose-only ops, plan-only AWS (never CreateStack).

---

## Path overview

| Path | Audience | Time box | Primary outcome |
|---|---|---|---|
| **Workshop** | Partners, facilitators, mixed CX/SA audience | Half day to 1 day | Offline golden path + CAB package in hand |
| **PS engagement** | AWS PS / SI delivery | 1-2 weeks design partner | Customer-scoped workspace + plan-only handoff |
| **LOB pilot** | CX PM + journey owner + compliance | 2-6 weeks | One production-adjacent program with gates and audit |
| **Pack extension** | Graph / GenAI eng, domain SMEs | Days to weeks | New or deeper vertical pack in registry |

Repos:

| Repo | Role |
|---|---|
| [chendren/coxswain](https://github.com/chendren/coxswain) | Engine (`cox` CLI, packs, adapters) |
| [chendren/CXOS](https://github.com/chendren/CXOS) | Domain-agnostic fleet workspace (primary) |
| TelcoCXOS (separate) | Telco **demo** only (keyword-triggered pack) |

---

## 1. Workshop (offline-first)

### Goals

1. Prove the product without API keys or an AWS account.  
2. Teach strong graph vs weak generate, and propose-only operate.  
3. Leave with a CAB-shaped folder participants can show a change board.

### Prerequisites

- Node ≥ 20, pnpm  
- Clone coxswain, `pnpm install`  
- Optional: clone CXOS and set `COXSWAIN_ROOT`  
- Optional later: Ollama for zero-dollar live model tiers  

### Facilitator script (about 90 minutes)

| Block | Commands / activity | Teaching point |
|---|---|---|
| **0. Doctor** | `pnpm cox doctor --offline` | Offline is the default truth |
| **1. Catalog** | `pnpm cox cx catalog`, `journeys`, `ontology validate` | Closed world, no invent |
| **2. Run** | `pnpm cox cx run core "retail returns, loyalty, pickup…" --target all` | Pack detect → multi-target healthy |
| **3. Fleet** | `pnpm cox cx board`, `dashboard ./ops.html` | Multi-program operate surface |
| **4. Operate** | `operate` → `proposals` → `claim` → `task … done` | Humans own mutations |
| **5. Govern** | `brief`, `cab-export`, open `APPLY.md` | Never CreateStack from Coxswain |
| **6. Contrast** | Mention TelcoCXOS only as **separate demo** | Domain-agnostic primary vs vertical demo |

### Success criteria

- [ ] Golden path completes without network  
- [ ] Board shows at least one healthy multi-target program  
- [ ] CAB folder contains MANIFEST, BRIEF, `aws/template.yaml`, `aws/APPLY.md`  
- [ ] Participants can state the five hard rules from memory  

### Failure modes to pre-empt

| Symptom | Fix |
|---|---|
| Telco pack triggered by accident | Use retail/financial language; avoid mobile/broadband keywords in domain-agnostic demos |
| Expectation of live Connect change | Re-read APPLY.md; restate propose-only |
| "Where is the model?" | Offline path is intentional; keys optional for weak generate |

Workshop demo tracks also live under [examples/cx-demo/README.md](../examples/cx-demo/README.md).

---

## 2. Professional Services engagement

### Goals

Deliver a **customer-scoped** CXOS workspace and a CAB-ready program without taking production write access into the tool.

### Engagement shape

| Phase | Work | Artifact |
|---|---|---|
| **Discover** | Journeys, KPIs, channels, compliance constraints | Mapping to default ontology + pack choice |
| **Stand up** | `COXSWAIN_ROOT` + customer CXOS clone or fork | Offline doctor green |
| **Program** | `cx run <name> "…"` for priority journey set | Multi-target healthy offline |
| **Govern** | Brief + cab-export; customer IAM reviews APPLY.md | Human CFN apply plan |
| **Operate practice** | Console/claim/task dry run on offline or local stack | Runbook for journey owners |
| **Handoff** | Snapshot, audit trail, pack extension backlog | Design-partner notes |

### Guardrails for PS

1. **Never** put long-lived customer cloud credentials into Coxswain for CreateStack. Plan-only export only.  
2. Prefer customer-owned git for `.cox/cx/**` program state.  
3. Live local platform and model keys are optional; do not block CAB on them.  
4. Keep TelcoCXOS demos separate from domain-agnostic customer programs.  
5. Record path audits and audit.jsonl as evidence, not as a substitute for CAB process.

### Suggested customer kickoff commands

```bash
export COXSWAIN_ROOT=~/coxswain
cd ~/customer-cxos   # or ~/CXOS
pnpm cox cx doctor --offline
pnpm cox cx run pilot-core \
  "Customer experience for <LOB>: <journey list without inventing prod mutators>" \
  --target all
pnpm cox cx board
pnpm cox cx brief pilot-core ./brief-pilot.md
pnpm cox cx cab-export pilot-core ./cx-cab/pilot-core
```

---

## 3. Line-of-business pilot

### Goals

One LOB owns a real program under `.cox/cx/<name>/` for 2-6 weeks: design gates, day-2 proposals, CAB package for a real change window.

### Roles

| Role | Owns |
|---|---|
| CX PM | Requirements approve, brief language, KPI selection |
| Journey owner | Claim/apply, task close, remediation notes |
| Solutions architect | Multi-target design review, APPLY.md with security |
| Compliance / change | CAB package acceptance criteria |
| Graph / platform eng | Pack deltas, doctor, stack health if live local used |

### Pilot checklist

**Week 0**

- [ ] Engine install + offline doctor  
- [ ] Program name and idea string agreed (pack keywords intentional)  
- [ ] Hard rules briefed to every role  

**Week 1**

- [ ] `cx run` multi-target healthy offline  
- [ ] Catalog review: journeys, NBA, KPIs match LOB language  
- [ ] Approve design gates if extending beyond golden path  

**Weeks 2-3**

- [ ] Day-2 operate drill: console → claim → task done  
- [ ] Optional daemon watch in non-prod only (still propose-only)  
- [ ] Brief refreshed for leadership  

**Weeks 4-6**

- [ ] CAB export for a real or dry-run change board  
- [ ] Human CFN apply (if any) outside Coxswain with scoped credentials  
- [ ] Retro: pack gaps, ontology deltas, training needs  

### Exit criteria

| Criterion | Measure |
|---|---|
| Gate compliance | No prod mutation attributed to Coxswain CreateStack or silent apply |
| CAB readiness | Package accepted or revised with written feedback |
| Operator fluency | Journey owner can run claim/task without facilitator  
| Economics | If models used, ledger reviewed once for tier mix |

---

## 4. Pack extension path

When the default or shipping packs do not match LOB language, extend rather than freeform invent.

### Lightweight (idea + seed only)

1. Add keywords to `@cox/cx-pack-registry` scoring.  
2. Add or extend `seed*DesignPack` journeys/personas/architecture.  
3. Wire detect branch in offline artifacts seed path.  
4. Tests: score ordering + seed artifact kinds offline.  

Full authoring guide: [PACK-AUTHORING.md](./PACK-AUTHORING.md).

### Heavier (ontology + NBA)

1. Extend ontology pack (intents, KPIs, NBA rules) in `cx-core` or pack-local ontology.  
2. Keep NBA pure match; do not invent open-world remediations.  
3. Validate with `ontology validate` and graph-find.  
4. Document LOB-facing journey names in pack README or CXOS workspace docs.

### Decision: new pack vs deepen retail/financial/healthcare/travel

| Signal | Prefer |
|---|---|
| Same vertical, more journeys | Deepen existing pack |
| New regulated vocabulary and journeys | New pack id + registry keywords |
| One-off customer wording only | Customer workspace steering + idea string, not a public pack |

---

## Recommended first 15 minutes (any path)

```bash
git clone https://github.com/chendren/coxswain.git && cd coxswain
pnpm install
pnpm cox doctor --offline
pnpm cox --cwd /tmp/cx-demo cx run retail-demo \
  "National retail CX: returns and refunds, loyalty, store pickup, order support, retention" \
  --target all
pnpm cox --cwd /tmp/cx-demo cx board
pnpm cox --cwd /tmp/cx-demo cx cab-export retail-demo
```

Then open [WHY.md](./WHY.md) for the story and [HOW-IT-WORKS.md](./HOW-IT-WORKS.md) for the layers.

---

## Related docs

- [PACK-AUTHORING.md](./PACK-AUTHORING.md)  
- [COMPARISON.md](./COMPARISON.md)  
- [CXOS-OPERATOR-RUNBOOK.md](./CXOS-OPERATOR-RUNBOOK.md)  
- [CXOS-PERSONAS-USE-CASES.md](./CXOS-PERSONAS-USE-CASES.md)  
- [../examples/cx-demo/README.md](../examples/cx-demo/README.md)  
