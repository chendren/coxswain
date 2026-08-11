# CX Graph Autopilot

## Product

The next product leap after Graph Console: **closed-world operate from language**.

Operator (or agent) supplies a customer utterance and/or health signal. Autopilot:

1. Routes retrieval (never invent ids)
2. Scores closed-world intents
3. Recommends NBA from strong ontology
4. Opens a **human-gated proposal** with full graph control path
5. Never mutates adapters or production

## Control path

```
load_strong → route_retrieval → score_intents → resolve_nba_context
  → recommend_nba → compose_proposal → [persist|dry_run] → emit
```

## Surfaces

| Surface | Entry |
|---------|--------|
| Core | `@cox/cx-ops` `runGraphAutopilot` |
| CLI | `cox cx autopilot <spec> --utterance "..." [--apply]` |
| Console | `/console/autopilot` + `POST /api/autopilot` |

## Non-goals

- No silent claim/apply without human
- No LLM invent of intent/KPI ids
- No AWS mutation
