# Why CX OS on Coxswain

**One sentence we refuse to dilute:** closed-world, offline-first, human-gated CX build-and-operate on a token-frugal local agent, with plan-only AWS.

---

## The problem

CX teams are stuck between three bad options:

| Failure mode | What buyers feel | Typical tools |
|---|---|---|
| **Slideware** | Journeys live in decks; nothing executable, nothing auditable | Design tools, whiteboard, generic LLM chat |
| **Unsafe automation** | Fear that a bot will rewrite Connect, create stacks, or mutate prod | Agent scripts, unattended deploy pipelines |
| **Demo friction** | Nothing works without a live AWS account, keys, and a golden region | Console-first demos, cloud-only sandboxes |

Coding agents alone solve implementation speed. Contact-center suites alone solve runtime administration. Neither closes the loop from **idea → closed design → multi-target build → gated operate → CAB handoff** with economics and audit you can defend in a change board.

Three concrete pains:

1. **Open-world drift.** Models invent journeys, remediations, and KPIs that are not in the enterprise catalog. Compliance and LOB owners cannot trust the output.  
2. **Blank-check tokens.** Flagship models burn the same rate on renaming a variable as on architecture. Workshops and design partners get surprise bills.  
3. **No govern path.** Even good prototypes die at CAB: no brief, no plan-only CFN, no remediation notes, no path audit, no proposal→task trail.

---

## Tenets (non-negotiable)

| # | Tenet | Customer-facing consequence |
|---|---|---|
| 1 | **No silent prod mutation** | Console/watch/daemon write proposals only; apply creates human-owned tasks |
| 2 | **AWS is plan-only** | `template.yaml` + `APPLY.md`; humans apply with scoped credentials |
| 3 | **Never CreateStack from Coxswain** | Product law, enforced in architecture and docs |
| 4 | **Offline-first** | Doctor, run, board, brief, cab-export work without keys or live stack |
| 5 | **Strong graph first** | Ontology, NBA, console routing are pure graph; weak models optional and constrained |
| 6 | **Receipts on screen** | Routing reasons, ledger, `path[]` audits, health history |
| 7 | **Human gates on phases** | Requirements / design / tasks approve before downstream unlock |
| 8 | **Import law** | Packages depend on frozen contracts; only `@cox/cli` is composition root |

### Tenet conflicts we already resolved

| Conflict | Decision |
|---|---|
| Speed vs safety | Offline speed + propose-only ops; never auto CreateStack |
| Domain depth vs generality | Domain-agnostic CXOS primary; TelcoCXOS as keyword-triggered **separate demo** |
| LLM creativity vs catalog truth | Weak generate allowed; NBA and console routing stay pure graph |
| One mega package vs many | Package splits with frozen `@cox/core` / `@cox/cx-core`; CLI wires |

---

## Economic story

### Why token frugality is a product feature

Every existing CLI agent that burns one flagship model on everything makes CX design sessions and workshops economically fragile. Coxswain treats model selection as a first-class, visible decision:

| Tier | Role | Typical use |
|---|---|---|
| `scout` | Cheap classify / explain / mechanical | Hooks, classification, simple edits |
| `builder` | Routine implementation | Spec tasks, tests, most operate summaries |
| `architect` | Requirements, design, review | Escalation target only when evidence demands |

**Ledger truth:** every call (including router classification) lands in append-only JSONL with tokens, cache reads, cost, tier, and reasons. Reports show **savings vs all-architect baseline** and cache savings. Budgets warn, degrade tiers, and hard-stop at 100% until a human extends.

**Offline is free by design.** Catalog, pack seed, multi-target offline adapters, board, brief, and CAB export do not require model keys. Workshops can run on zero dollars. Optional Ollama models price at $0 when mapped into a tier.

### Cost of the alternative

| Approach | Hidden cost |
|---|---|
| All-flagship coding agent | High token bill; no CX govern package |
| Cloud-only Connect lab | Account setup, IAM, demo fragility, no offline CAB story |
| Homegrown scripts | No import law, no fleet board, no audit path, no pack registry |
| Pure GraphRAG demo | Rarely human-gated ops + plan-only AWS + ledger economics together |

Unfair combination we protect: **strong graph + frugal agent + plan-only cloud + offline-first operate**, enforced as hard rules in code and docs.

---

## Anti-features (what we will not become)

Say these out loud so the product is not misread:

| Anti-feature | Why it is out of bounds |
|---|---|
| **Not a hosted contact-center SaaS** | Local-first OS + plan export; not multi-tenant runtime |
| **Not an auto-remediation bot for production Connect** | Propose only; humans own mutations |
| **Not "we call CreateStack for you"** | Plan-only AWS is the product promise |
| **Not open-world agent chaos with a CX skin** | Closed ontology packs; score-based pack detect |
| **Not invent freeform NBA without match** | Pure `matchNbaRules` / `recommendNba` over the pack |
| **Not require live AWS to show core value** | Offline golden path is CI and workshop truth |

### Explicit non-goals (v1)

- Auto CreateStack / live Connect mutation from Coxswain  
- Open-world freeform NBA without ontology match  
- Windows-first packaging  
- Full MCP marketplace as a launch gate  
- Subagent 8-way fan-out as a product guarantee  
- Claiming live multi-tenant SaaS CX platform status  

---

## Who hires this product

| Persona | Job to be done |
|---|---|
| CX PM | Shared language and gated programs that LOB will approve |
| Solutions Architect | Multi-target design + AWS plan they can hand a CAB |
| Ops / journey owner | Day-2 queue without silent prod write |
| Compliance / change | Audit trail, APPLY.md, no CreateStack surprise |
| AWS PS / partners | Offline workshop that still ends in a real CAB package |
| Graph / GenAI eng | Strong/weak boundary they can test and extend with packs |

---

## Success measures (design partner bar)

| Metric | Target shape |
|---|---|
| Time-to-healthy program | Idea → multi-target healthy offline in minutes for a trained user |
| Gate compliance | 100% of prod-facing mutations go through human claim/apply (by architecture) |
| CAB readiness | Brief + plan CFN export without rework on most partner runs |
| Offline demo success | Golden path without keys green in CI |
| Token savings | Material savings vs all-architect baseline on mixed sessions when models are used |

---

## Related docs

- [HOW-IT-WORKS.md](./HOW-IT-WORKS.md): layers, packages, E2E flow  
- [COMPARISON.md](./COMPARISON.md): vs agents and Connect-only tools  
- [ADOPTION.md](./ADOPTION.md): workshop, PS, LOB pilot paths  
- [PRFAQ-CXOS-Coxswain.md](./PRFAQ-CXOS-Coxswain.md): Working Backwards PRFAQ  
- [../README.md](../README.md): product landing  
