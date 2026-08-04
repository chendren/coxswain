---
name: graph-node-ai
description: >
  Apply the 2026 Graph-Node AI development practice (Agentic GraphRAG +
  graph-of-nodes agent control) when building closed-world knowledge systems,
  ontologies, taxonomies, CXOS, GraphRAG, strong/weak node pipelines, identity
  resolution, or deterministic agent steps. Use when the user mentions graph
  nodes, strong/weak nodes, Agentic GraphRAG, hub keys, closed-world catalogs,
  ontology absorption, or runs /graph-node-ai.
---

# Graph-Node AI Development Practice (2026)

## What this is

The July–August 2026 production pattern for knowledge-heavy AI systems:

1. **Strong nodes** — deterministic entities from verified structured catalogs (ontologies, registries, schemas). Never invented by an LLM.
2. **Weak nodes** — LLM extractions from unstructured text, always provisional.
3. **Deterministic identity resolution** — absorb weak into strong via strict hub keys (no fuzzy merge by default).
4. **Agent as a graph of nodes** — steps are nodes, transitions are edges, shared state is threaded; LLM only runs inside designated weak/generate nodes.
5. **Intent routing** — restrict tools / closed sets before the agent acts (prevent tool overload).
6. **Bounded reflection** — failed generate/parse/validate retries with feedback, hard max attempts.
7. **Failure-aware routing** — choose graph traversal vs vector vs closed-set validation by risk and query type; never free-form invent when a closed world exists.

Primary references (practice, not vendor lock-in):
- Capozzi & Helbing, *Agentic GraphRAG* (arXiv:2605.18770, 2026): strong/weak nodes, hub resolution, intent router, reflection loop, state machine synthesis.
- NODES AI 2026 Agentic GraphRAG: schema-aware multi-agent construction + adaptive retrieval.
- LangGraph-class orchestration: explicit node/edge control flow with checkpointable state.

## When to use

- Building or extending **ontologies / taxonomies** for agents
- **CXOS**, contact-center, registry, compliance, or any **closed-vocabulary** domain
- Designing **RAG** that must not hallucinate entity ids
- Refactoring free-text LLM outputs into **executable rules** or stage machines
- Creating **skills or packages** that mix model calls with deterministic engines

## Non-negotiable rules

1. **Model proposes within the closed world; engines decide.**
2. Never let an LLM invent domain ids, intent ids, KPI keys, journey types, or action types when a catalog exists.
3. Prefer **pure functions** for match/validate/traverse/absorb (unit-testable offline).
4. **Strict hub keys** for identity (token sort). Add fuzzy only as an explicit later pack with audit.
5. **Import law**: catalog package has no provider/agent deps; adapters inject `generate`.
6. **Bounded retries** (default 2–4). After max, fail loud with path + issues.
7. **Provenance**: every weak→strong absorb should be reconstructible (what label mapped to which uid).

## Implementation recipe

### Step A — Catalog (strong world)

Ship a versioned catalog (JSON or TS) with:

| Taxonomy | Required fields |
|---|---|
| Intent | domain.id → intent.id, name, description, exemplars |
| Journey | id, stages[{id, nextStages}], terminalStages, triggerIntents |
| NBA | id, priority, conditions[{field, op, value}], logic, action, actionType, urgency |
| Policy | confidenceBands, escalationChains |
| KPI | id, unit, description |
| Channel / affect | closed enums |

Export `DEFAULT_ONTOLOGY` + `mergeOntologies(base, pack)` for industry/platform packs.

### Step B — Materialize strong graph

```
buildStrongGraph(ontology) →
  nodes: domain|intent|journey|stage|kpi|nba_rule|…
  edges: HAS_INTENT|TRIGGERS|HAS_STAGE|NEXT_STAGE|…
  hubs: hubKey → [uids]
```

