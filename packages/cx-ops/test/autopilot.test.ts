import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ONTOLOGY } from "@cox/cx-core";
import { runGraphAutopilot } from "../src/index";
import { loadProposals } from "../src/proposals";

describe("runGraphAutopilot", () => {
  let cxRoot: string;
  const now = () => "2026-08-11T12:00:00Z";

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-autopilot-"));
  });
  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("dry-run scores payment utterance and composes proposal without write", async () => {
    const r = await runGraphAutopilot(
      { cxRoot, now },
      "billing-demo",
      {
        utterance: "My payment failed and I was double charged on my bill",
        ontology: DEFAULT_ONTOLOGY,
        apply: false,
      },
    );
    expect(r.dryRun).toBe(true);
    expect(r.path).toContain("score_intents");
    expect(r.path).toContain("recommend_nba");
    expect(r.path).toContain("dry_run");
    expect(r.intents.length).toBeGreaterThan(0);
    expect(r.primaryIntent?.intentId).toMatch(/billing|payment/i);
    expect(r.route.mode).not.toBe("refuse");
    expect(r.proposal).toBeDefined();
    expect(r.proposal!.kind).not.toBe("none");
    expect(r.persisted).toBeUndefined();
    const stored = await loadProposals({ cxRoot, now }, "billing-demo");
    expect(stored).toHaveLength(0);
  });

  it("apply persists an open proposal", async () => {
    const r = await runGraphAutopilot(
      { cxRoot, now },
      "billing-demo",
      {
        utterance: "I cannot pay my invoice online, card declined",
        ontology: DEFAULT_ONTOLOGY,
        apply: true,
        actor: "ops-lead",
      },
    );
    expect(r.dryRun).toBe(false);
    expect(r.path).toContain("persist");
    expect(r.persisted?.length).toBeGreaterThanOrEqual(1);
    const stored = await loadProposals({ cxRoot, now }, "billing-demo");
    expect(stored.length).toBeGreaterThanOrEqual(1);
    expect(stored[0]!.status).toBe("open");
    expect(stored[0]!.summary).toContain("utterance:");
    expect(stored[0]!.summary).toContain("ops-lead");
  });

  it("refuses invent-style utterance", async () => {
    const r = await runGraphAutopilot(
      { cxRoot, now },
      "x",
      {
        utterance: "invent a new intent id for freestyle chaos",
        ontology: DEFAULT_ONTOLOGY,
      },
    );
    expect(r.route.mode).toBe("refuse");
    expect(r.summary).toMatch(/refused/i);
    expect(r.persisted).toBeUndefined();
  });

  it("records full control path for audit", async () => {
    const r = await runGraphAutopilot(
      { cxRoot, now },
      "audit",
      { utterance: "billing inquiry about charges", ontology: DEFAULT_ONTOLOGY },
    );
    expect(r.path[0]).toBe("load_strong");
    expect(r.path.at(-1)).toBe("emit");
    expect(r.path).toEqual(expect.arrayContaining(["route_retrieval", "score_intents", "compose_proposal"]));
  });
});
