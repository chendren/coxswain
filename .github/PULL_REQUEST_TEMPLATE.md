## Summary

What does this PR change and why?

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Docs / community
- [ ] Refactor (no behavior change)
- [ ] CI / tooling
- [ ] Pack / vertical

## Hard rules checklist

Confirm none of these are weakened without explicit design callout:

- [ ] No silent production mutation
- [ ] AWS remains plan-only (no CreateStack / live CFN mutate from tool)
- [ ] Offline-first paths still work
- [ ] Strong graph first (models only where generation is allowed)
- [ ] Import law: `cx-*` only `@cox/core` + `@cox/cx-core`; CLI sole composition root

## How tested

- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm cx:golden:ci` (if CX OS surface touched)
- [ ] Other:

## Linked issues

Fixes #

## Notes for reviewers

Risks, rollout, follow-ups.
