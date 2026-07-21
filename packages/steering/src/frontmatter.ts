import { parse as parseYaml } from "yaml";

/**
 * Result of splitting a raw steering-doc file into front matter data and
 * body text. `data` is null whenever there is no front matter block, the
 * block is unclosed, or the enclosed YAML doesn't parse to a plain object —
 * in every `data: null` case `body` is the entire original `raw` input
 * (nothing is silently dropped; see R1.3/R1.4).
 */
export interface FrontMatterResult {
  data: Record<string, unknown> | null;
  body: string;
}

const OPEN_DELIM_RE = /^---\r?\n/;
// First line, from the start of `rest`, that is exactly "---" (m = per-line ^/$).
const CLOSE_DELIM_RE = /^---\r?(?:\n|$)/m;

/**
 * Splits `raw` on a leading `---`-delimited YAML front matter block.
 * Front matter exists iff the file starts with `---\n` (or `---\r\n`) and a
 * closing `---` line follows; the enclosed text is parsed with `yaml.parse`.
 */
export function parseFrontMatter(raw: string): FrontMatterResult {
  const openMatch = OPEN_DELIM_RE.exec(raw);
  if (!openMatch) return { data: null, body: raw };

  const rest = raw.slice(openMatch[0].length);
  const closeMatch = CLOSE_DELIM_RE.exec(rest);
  if (!closeMatch) return { data: null, body: raw }; // unclosed block

  const yamlText = rest.slice(0, closeMatch.index);
  const body = rest.slice(closeMatch.index + closeMatch[0].length);

  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch {
    return { data: null, body: raw };
  }

  if (parsed === null || parsed === undefined) {
    // A blank/whitespace-only block is valid YAML (an empty document) — not
    // a parse failure. Treat it as front matter with no fields.
    return { data: {}, body };
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    // Scalar/array front matter — there's no field set we can read
    // `inclusion` off of; treat like a parse failure so callers fall back to
    // the full raw file rather than silently stripping a block we don't
    // understand.
    return { data: null, body: raw };
  }

  return { data: parsed as Record<string, unknown>, body };
}
