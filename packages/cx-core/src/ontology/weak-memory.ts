import { hubKey, type CxStrongGraph, type StrongNodeKind } from "./graph";
import { resolveLabel } from "./resolve";

export interface WeakMemoryEntry {
  id: string;
  claimedKind: StrongNodeKind | "free_text";
  rawLabel: string;
  hubKey: string;
  props: Record<string, string | number | boolean>;
  /** ISO or free session stamp */
  writtenAt: string;
  source: string; // e.g. "agent:session" | "artifact:intentTaxonomy"
  strength: "weak" | "resolved" | "rejected";
  strongUid?: string;
}

export interface AbsorbProvenance {
  weakId: string;
  rawLabel: string;
  claimedKind: string;
  outcome: "resolved" | "rejected";
  strongUid?: string;
  hubKey: string;
}

export interface WeakMemorySnapshot {
  entries: WeakMemoryEntry[];
  provenance: AbsorbProvenance[];
  stats: { weak: number; resolved: number; rejected: number };
}

let seq = 0;

export function createWeakMemory(now: () => string = () => new Date().toISOString()) {
  const entries = new Map<string, WeakMemoryEntry>();
  const provenance: AbsorbProvenance[] = [];

  function writeWeak(input: {
    claimedKind: WeakMemoryEntry["claimedKind"];
    rawLabel: string;
    source: string;
    props?: Record<string, string | number | boolean>;
  }): WeakMemoryEntry {
    seq += 1;
    const id = `wm_${seq}`;
    const entry: WeakMemoryEntry = {
      id,
      claimedKind: input.claimedKind,
      rawLabel: input.rawLabel,
      hubKey: hubKey(input.rawLabel),
      props: input.props ?? {},
      writtenAt: now(),
      source: input.source,
      strength: "weak",
    };
    entries.set(id, entry);
    return entry;
  }

  function listWeak(): WeakMemoryEntry[] {
    return [...entries.values()];
  }

  function searchWeak(query: string, limit = 20): WeakMemoryEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: WeakMemoryEntry[] = [];
    for (const e of entries.values()) {
      if (
        e.rawLabel.toLowerCase().includes(q) ||
        e.hubKey.includes(hubKey(q)) ||
        e.id.includes(q)
      ) {
        out.push(e);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  function tryAbsorbAll(graph: CxStrongGraph): AbsorbProvenance[] {
    const batch: AbsorbProvenance[] = [];
    for (const e of entries.values()) {
      if (e.strength === "resolved") continue;
      if (e.claimedKind === "free_text") {
        const p: AbsorbProvenance = {
          weakId: e.id,
          rawLabel: e.rawLabel,
          claimedKind: e.claimedKind,
          outcome: "rejected",
          hubKey: e.hubKey,
        };
        e.strength = "rejected";
        batch.push(p);
        provenance.push(p);
        continue;
      }
      const strong = resolveLabel(graph, e.claimedKind, e.rawLabel);
      if (strong) {
        e.strength = "resolved";
        e.strongUid = strong.uid;
        e.hubKey = strong.hubKey;
        const p: AbsorbProvenance = {
          weakId: e.id,
          rawLabel: e.rawLabel,
          claimedKind: e.claimedKind,
          outcome: "resolved",
          strongUid: strong.uid,
          hubKey: e.hubKey,
        };
        batch.push(p);
        provenance.push(p);
      } else {
        e.strength = "rejected";
        const p: AbsorbProvenance = {
          weakId: e.id,
          rawLabel: e.rawLabel,
          claimedKind: e.claimedKind,
          outcome: "rejected",
          hubKey: e.hubKey,
        };
        batch.push(p);
        provenance.push(p);
      }
    }
    return batch;
  }

  function snapshot(): WeakMemorySnapshot {
    const list = listWeak();
    return {
      entries: list,
      provenance: [...provenance],
      stats: {
        weak: list.filter((e) => e.strength === "weak").length,
        resolved: list.filter((e) => e.strength === "resolved").length,
        rejected: list.filter((e) => e.strength === "rejected").length,
      },
    };
  }

  function clear(): void {
    entries.clear();
    provenance.length = 0;
  }

  return { writeWeak, listWeak, searchWeak, tryAbsorbAll, snapshot, clear };
}

export type WeakMemory = ReturnType<typeof createWeakMemory>;
