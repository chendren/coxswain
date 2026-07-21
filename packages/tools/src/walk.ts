import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export interface WalkEntry {
  /** Path relative to the walk root, POSIX-style ("/" separators). */
  path: string;
  mtimeMs: number;
}

const SKIP_DIRS = new Set(["node_modules", ".git"]);

/** Recursively walk `root`, yielding files (skipping node_modules/.git). */
export async function* walk(root: string, dir = root): AsyncGenerator<WalkEntry> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(root, join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue; // skip symlinks, sockets, etc.

    const abs = join(dir, entry.name);
    const st = await stat(abs).catch(() => null);
    if (!st) continue;

    yield { path: relative(root, abs).split(sep).join("/"), mtimeMs: st.mtimeMs };
  }
}
