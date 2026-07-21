import { isAbsolute, relative, resolve, sep } from "node:path";

export interface ResolvedPath {
  /** Absolute, resolved path. */
  abs: string;
  /** True when `abs` is not inside `cwd` (via ".." or an absolute escape). */
  outside: boolean;
}

/** Resolve `p` (relative or absolute) against `cwd`; flag escapes. */
export function resolveWithin(cwd: string, p: string): ResolvedPath {
  const abs = resolve(cwd, p);
  const rel = relative(cwd, abs);
  const outside = rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  return { abs, outside };
}
