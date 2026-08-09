# Comparison

How **CX OS on Coxswain** differs from coding agents, agent frameworks, and pure Amazon Connect tooling. Honest about what we borrow and what we own.

---

## Quick matrix

| Capability | **Coxswain + CX OS** | **Claude Code** | **Kiro** | **Copilot CLI** | **LangGraph-style frameworks** | **Pure Amazon Connect tooling** |
|---|---|---|---|---|---|---|
| Local terminal coding agent | Yes | Yes | Yes | Yes | DIY app, not a product CLI | No |
| Spec / requirements → design → tasks gates | Yes | Partial (plans) | Yes (native) | Limited | DIY | No |
| Steering / project memory docs | Yes (+ CLAUDE.md / AGENTS.md import) | CLAUDE.md | Steering docs | Copilot instructions | DIY | No |
| Lifecycle + agent hooks | Yes | Yes | Agent hooks | Limited | DIY | No |
| Multi-tier model routing with receipts | **First-class** (scout/builder/architect + ledger) | Single-model focus | Limited | Model choice UX | DIY | N/A |
| Append-only cost ledger + savings baseline | Yes | No | No | No | DIY | N/A |
| Closed CX ontology packs | **Yes** (retail, financial, healthcare, travel + default) | No | No | No | DIY graph | Runtime config only |
| Multi-target CX build (artifacts / local / plan-only AWS) | **Yes** | No | No | No | DIY | Connect-centric only |
| Human-gated operate (propose → claim → task) | **Yes** | N/A | N/A | N/A | Rare / DIY | Admin consoles, live mutate |
| Plan-only AWS / never CreateStack from tool | **Product law** | N/A | N/A | N/A | Usually deploy-capable | Live console / CFN deploys |
| Offline golden path without keys | **Yes** (CI and workshops) | Needs provider keys for real work | Needs keys | Needs keys | Varies | Needs AWS account |
| Fleet board / queue / HTML dashboard | Yes (`cx board`, `queue`, `dashboard`) | No | No | No | DIY | Partial in other AWS consoles |
| CAB export (brief + plan CFN + remediations) | Yes (`cab-export`) | No | No | No | No | Manual assembly |
| Pure graph NBA (no freeform invent) | Yes | No | No | No | DIY | Rules engines vary |
| Path audit on ops surfaces | Yes (`path[]`) | N/A | N/A | N/A | DIY | CloudTrail / console history |
| Primary persona | CX PM, SA, ops, compliance, PS | Software engineer | Software engineer | Software engineer | Platform eng | CC admin / telephony eng |

---

## Vs Claude Code

**What we borrow:** agentic tool loop, permission modes, lifecycle hooks, CLAUDE.md-compatible project truth.

**What we own:**

- Visible three-tier routing with per-call reasons and cost  
- Append-only ledger and budgets with hard stop  
- Full CX OS surface (`pnpm cox cx …`) with closed packs and gated operate  
- Plan-only AWS CAB path as a first-class product, not a script you write later  

Claude Code is an excellent coding agent. It is not a Customer Experience Operating System.

---

## Vs Kiro

**What we borrow:** spec coding phases with approval gates, steering docs, agent-hook style automations.

**What we own:**

- Frugal routing and ledger economics as product surface, not an afterthought  
- CX domain packages, pack registry, multi-target adapters  
- Offline-first operate loop and fleet board  

Kiro-shaped planning inside a coding agent is necessary but not sufficient for CAB-safe CX programs.

---

## Vs Copilot CLI

**What we borrow:** `explain` / `suggest` one-shots and the idea that model choice is user-facing.

**What we own:** full session agent loop, specs, hooks, routing ledger, and the entire CX OS stack.

Copilot CLI is a productivity CLI for developers. Coxswain is that class of tool **plus** a domain OS for CX programs.

---

## Vs LangGraph-style frameworks

Frameworks (LangGraph and similar) are **libraries for building** agent apps. Coxswain is a **shipped product CLI** with:

- Frozen monorepo contracts and import law  
- Offline adapters tested without network  
- Vertical packs with detect scoring  
- Govern packages (brief, audit, cab-export) operators can open tomorrow  

You *could* rebuild CX OS on a framework. You would re-implement routing policy, offline adapters, CAB packaging, pack registry, and human gates. This repo is that product surface already wired.

---

## Vs pure Amazon Connect tooling

Connect admin consoles, CDK/CFN samples, and contact-flow editors solve **runtime** configuration in AWS. They do not:

- Start from a natural-language idea into a closed ontology program offline  
- Produce multi-target design (neutral artifacts + local bind + plan) in one session  
- Run a propose-only day-2 loop with fleet board and CAB export  
- Keep model economics honest while designing  

CX OS **exports** plan-only CloudFormation for humans to apply. It deliberately does **not** replace Connect as a runtime or call CreateStack for you.

| Connect-world need | CX OS answer |
|---|---|
| Design journeys offline for LOB review | Artifacts + catalog + brief |
| Hand change board a package | `cab-export` (MANIFEST, BRIEF, plan CFN, remediations) |
| Avoid surprise prod mutation | Propose-only console; never CreateStack |
| Live contact-center runtime | Out of band: human apply + existing AWS ops |

---

## What we are not claiming

- That Claude Code / Kiro / Copilot are "worse coding agents" for pure software work  
- That LangGraph cannot express similar graphs (it can; productization differs)  
- That Connect tooling is unnecessary (it remains the production runtime plane)  
- That Coxswain auto-heals production contact centers  

Our unfair combination is **strong graph + frugal agent + plan-only cloud + offline-first operate**, enforced as hard rules.

---

## Related docs

- [WHY.md](./WHY.md)  
- [HOW-IT-WORKS.md](./HOW-IT-WORKS.md)  
- [ADOPTION.md](./ADOPTION.md)  
- [../README.md](../README.md)  
