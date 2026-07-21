/**
 * Skeleton steering docs written by cli's `cox steer init`. Each starts with
 * an `inclusion: always` front matter block so the doc is used as-is until
 * the user (or an architect-tier fill pass) edits it.
 */

const product = `---
inclusion: always
---
# Product

## Purpose
<!-- One or two sentences: what does this product do and for whom? -->

## Users
<!-- Who uses this, and in what context? -->

## Core capabilities
<!-- The handful of things this product must do well. -->

## Non-goals
<!-- What's explicitly out of scope, so the agent doesn't wander there. -->
`;

const tech = `---
inclusion: always
---
# Tech

## Languages & runtime
<!-- Language(s), version(s), runtime/platform targets. -->

## Frameworks & key dependencies
<!-- The libraries that shape how code gets written here. -->

## Commands (build, test, run)
<!-- Exact commands: how to build, test, and run the project locally. -->

## Conventions
<!-- Style, naming, and structural rules the agent should follow. -->
`;

const structure = `---
inclusion: always
---
# Structure

## Directory layout
<!-- Top-level directories and what lives in each. -->

## Key modules
<!-- The modules/packages most changes will touch. -->

## Data flow
<!-- How data/requests move through the system, at a glance. -->

## Where new code goes
<!-- Rules of thumb for where to add new files/features. -->
`;

export const STEERING_TEMPLATES: Record<"product" | "tech" | "structure", string> = {
  product,
  tech,
  structure,
};
