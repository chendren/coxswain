import type { SteeringSelection } from "@cox/core";
import { describe, expect, it } from "vitest";
import { parseFrontMatter } from "../src/frontmatter";
import { createSteeringStore, steeringWarnings } from "../src/store";
import { STEERING_TEMPLATES } from "../src/templates";
import { makeConfig, makeDoc } from "./helpers";

function selectionOf(
  systemDocs: SteeringSelection["systemDocs"],
  contextDocs: SteeringSelection["contextDocs"] = [],
): SteeringSelection {
  return {
    systemDocs,
    contextDocs,
    totalTokens: [...systemDocs, ...contextDocs].reduce((sum, d) => sum + d.tokens, 0),
  };
}

describe("steeringWarnings", () => {
  it("R4.1: warns when a selected doc's tokens exceed warnTokens, naming the doc and its count", () => {
    const big = makeDoc({ name: "tech", tokens: 2500 });
    const selection = selectionOf([big]);

    const warnings = steeringWarnings(selection, 2000);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("tech");
    expect(warnings[0]).toContain("2.5k");
  });

  it("R4.1: does not warn when every doc's tokens are within the threshold", () => {
    const doc = makeDoc({ name: "tech", tokens: 1000 });
    const selection = selectionOf([doc]);

    expect(steeringWarnings(selection, 2000)).toEqual([]);
  });

  it("R4.1: checks contextDocs as well as systemDocs", () => {
    const doc = makeDoc({ name: "onDemand", inclusion: "manual", tokens: 3000 });
    const selection = selectionOf([], [doc]);

    const warnings = steeringWarnings(selection, 2000);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("onDemand");
  });

  it("R4.2: warns on total selection weight exceeding 2x warnTokens even when no single doc exceeds warnTokens", () => {
    const docs = [0, 1, 2, 3, 4].map((i) => makeDoc({ name: `doc${i}`, tokens: 900 }));
    const selection = selectionOf(docs);

    const warnings = steeringWarnings(selection, 2000);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("4.5k");
  });

  it("R4.2: does not warn on total weight at or below 2x warnTokens", () => {
    const docs = [makeDoc({ name: "a", tokens: 2000 }), makeDoc({ name: "b", tokens: 2000 })];
    const selection = selectionOf(docs);

    expect(steeringWarnings(selection, 2000)).toEqual([]);
  });

  it("R4.1+R4.2: a single oversized doc produces both a per-doc and a total warning", () => {
    const huge = makeDoc({ name: "huge", tokens: 5000 });
    const selection = selectionOf([huge]);

    const warnings = steeringWarnings(selection, 2000);

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("huge");
    expect(warnings[1]).toContain("selection totals");
  });

  it("R4.3: oversized docs remain in the selection returned by select() — warn, don't drop", () => {
    const store = createSteeringStore({ config: makeConfig() });
    const big = makeDoc({ name: "huge", inclusion: "always", tokens: 5000 });

    const selection = store.select([big], [], []);

    expect(selection.systemDocs.map((d) => d.name)).toEqual(["huge"]);
    expect(steeringWarnings(selection, 2000)).toHaveLength(2);
  });
});

describe("STEERING_TEMPLATES", () => {
  it("R4.4: exports exactly product, tech, and structure, each starting with the always front matter block", () => {
    expect(Object.keys(STEERING_TEMPLATES).sort()).toEqual(["product", "structure", "tech"]);
    for (const key of ["product", "tech", "structure"] as const) {
      expect(STEERING_TEMPLATES[key].startsWith("---\ninclusion: always\n---")).toBe(true);
    }
  });

  it("R4.4: each template parses as valid front matter with inclusion:always", () => {
    for (const key of ["product", "tech", "structure"] as const) {
      const { data } = parseFrontMatter(STEERING_TEMPLATES[key]);
      expect(data).toEqual({ inclusion: "always" });
    }
  });

  it("R4.4: product template contains the design's section headings", () => {
    const t = STEERING_TEMPLATES.product;
    for (const heading of ["Purpose", "Users", "Core capabilities", "Non-goals"]) {
      expect(t).toContain(heading);
    }
  });

  it("R4.4: tech template contains the design's section headings", () => {
    const t = STEERING_TEMPLATES.tech;
    for (const heading of [
      "Languages & runtime",
      "Frameworks & key dependencies",
      "Commands (build, test, run)",
      "Conventions",
    ]) {
      expect(t).toContain(heading);
    }
  });

  it("R4.4: structure template contains the design's section headings", () => {
    const t = STEERING_TEMPLATES.structure;
    for (const heading of ["Directory layout", "Key modules", "Data flow", "Where new code goes"]) {
      expect(t).toContain(heading);
    }
  });
});
