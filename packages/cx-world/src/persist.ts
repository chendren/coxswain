import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CxWorkspaceDeps } from "@cox/cx-ops";
import type { WorldOverlay, WorldRecord, WorldWordmap } from "./types";

export function worldDir(deps: CxWorkspaceDeps, specName: string): string {
  return join(deps.cxRoot, specName, "world");
}

export async function saveWorld(
  deps: CxWorkspaceDeps,
  specName: string,
  idea: string,
  wordmap: WorldWordmap,
  overlay: WorldOverlay,
): Promise<string> {
  const dir = worldDir(deps, specName);
  await mkdir(dir, { recursive: true });
  const tellMd = [
    `# ${wordmap.brand}`,
    ``,
    `Told: ${wordmap.toldAt}`,
    `Sounds like: ${wordmap.packId}`,
    ``,
    `## In their words`,
    ``,
    idea.trim(),
    ``,
    `## Heard (closed world)`,
    ``,
    ...wordmap.entries.map((e) => `- "${e.display}" → ${e.name} (\`${e.uid}\`)`),
    ``,
    `## Teach candidates (not invented)`,
    ``,
    wordmap.candidates.length === 0
      ? `- (none)`
      : wordmap.candidates.map((c) => `- "${c.display}" (${c.reason})`).join("\n"),
    ``,
    `## Path`,
    ``,
    wordmap.path.join(" → "),
    ``,
  ].join("\n");
  await writeFile(join(dir, "wordmap.json"), JSON.stringify(wordmap, null, 2), "utf8");
  await writeFile(join(dir, "overlay.json"), JSON.stringify(overlay, null, 2), "utf8");
  await writeFile(join(dir, "TELL.md"), tellMd, "utf8");
  return dir;
}

export async function loadWorld(
  deps: CxWorkspaceDeps,
  specName: string,
): Promise<WorldRecord | null> {
  const dir = worldDir(deps, specName);
  try {
    const wordmap = JSON.parse(await readFile(join(dir, "wordmap.json"), "utf8")) as WorldWordmap;
    let overlay: WorldOverlay = { version: "0.1", aliases: [] };
    try {
      overlay = JSON.parse(await readFile(join(dir, "overlay.json"), "utf8")) as WorldOverlay;
    } catch {
      /* optional */
    }
    let idea = "";
    try {
      idea = await readFile(join(dir, "TELL.md"), "utf8");
    } catch {
      /* optional */
    }
    return { specName, idea, wordmap, overlay, tellMd: idea };
  } catch {
    return null;
  }
}

export function displayForUid(wordmap: WorldWordmap, uid: string, fallback: string): string {
  const hit = wordmap.entries.find((e) => e.uid === uid);
  return hit?.display ?? fallback;
}
