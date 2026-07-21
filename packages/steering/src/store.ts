import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import picomatch from "picomatch";
import type {
  CoxConfig,
  SteeringDoc,
  SteeringInclusion,
  SteeringSelection,
  SteeringStore,
} from "@cox/core";
import { parseFrontMatter } from "./frontmatter";

export function createSteeringStore(deps: { config: CoxConfig }): SteeringStore {
  const matcherCache = new Map<string, ReturnType<typeof picomatch>>();

  function getMatcher(pattern: string): ReturnType<typeof picomatch> {
    let matcher = matcherCache.get(pattern);
    if (!matcher) {
      matcher = picomatch(pattern, { dot: true });
      matcherCache.set(pattern, matcher);
    }
    return matcher;
  }

  return {
    async loadAll(cwd: string): Promise<SteeringDoc[]> {
      const steeringDir = join(cwd, ".cox", "steering");
      const fileNames = await readTopLevelMarkdownFiles(steeringDir);

      const docs: SteeringDoc[] = [];
      for (const fileName of fileNames) {
        const filePath = join(steeringDir, fileName);
        const raw = await readFile(filePath, "utf8");
        docs.push(buildSteeringDoc(fileName.slice(0, -3), filePath, raw));
      }

      if (deps.config.steering.importCompat) {
        docs.push(...(await loadCompatImports(cwd)));
      }

      return docs;
    },

    select(docs, touchedFiles, manualNames) {
      const systemDocs = orderedSystemDocs(docs);
      const contextDocs = orderedContextDocs(docs, touchedFiles, manualNames, getMatcher);
      const totalTokens = [...systemDocs, ...contextDocs].reduce((sum, d) => sum + d.tokens, 0);
      return { systemDocs, contextDocs, totalTokens };
    },
  };
}

// ---------------------------------------------------------------------------
// select (R3)
// ---------------------------------------------------------------------------

function byName(a: SteeringDoc, b: SteeringDoc): number {
  return a.name.localeCompare(b.name, "en");
}

function stripLeadingDotSlash(p: string): string {
  return p.startsWith("./") ? p.slice(2) : p;
}

/**
 * R3.1: exactly the inclusion:"always" docs, non-imported (sorted by name)
 * before imported (sorted by name) — deterministic and byte-stable given the
 * same input docs.
 */
function orderedSystemDocs(docs: SteeringDoc[]): SteeringDoc[] {
  const always = docs.filter((d) => d.inclusion === "always");
  return [
    ...always.filter((d) => !d.imported).sort(byName),
    ...always.filter((d) => d.imported).sort(byName),
  ];
}

/**
 * R3.2–R3.4: fileMatch docs whose pattern matches any touched file (sorted by
 * name), then manual docs named in `manualNames` (sorted by name), deduped
 * by path.
 */
function orderedContextDocs(
  docs: SteeringDoc[],
  touchedFiles: string[],
  manualNames: string[],
  getMatcher: (pattern: string) => ReturnType<typeof picomatch>,
): SteeringDoc[] {
  const normalizedTouched = touchedFiles.map(stripLeadingDotSlash);

  const fileMatchDocs = docs
    .filter((d) => d.inclusion === "fileMatch" && d.fileMatchPattern)
    .filter((d) => {
      const isMatch = getMatcher(stripLeadingDotSlash(d.fileMatchPattern!));
      return normalizedTouched.some((f) => isMatch(f));
    })
    .sort(byName);

  const manualSet = new Set(manualNames);
  const manualDocs = docs
    .filter((d) => d.inclusion === "manual" && manualSet.has(d.name))
    .sort(byName);

  const seenPaths = new Set<string>();
  const contextDocs: SteeringDoc[] = [];
  for (const d of [...fileMatchDocs, ...manualDocs]) {
    if (seenPaths.has(d.path)) continue;
    seenPaths.add(d.path);
    contextDocs.push(d);
  }
  return contextDocs;
}

// ---------------------------------------------------------------------------
// steeringWarnings (R4)
// ---------------------------------------------------------------------------

