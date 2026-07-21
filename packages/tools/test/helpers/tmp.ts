import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Run `fn` inside a fresh fs.mkdtemp sandbox; always cleaned up afterwards,
 * even on failure. Per docs/04-CONVENTIONS.md: no ~/.cox writes in tests.
 */
export async function withTmpDir<T>(
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "cox-tools-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
