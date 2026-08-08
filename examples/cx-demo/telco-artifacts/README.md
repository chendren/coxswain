# Telco synthetic design pack (neutral artifacts)

Generated offline via CXOS for a **typical communications service provider**
(mobile + broadband). Platform-neutral journey maps, personas, and architecture.

## Regenerate

From monorepo root:

```bash
CWD=$(mktemp -d)
pnpm cox --cwd "$CWD" cx run telco-core \
  "Typical telco mobile and broadband CX: billing disputes, network outages, plan upgrades, new line activation, and churn save" \
  --target artifacts
ls "$CWD/.cox/cx/telco-core/artifacts/"
```

Telco language in the idea string triggers the multi-journey pack
(`isTelcoIdea` in `@cox/cx-ops` `telco-design-pack.ts`).

## Contents

| Kind | Files |
|---|---|
| Journey maps (5) | `billing_dispute`, `technical_troubleshooting`, `churn_prevention`, `new_account_setup`, `service_upgrade` |
| Personas (4) | price-sensitive mobile, SME multi-line, fiber home, churn-risk postpaid |
| Taxonomy / NBA / KPI | `intentTaxonomy.json`, `nbaRuleSet.json`, `kpiFrame.json` |
| Architecture | `architectureDoc.json` (markdown body) |

## Next (full loop)

```bash
pnpm cox --cwd "$CWD" cx build telco-core --target all   # + local offline + AWS plan-only
pnpm cox --cwd "$CWD" cx export-aws telco-core
pnpm cox --cwd "$CWD" cx brief telco-core
```