function formatTokenCount(n: number): string {
  const k = n / 1000;
  const rounded = Math.round(k * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
}

/**
 * Per-doc and total-weight warnings for an already-computed selection.
 * Oversized docs stay in the selection (R4.3) — this only warns.
 */
export function steeringWarnings(selection: SteeringSelection, warnTokens: number): string[] {
  const warnings: string[] = [];

  for (const doc of [...selection.systemDocs, ...selection.contextDocs]) {
    if (doc.tokens > warnTokens) {
      warnings.push(
        `steering doc "${doc.name}" is ~${formatTokenCount(doc.tokens)} tokens (warn threshold ${formatTokenCount(warnTokens)})`,
      );
    }
  }

  if (selection.totalTokens > 2 * warnTokens) {
    warnings.push(
      `steering selection totals ~${formatTokenCount(selection.totalTokens)} tokens (warn threshold ${formatTokenCount(warnTokens)} × 2)`,
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// loadAll
// ---------------------------------------------------------------------------

/** Top-level `*.md` file names in `dir`, sorted; `[]` when `dir` is missing. */
async function readTopLevelMarkdownFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "en"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function buildSteeringDoc(name: string, path: string, raw: string): SteeringDoc {
  const { data, body: strippedBody } = parseFrontMatter(raw);

  let inclusion: SteeringInclusion = "always";
  let body = raw;
  let fileMatchPattern: string | undefined;

  if (data !== null) {
    const rawInclusion = data.inclusion;
    const pattern = typeof data.fileMatchPattern === "string" ? data.fileMatchPattern : undefined;

    if (
      rawInclusion === undefined ||
      rawInclusion === "always" ||
      rawInclusion === "fileMatch" ||
      rawInclusion === "manual"
    ) {
      // Valid (or simply unspecified, defaulting to "always") — use the
      // front-matter-stripped body.
      inclusion = rawInclusion ?? "always";
      body = strippedBody;
      fileMatchPattern = pattern;
    } else {
      // R1.4: front matter parsed, but `inclusion` holds an unknown value —
      // fall back to "always" with the untouched raw file as body.
      inclusion = "always";
      body = raw;
      fileMatchPattern = undefined;
    }
  }
  // data === null: no block, unclosed block, or invalid YAML — parseFrontMatter
  // already gives us body === raw in every one of those cases (R1.3/R1.4).

  if (inclusion === "fileMatch" && (!fileMatchPattern || fileMatchPattern.length === 0)) {
    // R1.5: fileMatch without a usable pattern downgrades to manual.
    inclusion = "manual";
  }

  return {
    name,
    path,
    inclusion,
    fileMatchPattern,
    body,
    tokens: Math.ceil(body.length / 4),
    imported: false,
  };
}

// ---------------------------------------------------------------------------
// Compat imports (R2)
// ---------------------------------------------------------------------------

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function makeImportedDoc(name: string, path: string, raw: string): SteeringDoc {
  return {
    name,
    path,
    inclusion: "always",
    body: raw, // front matter is never parsed/stripped for imported files
    tokens: Math.ceil(raw.length / 4),
    imported: true,
  };
}

async function loadCompatImports(cwd: string): Promise<SteeringDoc[]> {
  const claudePath = join(cwd, "CLAUDE.md");
  const agentsPath = join(cwd, "AGENTS.md");
  const copilotPath = join(cwd, ".github", "copilot-instructions.md");

  const [claudeRaw, agentsRaw, copilotRaw] = await Promise.all([
    readIfExists(claudePath),
    readIfExists(agentsPath),
    readIfExists(copilotPath),
  ]);

  const docs: SteeringDoc[] = [];
  if (claudeRaw !== null) {
    docs.push(makeImportedDoc("CLAUDE", claudePath, claudeRaw));
  }
  // R2.2: byte-identical CLAUDE.md/AGENTS.md dedupes to CLAUDE only.
  if (agentsRaw !== null && !(claudeRaw !== null && agentsRaw === claudeRaw)) {
    docs.push(makeImportedDoc("AGENTS", agentsPath, agentsRaw));
  }
  if (copilotRaw !== null) {
    docs.push(makeImportedDoc("copilot-instructions", copilotPath, copilotRaw));
  }
  return docs;
}
