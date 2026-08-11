# Graph-Node AI Wave (2026-08-10)

## Practice (current as of Aug 2026)

Industry convergence on **Agentic GraphRAG + graph-of-nodes control**:

1. **Strong nodes** from verified catalogs (never LLM-invented ids)
2. **Weak nodes** from unstructured extraction (provisional)
3. **Deterministic identity resolution** (hub keys, absorb with provenance)
4. **Failure-aware retrieval routing** (graph multi-hop vs closed-set vs refuse invent)
5. **Multi-hop traversal** for entity-centric investigation
6. **Zero-shot intent routing** over closed intent taxonomy
7. **Multi-tier eval** (resolution F1, routing accuracy, path grounding)
8. **Agent control path** recorded as explicit node list for audit

Primary refs: Capozzi & Helbing arXiv:2605.18770; NODES AI 2026 Agentic GraphRAG;
Decoding AI agentic GraphRAG memory; arXiv:2604.09666 (when GraphRAG still wins).

## Coxswain delivery (this wave)

| ID | Module | Package |
|----|--------|---------|
| B1 | Multi-hop traverse / shortestPath / k-hop | `@cox/cx-core` |
| B2 | Failure-aware retrieval router | `@cox/cx-core` |
| B3 | Weak memory + absorb provenance | `@cox/cx-core` |
| B4 | Closed-world intent scoring | `@cox/cx-core` |
| B5 | Multi-tier eval protocol | `@cox/cx-core` |
| B6 | Journey multi-hop / neighborhood / intent APIs | `@cox/cx-journey` |

Build method: Grok SPECs → local `qwen3-coder-next:q8_0` agent → pnpm verify → Grok recovery only when needed.

## CLI surface (zero model)

```
cox cx graph-find "payment" --pack default
cox cx graph-path domain:billing intent:billing.payment_issue --pack default
cox cx graph-neighborhood domain:billing -k 2 --pack default
cox cx intent-route My payment failed and I was double charged --pack default
```

Failure-aware `routeRetrieval` is printed on `graph-find` (mode, risk, tools).
