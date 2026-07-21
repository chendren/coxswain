import { describe, expect, it } from "vitest";
import { createSteeringStore } from "../src/store";
import { makeConfig, makeDoc } from "./helpers";

const store = createSteeringStore({ config: makeConfig() });

describe("select — systemDocs ordering", () => {
  it("R3.1: systemDocs contains exactly the inclusion:always docs", () => {
    const docs = [
      makeDoc({ name: "tech", inclusion: "always" }),
      makeDoc({ name: "fm", inclusion: "fileMatch", fileMatchPattern: "src/**" }),
      makeDoc({ name: "man", inclusion: "manual" }),
      makeDoc({ name: "product", inclusion: "always" }),
    ];

    const selection = store.select(docs, [], []);

    expect(selection.systemDocs.map((d) => d.name)).toEqual(["product", "tech"]);
  });

  it("R3.1: non-imported always docs (sorted by name) precede imported always docs (sorted by name)", () => {
    const docs = [
      makeDoc({ name: "zeta", inclusion: "always", imported: true }),
      makeDoc({ name: "alpha", inclusion: "always", imported: true }),
      makeDoc({ name: "structure", inclusion: "always", imported: false }),
      makeDoc({ name: "beta", inclusion: "always", imported: false }),
    ];

    const selection = store.select(docs, [], []);

    expect(selection.systemDocs.map((d) => d.name)).toEqual([
      "beta",
      "structure",
      "alpha",
      "zeta",
    ]);
  });

  it("R3.1: selection is byte-stable across repeated calls with identical inputs", () => {
    const docs = [
      makeDoc({ name: "tech", inclusion: "always", body: "tech body\n" }),
      makeDoc({ name: "product", inclusion: "always", body: "product body\n" }),
      makeDoc({ name: "CLAUDE", inclusion: "always", imported: true, body: "claude body\n" }),
    ];

    const first = store.select(docs, [], []);
    const second = store.select(docs, [], []);
    const joinBodies = (systemDocs: typeof first.systemDocs) =>
      systemDocs.map((d) => d.body).join("");

    expect(joinBodies(first.systemDocs)).toBe(joinBodies(second.systemDocs));
    expect(joinBodies(first.systemDocs)).toBe("product body\ntech body\nclaude body\n");
  });
});
