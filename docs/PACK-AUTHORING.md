# Pack authoring

How to add or extend a **vertical design pack** for CX OS. Packs turn idea text into closed-world journeys, personas, and architecture artifacts offline, without inventing open-world remediations.

Shipping packs today: **retail**, **financial**, **healthcare**, **travel**, plus **default** ontology fallback. **Telco** scoring exists in the registry and a rich seed lives as a legacy path in `cx-ops` for the separate TelcoCXOS demo. Prefer domain-agnostic packs for the primary product.

---

## What a pack is

| Piece | Responsibility |
|---|---|
| **Registry keywords** | `scorePack` / `detectPack` map idea strings → `PackId` |
| **Seed function** | Deterministic `CxArtifact[]` (journeys, personas, architecture, …) |
| **Wiring** | Offline artifacts adapter calls the seed when pack wins |
| **Tests** | Keyword scoring + seed shape offline (no network, no keys) |

Packs import only `@cox/core` and `@cox/cx-core` (import law). They must not import other `@cox/*` packages.

---

## Package layout

Each vertical pack is a workspace package under `packages/`:

```text
packages/cx-pack-<vertical>/
  package.json          # name: @cox/cx-pack-<vertical>
  tsconfig.json
  tsconfig.build.json
  src/
    index.ts            # export seed<Vertical>DesignPack(...)
  test/                 # optional but recommended
    pack.test.ts
```

### package.json skeleton

```json
{
  "name": "@cox/cx-pack-retail",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "build": "tsc -p tsconfig.build.json",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@cox/core": "workspace:*",
    "@cox/cx-core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0"
  },
  "files": ["dist"]
}
```

Ensure the package is included in the pnpm workspace (`pnpm-workspace.yaml` already covers `packages/*`).

### Seed function shape

Mirror existing packs (`cx-pack-retail`, `cx-pack-financial`, …):

```typescript
import type {
  CxArchitectureDoc,
  CxArtifact,
  CxSpec,
  JourneyMap,
  CxOntology,
} from "@cox/cx-core";

function prov(specName: string) {
  return {
    specName,
    phase: "design" as const,
    targetId: "artifacts" as const,
  };
}

export function seedExampleDesignPack(
  spec: CxSpec,
  _ontology: CxOntology,
): CxArtifact[] {
  const p = prov(spec.state.name);
  const journeys: JourneyMap[] = [
    {
      kind: "journeyMap",
      id: "primary_journey",
      provenance: p,
      name: "Primary Journey",
      stages: [
        {
          id: "initiated",
          name: "Initiated",
          description: "Customer starts the journey",
          touchpoints: ["app", "web", "chat"],
        },
        // …
      ],
    },
  ];
  // Add personas, architecture doc, intent/KPI frames as needed
  return [...journeys /*, ...personas, architecture */];
}
```

Rules of thumb:

- Use stable `id` values (snake_case) that LOB can recognize.  
- Every artifact needs `provenance` with `specName`, `phase`, `targetId`.  
- Prefer ontology-aligned touchpoints and journey stages; do not invent production mutators.  
- Healthcare: no PHI in ontology or seed text.  
- Keep seeds **deterministic** (offline golden path depends on it).

---

## Registry: detectPack scoring

Registry package: `@cox/cx-pack-registry` → `packages/cx-pack-registry/src/index.ts`.

### PackId and keywords

```typescript
export type PackId =
  | "default"
  | "retail"
  | "telco"
  | "financial"
  | "healthcare"
  | "travel";

const PACK_KEYWORDS: Record<PackId, string[]> = {
  default: [],
  retail: ["retail", "returns", "loyalty", "pickup", /* … */],
  financial: ["bank", "fraud", "loan", /* … */],
  healthcare: ["appointment", "claims", "HIPAA", /* … */],
  travel: ["booking", "flight", "disruption", /* … */],
  telco: ["telco", "mobile", "broadband", /* … */], // separate demo
};
```

### Scoring algorithm (current)

1. Lowercase the idea text.  
2. For each non-default pack, count keyword hits.  
3. `score = matched.length / min(5, keys.length)`, boost if ≥2 matches, clamp to `[0, 1]`.  
4. `detectPack` returns the top pack if `score ≥ 0.3`, else `"default"`.  
5. `default` always scores `0.1` as a floor, never wins on ties above threshold.

```typescript
export function scorePack(text: string, packId: PackId): PackScore;
export function detectPack(text: string): PackId;
export function listPacks(): PackId[];
```

### Adding a new PackId

