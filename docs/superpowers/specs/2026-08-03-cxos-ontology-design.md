# CXOS Ontology & Taxonomies (Deterministic Layer)

Date: 2026-08-03
Status: Approved (implementation in `@cox/cx-core`)

## Summary

CXOS gains a closed-world **ontology** that aggregates a series of
**taxonomies**. Model calls may select, map, and narrate inside that world.
Pure evaluators decide deterministically: NBA rule match, journey stage
transitions, confidence bands, and artifact validation.

Seed catalog: port of `cx-intelligence-slm/data/taxonomy.json` plus KPI and
channel closed sets. Local platform treasury journeys ship as a merge pack.

## Goals

- One importable `DEFAULT_ONTOLOGY` for intents, journeys, NBA rules,
  policies, KPIs, channels, sentiments, urgencies, and control-plane enums.
- Zero model calls for rule evaluation, stage transitions, and catalog
  integrity checks.
- Adapters stop hardcoding divergent vocabularies (`JOURNEY_TYPE_KEYS`,
  `REAL_KPI_KEYS`).

## Non-goals (v1)

- Constraining `cx-artifacts` generation prompts (helper exported only).
- Watcher / autonomous remediation wiring through `matchNbaRules`.
- CLI `cox cx ontology` commands.
- Replacing free-text `NbaRuleSet` artifact shape with only structured rules.

## Taxonomies

| Taxonomy | Catalog fields | Deterministic engine |
|---|---|---|
| Intent | `domains[]` → intents + exemplars | `getIntent`, `listIntentIds`, `validateArtifact` |
| Journey | `journeys[]` stages / triggers / terminals | `nextStages`, `isTerminalStage`, `journeysTriggeredBy` |
| NBA | `nbaRules[]` with typed conditions | `matchNbaRules` |
| Policy | `actionPolicies` | `confidenceBand`, `escalationChain` |
| KPI | `kpis[]` | `hasKpi`, KPI name validation |
| Channel / affect | `channels`, `sentiments`, `urgencies` | closed-set membership |
| Control plane | targets, capabilities, ops modes, artifact kinds | already in `target.ts` / `artifacts.ts` |

## Placement

```
packages/cx-core/src/ontology/
  catalogs/default.json
  catalogs/platform-local.json
  types.ts enums.ts ids.ts load.ts validate.ts evaluate.ts index.ts
```

Import law unchanged: `cx-*` packages import only `@cox/core` and
`@cox/cx-core`.

## Split of responsibility

- **Model**: propose design artifacts, match free text to ontology ids,
  write narrative architecture docs.
- **Ontology engines**: accept or reject ids, fire NBA rules, advance
  journeys, pick confidence bands.
- **Ops commands mode**: remains fully deterministic for status / simulate /
  teardown; report summary may use scout-tier narrative only.

## Extension packs

`mergeOntologies(base, pack)` unions by id (pack wins).
`LOCAL_PLATFORM_ONTOLOGY = merge(DEFAULT, platform-local)` adds treasury
journey types used by the local omnichannel platform without polluting the
commercial default.

## Testing

Offline pure-function tests for load integrity, NBA evaluation, journey
transitions, confidence bands, artifact validation, and merge packs.
