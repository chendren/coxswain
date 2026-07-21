# @cox/steering — notes for the integrator

Implements `SteeringStore` (`createSteeringStore`), `steeringWarnings`, and
`STEERING_TEMPLATES` per `docs/specs/steering-hooks/{requirements,design}.md`.
All 19 requirement ids (R1.1–R4.4) are covered by tests; see
`test/coverage.test.ts` for the automated sweep.

## Dependencies

Only the sanctioned exceptions: `yaml` (front matter) and `picomatch`
(globs), both already listed in docs/04-CONVENTIONS.md's allowlist for this
package. No further additions.

## Interpretation notes (spec didn't fully pin these down)

- **Empty front matter block is valid, not an error.** `---\n---\nbody`
  parses the enclosed YAML to `null`/`undefined` (an empty YAML document).
  `parseFrontMatter` treats that as `data: {}` (valid, no fields) rather
  than folding it into the R1.4 "parse failure" fallback — only a thrown
  parse error, or a non-object result (scalar/array), triggers
  `data: null` + full-raw-body. Rationale: an empty-but-present block is a
  normal "just use the defaults" case, not a malformed doc a user needs a
  warning about.
- **Missing `inclusion` key vs. an invalid `inclusion` value are different
  outcomes.** A validly-parsed front matter block with no `inclusion` key
  at all defaults to `"always"` and still uses the *stripped* body (same
  as R1.3's spirit, just via a present-but-sparse block). Only an
  `inclusion` key holding a value that isn't `"always"|"fileMatch"|"manual"`
  triggers R1.4's stronger fallback (full raw body, nothing stripped) —
  the reasoning being that once we've seen a value we don't understand, we
  no longer trust our own stripping of that block either.
- **Token-count formatting** in `steeringWarnings` uses `~<k>k` (e.g.
  `~3.1k`, exact multiples of 1000 drop the decimal: `~2k`), matching
  design.md's example string but not otherwise specified by any R-id — this
  is cosmetic and safe to change without touching selection behavior.

## Determinism

`select()` is a pure function of its inputs (no fs access) and sorts with
`localeCompare(name, "en")` throughout, so system/context doc ordering is
byte-stable across calls given the same input docs — this is what makes the
assembled system prompt cache-friendly per docs/01's prefix-caching
discipline. The `picomatch` matcher cache inside `createSteeringStore` is a
performance detail only; it doesn't affect output.