1. Extend `PackId` union.  
2. Add a keyword list (prefer distinctive terms; avoid stealing other packs' core words).  
3. Export remains the same; callers use `detectPack`.  
4. Add unit tests for:

   - Your pack wins on representative idea strings  
   - Adjacent packs do not steal (e.g. retail idea should not score telco ≥ 0.3)  
   - Ambiguous short strings fall back to `default`  

### Keyword design tips

| Do | Don't |
|---|---|
| Include 8-20 domain terms LOB actually uses | Rely on a single generic word like `customer` alone |
| Prefer multi-match wins (boost at 2+) | Overlap heavily with telco demo keywords if you want domain-agnostic demos |
| Test real workshop idea strings | Assume models will fix bad detection |

---

## Wire seed into offline artifacts

Composition happens in `packages/cx-ops/src/offline-artifacts.ts` (CLI composition root may also import packs; follow existing pattern):

```typescript
import { detectPack } from "@cox/cx-pack-registry";
import { seedRetailDesignPack } from "@cox/cx-pack-retail";
// import { seedExampleDesignPack } from "@cox/cx-pack-example";

function seedArtifacts(spec: CxSpec, ontology: CxOntology, preferTelco = true): CxArtifact[] {
  const idea = /* requirements text + name */;
  const pack = detectPack(idea);

  if (pack === "retail") return seedRetailDesignPack(spec, ontology);
  if (pack === "financial") return seedFinancialDesignPack(spec, ontology);
  if (pack === "healthcare") return seedHealthcareDesignPack(spec, ontology);
  if (pack === "travel") return seedTravelDesignPack(spec, ontology);
  // if (pack === "example") return seedExampleDesignPack(spec, ontology);

  // telco legacy demo path when pack === "telco"
  // else default single-journey offline seed
}
```

Also update `packages/cx-ops/package.json` (or cli) workspace dependency if the package is new, and rebuild:

```bash
pnpm install
pnpm --filter @cox/cx-pack-example build
pnpm --filter @cox/cx-ops typecheck
pnpm --filter @cox/cx-ops test
```

Only `@cox/cli` (and the packages already allowed to compose) should pull adapters together. Do not create cross-adapter imports.

---

## Tests

### Registry tests

```typescript
import { detectPack, scorePack } from "@cox/cx-pack-registry";
import { describe, expect, it } from "vitest";

describe("detectPack", () => {
  it("selects retail for returns and loyalty language", () => {
    const idea =
      "National retail brand: returns and refunds, loyalty program, store pickup";
    expect(detectPack(idea)).toBe("retail");
    expect(scorePack(idea, "retail").score).toBeGreaterThanOrEqual(0.3);
  });

  it("falls back to default for generic short text", () => {
    expect(detectPack("hello")).toBe("default");
  });
});
```

### Seed tests

```typescript
import { seedRetailDesignPack } from "@cox/cx-pack-retail";
import { DEFAULT_ONTOLOGY } from "@cox/cx-core";
// minimal CxSpec fixture with state.name

it("emits journey maps with provenance", () => {
  const arts = seedRetailDesignPack(spec, DEFAULT_ONTOLOGY);
  const journeys = arts.filter((a) => a.kind === "journeyMap");
  expect(journeys.length).toBeGreaterThan(0);
  for (const j of journeys) {
    expect(j.provenance.specName).toBe(spec.state.name);
    expect(j.provenance.targetId).toBe("artifacts");
  }
});
```

### Golden path smoke (manual or script)

```bash
pnpm cox --cwd /tmp/pack-demo cx run pack-demo \
  "<idea string with your keywords>" \
  --target artifacts
# inspect .cox/cx/pack-demo/artifacts/ for seeded journeys
```

CI should keep package tests offline: no network, no API keys.

---

## Checklist for a new vertical pack

1. [ ] Create `packages/cx-pack-<id>/` with seed export  
2. [ ] Extend `PackId` + `PACK_KEYWORDS` in `@cox/cx-pack-registry`  
3. [ ] Wire `detectPack` branch in offline artifacts seed path  
4. [ ] Add workspace dependency edges where composition happens  
5. [ ] Registry + seed unit tests green  
6. [ ] Manual `cx run` offline with representative idea string  
7. [ ] Document journeys and keywords in this file or pack header comment  
8. [ ] Confirm telco demo keywords still do not steal domain-agnostic workshop scripts  

---

## Anti-patterns

| Anti-pattern | Prefer |
|---|---|
| Open-world freeform journeys from LLM as the only seed | Deterministic seed; optional weak generate absorb later |
| Pack imports `cx-ops` or sibling adapters | Only `@cox/core` + `@cox/cx-core` |
| Silent CreateStack or live Connect calls in a pack | Never; packs are design seeds only |
| Keywords so broad every idea hits your pack | Distinctive multi-keyword scoring + tests |
| PHI or secrets in seed data | Synthetic labels only |

---

## Reference packs (read these first)

| Pack | Package | Seed export | Example journeys |
|---|---|---|---|
| Retail | `@cox/cx-pack-retail` | `seedRetailDesignPack` | returns_refunds, loyalty_program, store_pickup, … |
| Financial | `@cox/cx-pack-financial` | `seedFinancialDesignPack` | account_inquiry, fraud_alert, loan_support, … |
| Healthcare | `@cox/cx-pack-healthcare` | `seedHealthcareDesignPack` | appointment, claims, prior_auth, benefits, … |
| Travel | `@cox/cx-pack-travel` | `seedTravelDesignPack` | booking, disruption, loyalty, checkin, … |
| Registry | `@cox/cx-pack-registry` | `detectPack`, `scorePack` | scoring only |

Telco rich multi-journey seed: `packages/cx-ops/src/telco-design-pack.ts` (demo path, not the primary domain-agnostic narrative).

---

## Related docs

- [HOW-IT-WORKS.md](./HOW-IT-WORKS.md)  
- [ADOPTION.md](./ADOPTION.md)  
- [CXOS-COMPLETE.md](./CXOS-COMPLETE.md)  
- [04-CONVENTIONS.md](./04-CONVENTIONS.md)  
