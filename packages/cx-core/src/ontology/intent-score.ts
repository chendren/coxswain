import type { CxOntology } from "./types";

export interface IntentScore {
  domainId: string;
  intentId: string; // full domain.intent
  name: string;
  score: number; // 0-100
  matched: string[]; // which fields contributed
}

function tokens(text: string): Set<string> {
  const raw = text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 1);
  return new Set(raw);
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / Math.max(a.size, 1);
}

/**
 * Rank closed-world intents for an utterance.
 * Score combines name (0.4), description (0.3), exemplars (0.3) overlap → 0-100.
 */
export function scoreIntents(
  ontology: CxOntology,
  utterance: string,
  limit = 10,
): IntentScore[] {
  const u = tokens(utterance);
  if (u.size === 0) return [];
  const scores: IntentScore[] = [];

  // ontology.domains is CxDomain[] (list), not a map
  for (const domain of ontology.domains) {
    for (const intent of domain.intents) {
      const matched: string[] = [];
      const nameT = tokens(intent.name);
      const descT = tokens(intent.description);
      const exT = new Set<string>();
      for (const ex of intent.exemplars ?? []) {
        for (const t of tokens(ex)) exT.add(t);
      }
      const n = overlap(u, nameT);
      const d = overlap(u, descT);
      const e = overlap(u, exT);
      if (n > 0) matched.push("name");
      if (d > 0) matched.push("description");
      if (e > 0) matched.push("exemplars");
      const raw = n * 0.4 + d * 0.3 + e * 0.3;
      const score = Math.round(Math.min(100, raw * 100));
      if (score <= 0) continue;
      scores.push({
        domainId: domain.id,
        intentId: `${domain.id}.${intent.id}`,
        name: intent.name,
        score,
        matched,
      });
    }
  }

  scores.sort((a, b) => b.score - a.score || a.intentId.localeCompare(b.intentId));
  return scores.slice(0, limit);
}

export function routeIntent(
  ontology: CxOntology,
  utterance: string,
  minScore = 20,
): IntentScore | undefined {
  const top = scoreIntents(ontology, utterance, 1)[0];
  if (!top || top.score < minScore) return undefined;
  return top;
}
