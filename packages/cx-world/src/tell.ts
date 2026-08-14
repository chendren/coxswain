import { DEFAULT_ONTOLOGY } from "@cox/cx-core";
import { createCxSpec, loadCxWorkspace, type CxWorkspaceDeps } from "@cox/cx-ops";
import { detectPack } from "@cox/cx-pack-registry";
import { graphOf, matchPhrase } from "./match";
import { aliasesFromPack, matchPackAlias } from "./pack-aliases";
import { brandFromIdea, harvestPhrases, isStopword, tokenize } from "./phrases";
import { saveWorld } from "./persist";
import type { TellResult, WordmapEntry, TeachCandidate, WorldOverlay } from "./types";

const NOISE = new Set([
  "foo", "bar", "baz", "xyz", "asdf", "qwerty", "test", "demo", "lorem", "ipsum",
]);

function looksInvented(phrase: string): boolean {
  const compact = phrase.replace(/\s+/g, "");
  if (compact.length < 4) return false;
  if (NOISE.has(compact)) return true;
  if (/^[a-z]+-[a-z]+-[a-z]+$/.test(phrase)) return true;
  if (/xyz|qwer|asdf|lorem/.test(compact)) return true;
  return false;
}

/**
 * Offline Tell: idea → pack + closed-world wordmap. Never mints ids.
 * path: detect_pack → load_strong → harvest → resolve → persist → emit
 */
export async function tellWorld(
  deps: CxWorkspaceDeps,
  specName: string,
  idea: string,
): Promise<TellResult> {
  const path = [
    "detect_pack",
    "load_strong",
    "harvest_phrases",
    "resolve_identity",
    "persist_world",
    "emit",
  ];
  const text = idea.trim();
  if (!text) throw new Error("Tell needs words: describe how your world works");
  if (!specName.trim()) throw new Error("Tell needs a world name");

  const packId = detectPack(text);
  const graph = graphOf(DEFAULT_ONTOLOGY);
  const packAliases = aliasesFromPack(packId, specName);
  const phrases = harvestPhrases(text);
  const entries: WordmapEntry[] = [];
  const seenUid = new Set<string>();
  const resolvedPhrase = new Set<string>();

  for (const phrase of phrases) {
    const packHit = matchPackAlias(packAliases, phrase);
    if (packHit) {
      resolvedPhrase.add(phrase);
      if (!seenUid.has(packHit.uid)) {
        seenUid.add(packHit.uid);
        entries.push({
          display: phrase,
          uid: packHit.uid,
          kind: packHit.kind,
          name: packHit.name,
        });
      }
      continue;
    }
    const hit = matchPhrase(graph, phrase);
    if (!hit) continue;
    resolvedPhrase.add(phrase);
    if (seenUid.has(hit.node.uid)) continue;
    seenUid.add(hit.node.uid);
    entries.push({
      display: phrase,
      uid: hit.node.uid,
      kind: hit.node.kind,
      name: hit.node.name,
    });
  }
  // Always include unmatched pack journeys as the world map (their official names)
  for (const a of packAliases) {
    if (seenUid.has(a.uid)) continue;
    seenUid.add(a.uid);
    entries.push({
      display: a.display,
      uid: a.uid,
      kind: a.kind,
      name: a.name,
    });
  }

  const candidates: TeachCandidate[] = [];
  const tokens = tokenize(text).filter((t) => t.length >= 5 && !isStopword(t));
  for (const t of tokens) {
    if (resolvedPhrase.has(t)) continue;
    const hit = matchPhrase(graph, t);
    if (hit) continue;
    if (looksInvented(t) || t.length >= 6) {
      candidates.push({ display: t, reason: "unresolved" });
    }
  }
  // always record hyphenated invented labels
  for (const raw of text.split(/\s+/)) {
    const p = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (looksInvented(p) && !candidates.some((c) => c.display === p)) {
      candidates.push({ display: p, reason: "unresolved" });
    }
  }

  const existing = await loadCxWorkspace(deps, specName);
  let created = false;
  if (!existing) {
    await createCxSpec(deps, specName, text);
    created = true;
  }

  const wordmap = {
    brand: brandFromIdea(text, packId),
    packId,
    entries,
    candidates,
    path,
    toldAt: deps.now(),
  };
  const overlay: WorldOverlay = {
    version: "0.1",
    aliases: entries.map((e) => ({ label: e.display, uid: e.uid })),
  };
  const dir = await saveWorld(deps, specName, text, wordmap, overlay);
  return { path, specName, created, wordmap, overlay, dir };
}
