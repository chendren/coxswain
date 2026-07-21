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
