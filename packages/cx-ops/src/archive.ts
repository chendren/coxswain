/**
 * Soft-archive a CX program (rename workspace dir with .archived- prefix).
 * Does not delete; human can restore by renaming back.
 */
import { access, rename } from "node:fs/promises";
import { join } from "node:path";
import type { CxWorkspaceDeps } from "./workspace";

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function archiveCxSpec(
  deps: CxWorkspaceDeps,
  name: string,
): Promise<{ from: string; to: string; path: string[] }> {
  if (!name || name.includes("/") || name.includes("..") || name.startsWith(".")) {
    throw new Error(`invalid CX spec name "${name}"`);
  }
  if (name.startsWith(".archived-")) {
    throw new Error(`already archived: ${name}`);
  }
  const from = join(deps.cxRoot, name);
  const to = join(deps.cxRoot, `.archived-${name}`);
  if (!(await pathExists(from))) {
    throw new Error(`CX spec "${name}" not found`);
  }
  if (await pathExists(to)) {
    throw new Error(`archive target already exists: .archived-${name}`);
  }
  await rename(from, to);
  return {
    from,
    to,
    path: ["archive_spec", "rename", "emit"],
  };
}

export async function restoreCxSpec(
  deps: CxWorkspaceDeps,
  name: string,
): Promise<{ from: string; to: string; path: string[] }> {
  const bare = name.startsWith(".archived-") ? name.slice(".archived-".length) : name;
  if (!bare || bare.includes("/") || bare.includes("..")) {
    throw new Error(`invalid CX spec name "${name}"`);
  }
  const from = join(deps.cxRoot, `.archived-${bare}`);
  const to = join(deps.cxRoot, bare);
  if (!(await pathExists(from))) {
    throw new Error(`archived spec ".archived-${bare}" not found`);
  }
  if (await pathExists(to)) {
    throw new Error(`active spec already exists: ${bare}`);
  }
  await rename(from, to);
  return { from, to, path: ["restore_spec", "rename", "emit"] };
}
