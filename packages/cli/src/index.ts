/**
 * @cox/cli — the composition root. Not a library: nothing in this
 * workspace imports `@cox/cli` itself (it's the top-level application),
 * so this file has no meaningful exports of its own. The real entry point
 * is `src/main.ts`, run directly via `tsx` (`pnpm cox` / `pnpm --filter
 * @cox/cli exec tsx src/main.ts`). Kept only because package.json's
 * "main"/"types" point here.
 */
export {};
