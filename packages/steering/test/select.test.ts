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

describe("select — fileMatch + manual contextDocs", () => {
  it("R3.2: a touched file matching a fileMatch doc's pattern includes it in contextDocs", () => {
    const docs = [
      makeDoc({ name: "api", inclusion: "fileMatch", fileMatchPattern: "src/api/**" }),
      makeDoc({ name: "web", inclusion: "fileMatch", fileMatchPattern: "src/web/**" }),
    ];

    const selection = store.select(docs, ["src/api/handler.ts"], []);

    expect(selection.contextDocs.map((d) => d.name)).toEqual(["api"]);
  });

  it("R3.2: a leading './' on touched file paths is stripped before matching", () => {
    const docs = [makeDoc({ name: "api", inclusion: "fileMatch", fileMatchPattern: "src/api/**" })];

    const selection = store.select(docs, ["./src/api/handler.ts"], []);

    expect(selection.contextDocs.map((d) => d.name)).toEqual(["api"]);
  });

  it("R3.2: picomatch runs with dot:true, so fileMatch patterns reach dotfiles", () => {
    const docs = [makeDoc({ name: "cfg", inclusion: "fileMatch", fileMatchPattern: "config/**" })];

    const selection = store.select(docs, ["config/.env.example"], []);

    expect(selection.contextDocs.map((d) => d.name)).toEqual(["cfg"]);
  });

  it("R3.2: a fileMatch doc whose pattern matches nothing touched is excluded", () => {
    const docs = [makeDoc({ name: "api", inclusion: "fileMatch", fileMatchPattern: "src/api/**" })];

    const selection = store.select(docs, ["docs/readme.md"], []);

    expect(selection.contextDocs).toEqual([]);
  });

  it("R3.3: manualNames containing a manual doc's name includes it in contextDocs", () => {
    const docs = [makeDoc({ name: "debug", inclusion: "manual" })];

    const selection = store.select(docs, [], ["debug"]);

    expect(selection.contextDocs.map((d) => d.name)).toEqual(["debug"]);
  });

  it("R3.3: manualNames entries that match no manual doc are ignored without error", () => {
    const docs = [makeDoc({ name: "debug", inclusion: "manual" })];

    const selection = store.select(docs, [], ["no-such-doc"]);

    expect(selection.contextDocs).toEqual([]);
  });

  it("R3.4: contextDocs orders fileMatch-selected (sorted by name) before manual-selected (sorted by name)", () => {
    const docs = [
      makeDoc({ name: "zeta-manual", inclusion: "manual" }),
      makeDoc({ name: "alpha-manual", inclusion: "manual" }),
      makeDoc({ name: "zeta-fm", inclusion: "fileMatch", fileMatchPattern: "src/**" }),
      makeDoc({ name: "alpha-fm", inclusion: "fileMatch", fileMatchPattern: "src/**" }),
    ];

    const selection = store.select(docs, ["src/index.ts"], ["zeta-manual", "alpha-manual"]);

    expect(selection.contextDocs.map((d) => d.name)).toEqual([
      "alpha-fm",
      "zeta-fm",
      "alpha-manual",
      "zeta-manual",
    ]);
  });

  it("R3.4: contextDocs has no duplicate paths", () => {
    const dup = makeDoc({
      name: "same",
      path: "/fake/same.md",
      inclusion: "fileMatch",
      fileMatchPattern: "src/**",
    });
    const docs = [dup, { ...dup }];

    const selection = store.select(docs, ["src/index.ts"], []);

    expect(selection.contextDocs).toHaveLength(1);
  });

  it.each([
    { systemTokens: [10, 20], contextTokens: [5], expected: 35 },
    { systemTokens: [] as number[], contextTokens: [7, 3], expected: 10 },
    { systemTokens: [100], contextTokens: [] as number[], expected: 100 },
    { systemTokens: [] as number[], contextTokens: [] as number[], expected: 0 },
  ])(
    "R3.5: totalTokens = sum over systemDocs + contextDocs ($systemTokens + $contextTokens = $expected)",
    ({ systemTokens, contextTokens, expected }) => {
      const docs = [
        ...systemTokens.map((tokens, i) => makeDoc({ name: `sys${i}`, inclusion: "always", tokens })),
        ...contextTokens.map((tokens, i) => makeDoc({ name: `man${i}`, inclusion: "manual", tokens })),
      ];
      const manualNames = contextTokens.map((_, i) => `man${i}`);

      const selection = store.select(docs, [], manualNames);

      expect(selection.totalTokens).toBe(expected);
    },
  );
});
