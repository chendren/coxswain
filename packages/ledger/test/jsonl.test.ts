import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configSchema, pricingFor, type LedgerEntry } from "@cox/core";
import { createLedger } from "../src/index";
import { appendEntry, readEntries } from "../src/jsonl";

const FIXED_NOW = "2026-07-20T12:00:00.000Z";

function makeEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    ts: FIXED_NOW,
    sessionId: "s1",
    kind: "chat",
    tier: "scout",
    model: { provider: "anthropic", model: "claude-haiku-4-5" },
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.001,
    routingReasons: ["policy chat"],
    durationMs: 100,
    ...overrides,
  };
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cox-ledger-"));
}

describe("jsonl foundation", () => {
  it("R6.1: appendEntry creates the parent dir + file on first write", async () => {
    const dir = await tempDir();
    const path = join(dir, "nested", "ledger.jsonl");
    await appendEntry(path, makeEntry());
    const raw = await readFile(path, "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ sessionId: "s1" });
  });

  it("R6.1: appendEntry appends one JSON line per call via appendFile", async () => {
    const dir = await tempDir();
    const path = join(dir, "ledger.jsonl");
    await appendEntry(path, makeEntry({ sessionId: "a" }));
    await appendEntry(path, makeEntry({ sessionId: "b" }));
    const raw = await readFile(path, "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).sessionId).toBe("a");
    expect(JSON.parse(lines[1]!).sessionId).toBe("b");
  });

  it("R6.2: readEntries returns { entries, skipped }, skipping corrupt lines without throwing", async () => {
    const dir = await tempDir();
    const path = join(dir, "ledger.jsonl");
    const good = makeEntry();
    await writeFile(path, `${JSON.stringify(good)}\nnot json\n{"broken":\n`, "utf8");
    const { entries, skipped } = await readEntries(path);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(good);
    expect(skipped).toBe(2);
  });

  it("R6.2: readEntries on a missing file returns empty with zero skipped (never throws)", async () => {
    const dir = await tempDir();
    const path = join(dir, "missing.jsonl");
    const { entries, skipped } = await readEntries(path);
    expect(entries).toEqual([]);
    expect(skipped).toBe(0);
  });

  it("R6.1/R6.2: createLedger exposes lastReadSkippedLines from the most recent read", async () => {
    const dir = await tempDir();
    const path = join(dir, "ledger.jsonl");
    await writeFile(path, `${JSON.stringify(makeEntry())}\ngarbage\n`, "utf8");
    const ledger = createLedger({
      filePath: path,
      config: configSchema.parse({}),
      pricing: pricingFor,
      now: () => FIXED_NOW,
    });
    expect(ledger.lastReadSkippedLines).toBe(0);
    await ledger.query({});
    expect(ledger.lastReadSkippedLines).toBe(1);
  });
});

describe("query filters", () => {
  async function ledgerWithEntries(entries: LedgerEntry[]) {
    const dir = await tempDir();
    const path = join(dir, "ledger.jsonl");
    if (entries.length > 0) {
      await writeFile(path, `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`, "utf8");
    }
    return {
      path,
      ledger: createLedger({
        filePath: path,
        config: configSchema.parse({}),
        pricing: pricingFor,
        now: () => FIXED_NOW,
      }),
    };
  }

  const fixture = [
    makeEntry({ sessionId: "s1", specName: "auth", tier: "scout", ts: "2026-07-20T10:00:00.000Z" }),
    makeEntry({ sessionId: "s1", specName: "billing", tier: "builder", ts: "2026-07-20T11:00:00.000Z" }),
    makeEntry({ sessionId: "s2", specName: "auth", tier: "architect", ts: "2026-07-20T12:00:00.000Z" }),
    makeEntry({ sessionId: "s2", tier: "scout", ts: "2026-07-20T09:00:00.000Z" }),
  ];

  it("R6.3: filters by sessionId", async () => {
    const { ledger } = await ledgerWithEntries(fixture);
    const result = await ledger.query({ sessionId: "s1" });
    expect(result.map((e) => e.sessionId)).toEqual(["s1", "s1"]);
  });

  it("R6.3: filters by specName", async () => {
    const { ledger } = await ledgerWithEntries(fixture);
    const result = await ledger.query({ specName: "auth" });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.specName === "auth")).toBe(true);
  });

  it("R6.3: filters by tier", async () => {
    const { ledger } = await ledgerWithEntries(fixture);
    const result = await ledger.query({ tier: "scout" });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.tier === "scout")).toBe(true);
  });

  it("R6.3: filters by since (ISO string >= compare)", async () => {
    const { ledger } = await ledgerWithEntries(fixture);
    const result = await ledger.query({ since: "2026-07-20T11:00:00.000Z" });
    expect(result.map((e) => e.ts)).toEqual([
      "2026-07-20T11:00:00.000Z",
      "2026-07-20T12:00:00.000Z",
    ]);
  });

  it("R6.3: composes multiple filters (sessionId + tier)", async () => {
    const { ledger } = await ledgerWithEntries(fixture);
    const result = await ledger.query({ sessionId: "s2", tier: "scout" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ sessionId: "s2", tier: "scout" });
  });

  it("R6.3: results keep file order", async () => {
    const { ledger } = await ledgerWithEntries(fixture);
    const result = await ledger.query({ sessionId: "s1" });
    expect(result[0]!.ts).toBe("2026-07-20T10:00:00.000Z");
    expect(result[1]!.ts).toBe("2026-07-20T11:00:00.000Z");
  });

  it("R6.3: empty query with no matches returns []", async () => {
    const { ledger } = await ledgerWithEntries(fixture);
    const result = await ledger.query({ sessionId: "nobody" });
    expect(result).toEqual([]);
  });

  it("R6.3: empty file returns []", async () => {
    const { ledger } = await ledgerWithEntries([]);
    const result = await ledger.query({});
    expect(result).toEqual([]);
  });

  it("R6.3: missing file returns []", async () => {
    const dir = await tempDir();
    const ledger = createLedger({
      filePath: join(dir, "does-not-exist.jsonl"),
      config: configSchema.parse({}),
      pricing: pricingFor,
      now: () => FIXED_NOW,
    });
    const result = await ledger.query({});
    expect(result).toEqual([]);
  });
});
