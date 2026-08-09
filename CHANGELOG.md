# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
