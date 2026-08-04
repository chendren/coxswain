# Graph-Node AI Practice Sources (mid-2026)

## Core papers / talks

1. **Agentic GraphRAG: Navigating Unstructured Financial Data with Collaborative AI**  
   Capozzi & Helbing, arXiv:2605.18770 (Apr 2026)  
   - Phase 1: strong nodes from verified structured fields  
   - Phase 2: weak nodes via LLM JSON extraction (T=0)  
   - Phase 3: deterministic identity resolution (alphabetical hub keys, weak absorption)  
   - Analytical agent: intent router → bounded reflection loop → state-machine synthesis  
   - Tool-mediated graph access only (no free-form DB mutation)

2. **NODES AI 2026 — Agentic GraphRAG** (Neo4j)  
   Multi-agent schema inference, conflict resolution, failure-aware routing between vector and graph traversal, RAGAS-style diagnostics.

3. **Agentic Graph RAG as 2026 KM standard**  
   Dynamic strategy selection by query type (factual → vector; multi-hop → graph; aggregation → community summary); self-correct mid-query on low confidence.

4. **Graph-of-nodes agent frameworks (2026 field guides)**  
   LangGraph-class: nodes = steps, edges = transitions, shared state, checkpointing, human-in-the-loop. Prefer explicit graphs for production control over free-form multi-agent chat.

## Mapping to implementation vocabulary

| Paper term | Implementation term |
|---|---|
| Strong node | Catalog entity / ontology id |
| Weak node | LLM-generated provisional label |
| NameHub / hub key | `hubKey()` alphabetical token join |
| Weak absorption | `absorbKpiFrame` / `absorbIntentTaxonomy` |
| Intent router | `routeClosedKinds` / tool allow-lists |
| Reflection loop | `runGraphNodePipeline` maxAttempts |
| State machine synthesis | Pipeline `path[]` + emit/fail |

## Evaluation tiers worth copying

- Graph integrity (`validateOntology`)
- Tool / path transition accuracy (pipeline `path` assertions)
- Entity-resolution precision (resolve/absorb tests)
- Answer quality only after structured retrieval succeeds