`hubKey(name)`: lowercase, keep alphanumerics as tokens, sort tokens, join.
Example: `"Doe, John"` and `"John Doe"` → same key; middle initial does **not** merge.

### Step C — Weak extraction (LLM node only)

- Prompt **includes closed-id lists** (`ontologyPromptConstraint`).
- Temperature 0 / JSON-only when possible.
- Parse + shape-check before graph touch.
- Do **not** write free ids to durable store until resolve/absorb succeeds.

### Step D — Resolve + absorb

```
resolveLabel(graph, kind, rawLabel)
  1) exact kind:id
  2) hub key among kind
  3) case-insensitive name among kind
  else reject
```

Absorb rewrites artifacts to strong ids; drop unresolved closed-set members.
If absorb empties a required set that had inputs → **fail** (do not silently emit empty truth).

### Step E — Control-flow graph

Implement an explicit path (names can vary):

```
load_strong → route_kind → generate_weak → parse_weak
  → resolve_identity → validate_closed_world
  → absorb | fail | retry(generate_weak)
  → recommend_nba? → emit
```

Record `path[]` and `errors[]` on state for audit (dashboard / doctor / tests).

### Step F — Deterministic ops

Expose pure ops with **zero** model calls:

- `matchNbaRules(ontology, context)` / `recommendNba`
- `nextStages` / `isTerminalStage` / `journeysTriggeredBy`
- `confidenceBand(score)`
- `validateOntology` / `validateArtifact`

Scout-tier narrative is optional **after** structured result exists.

## Hard vs soft closed-world

| Artifact / output | Policy |
|---|---|
| Intent taxonomy, KPI frames, executable NBA | **Hard** — must resolve to strong ids |
| Journey design maps, personas, architecture prose | **Soft** — narrative OK; prefer links to strong ids |
| Ops status / simulate / teardown | **Hard deterministic** |
| Ops report summary text | Soft scout-tier only |

## Coxswain reference implementation

In `coxswain` monorepo (`@cox/cx-core`):

| Module | Role |
|---|---|
| `src/ontology/catalogs/default.json` | Strong catalog seed |
| `src/ontology/graph.ts` | `buildStrongGraph`, `hubKey` |
| `src/ontology/resolve.ts` | weak→strong absorb |
| `src/ontology/pipeline.ts` | `runClosedWorldPass`, `runGraphNodePipeline`, `recommendNba` |
| `src/ontology/evaluate.ts` | pure NBA / stages / bands |
| `cx-artifacts` | ontology-constrained prompts + absorb on build |

Tests that prove the practice: `packages/cx-core/test/ontology-*.test.ts`.

When extending CXOS, **import these modules**; do not re-hardcode vocabularies in adapters.

## Checklist before claiming done

- [ ] Catalog loads and `validateOntology` is clean
- [ ] Strong graph stats match expected entity counts
- [ ] Hub key round-trip tests (order invariance, strictness)
- [ ] Weak invent-then-absorb test (unknown dropped / fail if all unknown)
- [ ] Pipeline path includes resolve + emit (or fail with errors)
- [ ] NBA recommendation pure and priority-sorted
- [ ] Adapter prompts contain closed ids for hard kinds
- [ ] No new hardcoded journey/KPI/intent lists outside ontology packs
- [ ] Offline unit tests green without network

## Anti-patterns

- Embedding free-text "conditions" as the only NBA representation with no executable graph rules
- Fuzzy entity merge without an audit trail
- Letting the model invent KPI names that `simulate()` cannot join
- Monolithic agent with every tool always available (no intent router)
- Unbounded retry loops on generate
- Putting `@cox/providers` imports into the catalog/graph package

## Skill outputs when invoked

1. Identify what should be **strong** vs **weak** in the user's domain.
2. Design or extend the catalog + graph edges.
3. Implement pure evaluators first; wire LLM last.
4. Add offline proofs (tests) before claiming the practice works.
5. Prefer merge packs over forking the default catalog.
