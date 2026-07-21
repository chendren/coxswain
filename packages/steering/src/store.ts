import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  CoxConfig,
  SteeringDoc,
  SteeringInclusion,
  SteeringStore,
} from "@cox/core";
import { parseFrontMatter } from "./frontmatter";

export function createSteeringStore(deps: { config: CoxConfig }): SteeringStore {
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

      return docs;
    },

    select(_docs, _touchedFiles, _manualNames) {
      // Implemented in a later task.
      return { systemDocs: [], contextDocs: [], totalTokens: 0 };
    },
  };
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
