import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LedgerEntry } from "@cox/core";

// Cache the mkdir promise per directory so repeat appends to the same
// ledger file don't re-stat/re-create the parent dir every call (R6.1).
const dirReady = new Map<string, Promise<void>>();

function ensureDir(dir: string): Promise<void> {
  let ready = dirReady.get(dir);
  if (!ready) {
    ready = mkdir(dir, { recursive: true }).then(() => undefined);
    dirReady.set(dir, ready);
  }
  return ready;
}

/** Appends one JSON line. Creates the parent dir + file on first write. */
export async function appendEntry(path: string, entry: LedgerEntry): Promise<void> {
  await ensureDir(dirname(path));
  await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
}

export interface ReadResult {
  entries: LedgerEntry[];
  skipped: number;
}

/**
 * Reads and parses every line. Corrupt lines (fail JSON.parse) are skipped
 * and counted, never thrown (R6.2). A missing file reads as empty.
 */
export async function readEntries(path: string): Promise<ReadResult> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { entries: [], skipped: 0 };
    }
    throw err;
  }

  const entries: LedgerEntry[] = [];
  let skipped = 0;
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      entries.push(JSON.parse(line) as LedgerEntry);
    } catch {
      skipped++;
    }
  }
  return { entries, skipped };
}
