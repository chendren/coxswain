/** Closed-set phrase harvest. No model. Stopwords are not candidates. */

const STOP = new Set(
  [
    "the", "a", "an", "and", "or", "but", "for", "nor", "on", "in", "at", "to",
    "of", "as", "by", "we", "our", "are", "is", "be", "been", "being", "was",
    "were", "this", "that", "these", "those", "with", "from", "into", "about",
    "after", "before", "over", "under", "again", "then", "than", "too", "very",
    "can", "will", "just", "not", "no", "yes", "it", "its", "they", "them",
    "their", "you", "your", "i", "my", "me", "us", "do", "does", "did", "have",
    "has", "had", "if", "when", "what", "which", "who", "how", "why", "all",
    "each", "every", "both", "few", "more", "most", "other", "some", "such",
    "only", "own", "same", "so", "also", "need", "needs", "help", "customer",
    "customers", "experience", "system", "program", "brand", "national",
    "regional", "company", "please", "really", "keep", "keeps",
  ].map((s) => s.toLowerCase()),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

export function harvestPhrases(text: string): string[] {
  const tokens = tokenize(text);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (p: string) => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i]!;
    if (a.length >= 4 && !STOP.has(a)) push(a);
    const b = tokens[i + 1];
    if (b && !STOP.has(a) && !STOP.has(b)) push(`${a} ${b}`);
    const c = tokens[i + 2];
    if (b && c && !STOP.has(a) && !STOP.has(c)) push(`${a} ${b} ${c}`);
  }
  return out;
}

export function brandFromIdea(idea: string, packId: string): string {
  const line = idea.split(/[.!?\n]/)[0]?.trim() ?? "";
  if (line.length >= 8 && line.length <= 72) return line;
  const words = idea.trim().split(/\s+/).slice(0, 6).join(" ");
  if (words.length >= 4) return words;
  return `${packId} CX`;
}

export function isStopword(w: string): boolean {
  return STOP.has(w.toLowerCase());
}
