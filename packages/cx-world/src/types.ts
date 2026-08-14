import type { PackId } from "@cox/cx-pack-registry";
import type { StrongNodeKind } from "@cox/cx-core";

export interface WordmapEntry {
  display: string;
  uid: string;
  kind: StrongNodeKind;
  name: string;
}

export interface TeachCandidate {
  display: string;
  reason: "unresolved";
}

export interface WorldWordmap {
  brand: string;
  packId: PackId;
  entries: WordmapEntry[];
  candidates: TeachCandidate[];
  path: string[];
  toldAt: string;
}

export interface WorldOverlayAlias {
  label: string;
  uid: string;
}

export interface WorldOverlay {
  version: "0.1";
  aliases: WorldOverlayAlias[];
}

export interface WorldRecord {
  specName: string;
  idea: string;
  wordmap: WorldWordmap;
  overlay: WorldOverlay;
  tellMd: string;
}

export interface TellResult {
  path: string[];
  specName: string;
  created: boolean;
  wordmap: WorldWordmap;
  overlay: WorldOverlay;
  dir: string;
}
