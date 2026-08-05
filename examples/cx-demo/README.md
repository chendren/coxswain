# CXOS demo (graph-node operating loop)

End-to-end Customer Experience Operating System flow using **strong-graph**
adapters. Default is fully offline (no live AWS or platform required).

## Golden path (script)

```bash
# offline
./examples/cx-demo/golden-path.sh

# live platform + OpenAI/XAI weak generate when keys present
./examples/cx-demo/golden-path.sh --live
```

## Offline (always works)

```bash
pnpm cox cx doctor
pnpm cox cx ontology validate
pnpm cox cx ontology graph

pnpm cox cx new billing-dispute "reduce dispute handle time"
pnpm cox cx approve billing-dispute requirements
pnpm cox cx build billing-dispute --target all   # auto-approves design after artifacts

pnpm cox cx status billing-dispute
pnpm cox cx simulate billing-dispute --target local
pnpm cox cx report billing-dispute
pnpm cox cx console billing-dispute
pnpm cox cx watch billing-dispute --ticks 3
pnpm cox cx daemon start billing-dispute --live   # detached long-running watch
pnpm cox cx daemon status billing-dispute
pnpm cox cx daemon stop billing-dispute
pnpm cox cx proposals billing-dispute
pnpm cox cx nba journey=churn_prevention stage=cancel_requested confidence=0.9

pnpm cox cx teardown billing-dispute
```

Artifacts land under `.cox/cx/billing-dispute/`.

## Hybrid / live (platform on :3143)

```bash
# 1) Ollama — required for /api/health/ready → status ready + ollama:true
ollama serve &
ollama pull nomic-embed-text   # embeddings check (required for ready)
ollama pull nemotron-mini      # optional LLM enrichment

# 2) Nexus CX platform
cd ~/Projects/cx-platform/omnichannel-cx-platform && npm start

# 3) Verify ready (HTTP 200, ollama:true)
curl -s http://127.0.0.1:3143/api/health/ready

# 4) Live CXOS
pnpm cox cx doctor --live --base-url http://127.0.0.1:3143
pnpm cox cx build billing-dispute --live --base-url http://127.0.0.1:3143 --target all
pnpm cox cx status billing-dispute --live --base-url http://127.0.0.1:3143
# expect: local: healthy
```

`cox.config.json` (optional):

```json
{
  "cx": {
    "targets": {
      "local": { "baseUrl": "http://127.0.0.1:3143" }
    },
    "defaultOpsMode": "console",
    "budgets": { "cxOpsUsd": 5 }
  }
}
```

## Graph path

```
compose: load_config → probe_platform → route adapters (live|offline)
build:   plan/build/deploy(artifacts) → merge_design → local → aws
console: load_strong → poll_status → intent_route → recommend_nba → propose (gated)
```
