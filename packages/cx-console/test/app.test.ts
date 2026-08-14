import { describe, expect, it } from "vitest";
import { renderAppHome } from "../src/pages/app-home";
import { renderAppToday } from "../src/pages/app-today";
import type { WorldRecord } from "@cox/cx-world";

const world: WorldRecord = {
  specName: "northwind",
  idea: "retail returns",
  tellMd: "retail returns",
  overlay: { version: "0.1", aliases: [] },
  wordmap: {
    brand: "Northwind Retail CX",
    packId: "retail",
    entries: [
      {
        display: "returns",
        uid: "journey:returns_refunds",
        kind: "journey",
        name: "Returns and Refunds",
      },
    ],
    candidates: [{ display: "foo-bar-xyz", reason: "unresolved" }],
    path: ["detect_pack", "emit"],
    toldAt: "2026-08-14T12:00:00.000Z",
  },
};

describe("World app skin", () => {
  it("home uses brand and never titles Graph Console", () => {
    const html = renderAppHome({ specName: "northwind", pack: "default", world });
    expect(html).toContain("Northwind Retail CX");
    expect(html).not.toMatch(/<h1[^>]*>Graph Console/);
    expect(html).toContain("returns");
    expect(html).toContain("I will not invent");
    expect(html).toContain('class="path-audit"');
    expect(html).not.toMatch(/src=["']https?:\/\//);
  });

  it("today is one box and I'll take this when a proposal exists", () => {
    const html = renderAppToday({
      specName: "northwind",
      pack: "default",
      world,
      utterance: "refunds backing up",
      result: {
        path: ["today", "emit"],
        route: {
          mode: "closed_set_lookup",
          risk: 10,
          reason: "ok",
          tools: [],
          path: ["route"],
        },
        intents: [],
        nba: { primary: undefined, rules: [], path: [] },
        persisted: [
          {
            id: "prop_1",
            specName: "northwind",
            targetId: "local",
            kind: "investigate",
            summary: "x",
            status: "open",
            createdAt: "",
            updatedAt: "",
            path: [],
          },
        ],
        skipped: 0,
        dryRun: false,
        summary: "ok",
      },
    });
    expect(html).toContain("What is happening");
    expect(html).toContain("I'll take this");
    expect(html).toContain("Not that");
    expect(html).not.toMatch(/<h1[^>]*>Graph Console/);
  });
});
