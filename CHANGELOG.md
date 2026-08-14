# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- World (Wave7): `cox cx world` offline Tell (pack + closed wordmap, no invent)
  and `cox cx app` domain-skinned `/app` + Today (I'll take this)
- Graph Console queue human-gate: Claim / Dismiss via POST
  `/console/queue/action` and `/api/proposal/action` (applyProposal /
  transitionProposal; actor from form or `CX_ACTOR`)
- Graph Console L4 polish: proposal evidence drawer (path/NBA), fleet day
  band, empty-state copy, queue path fields on work queue items
- Console proof suite: CDN-free HTML, path-audit footer, serve smoke
- Offline Graph Console E2E smoke (`pnpm cx:console:smoke`) and CI steps for
  console tests + HTTP claim after seed-operate
- Offline pack tests for registry + retail/financial/healthcare/travel seeds
  (journey count, architectureDoc, provenance, unique journey ids; healthcare
  PHI-shape guard on seed JSON)
- `docs/WAVE5-SUMMARY.md` / `docs/WAVE6-SUMMARY.md` enhancement waves

### Changed

### Fixed

### Security

## [0.1.0] - 2026-08-09

Initial public-facing release snapshot of Coxswain and the CX OS layer.

### Added

- Spec-driven coding agent (`cox`) with requirements / design / tasks gates
- Steering docs and lifecycle command hooks
- Three-tier model router (scout / builder / architect) with per-call cost
  announcements and append-only cost ledger
- Budget governor and evidence-based escalation
- Interactive TUI and non-interactive CLI composition root
- CX OS (`cox cx`): catalog, program build, observe, operate, fleet, govern
- Offline-first local bind and plan-only AWS export (`template.yaml` + `APPLY.md`)
- Human-gated operate loop (propose / claim / apply; no silent prod mutation)
- Vertical packs: retail, financial, healthcare, travel (+ pack registry)
- Offline golden path demo (`pnpm cx:golden:ci` / `examples/cx-demo`)
- Offline golden path terminal GIF/MP4 for README (`examples/cx-demo/offline-golden.*`)
- Optional live smoke guide (`docs/LIVE-SMOKE-M3.md`)
- Community skeleton: Apache-2.0 license, CoC, CONTRIBUTING, SUPPORT, issue
  and PR templates
- Branch protection on `main` requiring CI job `build`
- Softened release: Docker only on `v*` tags / manual dispatch (linux/amd64)

### Security

- Security policy and private vulnerability reporting path (`SECURITY.md`)
