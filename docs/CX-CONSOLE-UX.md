# CX Graph Console — UX first (2026)

## Why this exists

Operators today get a static HTML dump or CLI. That breaks the CX promise: **see the closed world, act with evidence, never invent**. The Graph Console is the human-in-the-loop surface for Agentic GraphRAG ops (Capozzi/Helbing + NODES AI 2026): strong graph navigation, failure-aware routing, queue triage, intent grounding.

## Personas

| Persona | Job | Success |
|---------|-----|---------|
| **Ops lead** | Fleet health at a glance; daemons up; open work load | 10s scan, no drill unless red |
| **Triage agent** | Rank proposals by urgency/age; claim next best | One click path to evidence |
| **Graph investigator** | Multi-hop: domain → intent → journey; prove links | Path display + neighborhood map |
| **Design coach** | Utterance → closed intent (no invent) | Top-k intents with scores |
| **Auditor** | Reconstruct control path every action | `path[]` always visible |

## Jobs to be done (JTBD)

1. **When** I open the console, **I want** fleet totals + band colors, **so I** know if the day is green/yellow/red.
2. **When** work piles up, **I want** urgency-sorted proposals with age labels, **so I** pick high+stale first.
3. **When** a proposal cites an entity, **I want** graph neighborhood + shortest path, **so I** trust the closed world.
4. **When** a customer says free text, **I want** closed intent scores, **so I** never invent intent ids.
5. **When** something fails, **I want** the retrieval route (mode/risk/tools), **so I** know if the system refused invent.

## Information architecture

```
/                    →  redirect /console
/console             →  shell + Fleet home (default)
/console/fleet       →  Ops board cards + table
/console/queue       →  Proposals + tasks (urgency, ageDisplay)
/console/graph       →  Explorer: find | path | neighborhood SVG
/console/intent      →  Utterance → scoreIntents
/console/health      →  healthz + metrics summary band
/api/*               →  JSON (same data, for HTMX-free fetch)
/legacy              →  old single-page dashboard HTML
```

## UX principles

1. **Closed-world first** — UI never offers "create free id"; only search/resolve.
2. **Path is product** — every pane shows `control path: load_strong → … → emit`.
3. **Risk is visible** — retrieval `mode` + `risk` chip on graph/intent.
4. **Offline cathedral** — no CDNs, no fonts.google, no analytics. Localhost only.
5. **Keyboard ops** — `/` focuses search; `g f` fleet, `g q` queue, `g g` graph, `g i` intent.
6. **Progressive disclosure** — cards → table → drawer with path/evidence.
7. **Tone tokens** — statusTone/urgency/healthBand drive color, not decoration.

## Visual direction: "Nebula Ops"

Not generic purple SaaS. Think **night-shift control room**:

- Background: near-black navy `#070b14` with subtle radial glow
- Panels: glass `#0f1628` border `#1e2a4a`
- Accent primary: electric cyan `#3de7ff`
- Accent danger: coral `#ff6b6b`
- Accent warn: amber `#f5a524`
- Accent ok: mint `#3dd68c`
- Type: system UI sans + ui-monospace for uids/paths
- Graph edges: HAS_INTENT cyan, NEXT_STAGE amber, TRIGGERS mint
- Motion: 120ms ease only; respect prefers-reduced-motion

## Interaction model (graph-of-nodes)

User action → **intent router chip** → tool list → result with **path[]**.

Example Graph explorer:

1. Type query → `routeRetrieval` shows mode=closed_set_lookup risk=15
2. Select hit `domain:billing` → neighborhood k=2 SVG
3. Click node `intent:billing.payment_issue` → shortestPath highlight
4. Footer: `control: load_strong → route_retrieval → k_hop → shortest_path → emit`

## Empty / error / refuse states

| State | Copy | Action |
|-------|------|--------|
| No specs | "Fleet is empty. Run `cox cx init` or quickstart." | link to docs path |
| No path | "No path within max hops. Expand k or check uids." | bump max hops |
| Invent refuse | "Closed world refuses invent. Pick a catalog id." | show tools |
| API error | "Render failed: {msg}" | retry |

## Non-goals (v1)

- Auth / multi-user
- Live AWS mutation
- CDN chart libraries
- WebSocket streaming (poll/refresh only)
- Full ontology editor (read + score only)

## Success metrics

- Time to first triage decision < 15s
- Graph path found for known domain→intent 100% offline tests
- Zero external network requests in page HTML
- All API handlers unit-tested without browser

## Implementation (shipped)

Package: `@cox/cx-console`

| Surface | Path |
|---------|------|
| Fleet | `/console/fleet` |
| Queue | `/console/queue` |
| Graph explorer + SVG | `/console/graph` |
| Intent router | `/console/intent` |
| Health / stats | `/console/health` |
| JSON API | `/api/*` |
| Legacy HTML | `/legacy` |

Start: `pnpm cox cx serve --port 8787` then open `http://127.0.0.1:8787/console`

Build method: UX design → SPECs U1–U6 → local `qwen3-coder-next:q8_0` (shell/theme/pages/api/svg) → Grok recovery (types, server router, CLI wire).
