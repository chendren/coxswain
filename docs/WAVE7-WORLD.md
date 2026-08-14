# Wave7 — World (Tell + App)

**Date:** 2026-08-14  
**path[]:** `detect_pack → load_strong → harvest → resolve → persist_world → app_skin → emit`

Domain knowledge in someone's head becomes a living CX app. Complexity stays in the engine.

## Shipped (W1 + W2)

| Verb | Surface |
|------|---------|
| Tell | `cox cx world <name> "…how we work…"` → `.cox/cx/<name>/world/{TELL.md,wordmap.json,overlay.json}` |
| See | `cox cx app <name>` → `http://127.0.0.1:8787/app` (brand, I heard, journeys) |
| Today | `/app/today` one box + **I'll take this** (claim) / **Not that** (dismiss) |

Teach (W3) deferred until wordmap flywheel is used in anger.

## Laws held

- Unknown labels (`foo-bar-xyz`) are Teach candidates, never new intent ids
- Pack aliases come from vertical seeds (retail returns, etc.), not LLM invent
- Generic tokens (`support`) do not substring-match the default graph
- No CreateStack; I'll take this = existing `applyProposal`
- `/app` H1 is their brand, not Graph Console

## Tests

- `@cox/cx-world` tell tests (retail pack + no invent + healthcare detect)
- `@cox/cx-console` app skin tests

## Try

```bash
pnpm cox cx world clinic "Hospital: appointments, prior auth, claims, benefits. No PHI."
pnpm cox cx app clinic
```
