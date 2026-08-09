import { existsSync, watch, type FSWatcher } from "node:fs";
import { join, sep } from "node:path";
import picomatch from "picomatch";
import type { AgentHookConfig } from "@cox/core";

const DEBOUNCE_MS = 500;
const IGNORED_SEGMENTS = new Set([".git", "node_modules", ".cox"]);

export function createFileWatcher(opts: {
  cwd: string;
  hooks: AgentHookConfig[];
  onTrigger: (hook: AgentHookConfig, file: string) => void;
}): { close(): void } {
  // R11.5: only fileSave hooks are ever watched — manual hooks never fire
  // from filesystem events.
  const fileSaveHooks = opts.hooks
    .filter(isFileSaveHook)
    .map((hook) => ({
      hook,
      isMatch: picomatch(hook.trigger.pattern, { dot: true }),
    }));

  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  function handleEvent(_eventType: string, filenameRaw: string | Buffer | null): void {
    if (!filenameRaw) return;
    const relPath = filenameRaw.toString().split(sep).join("/");

    // R11.3: ignore .git/, node_modules/, .cox/, and paths that no longer
    // exist (e.g. deletions) — checked once, up front, at raw event time.
    if (relPath.split("/").some((segment) => IGNORED_SEGMENTS.has(segment))) return;
    if (!existsSync(join(opts.cwd, relPath))) return;

    for (const { hook, isMatch } of fileSaveHooks) {
      if (!isMatch(relPath)) continue;

      // R11.2: trailing-edge debounce, 500ms, per (hook, file) pair.
      const key = `${hook.name}\0${relPath}`;
      const existingTimer = pending.get(key);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        pending.delete(key);
        opts.onTrigger(hook, relPath);
      }, DEBOUNCE_MS);
      pending.set(key, timer);
    }
  }

  const watcher = startWatching(opts.cwd, handleEvent);
  let closed = false;

  return {
    close(): void {
      // R11.4: stop watching and cancel every pending debounced trigger.
      // Idempotent — prevents EMFILE from double-close races and ensures
      // debounce timers never fire after teardown.
      if (closed) return;
      closed = true;
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
      try {
        watcher.close();
      } catch {
        // ignore already-closed watcher
      }
    },
  };
}

function isFileSaveHook(
  hook: AgentHookConfig,
): hook is AgentHookConfig & { trigger: { type: "fileSave"; pattern: string } } {
  return hook.trigger.type === "fileSave";
}

/**
 * R11.1: recursive watch where supported, falling back to a non-recursive
 * top-level watch of `cwd` on platforms that throw
 * ERR_FEATURE_UNAVAILABLE_ON_PLATFORM (notably older Linux). The fallback
 * only sees changes to files directly in `cwd`, not subdirectories — a
 * known v1 limitation, documented in NOTES.md.
 */
function startWatching(
  cwd: string,
  onEvent: (eventType: string, filename: string | Buffer | null) => void,
): FSWatcher {
  try {
    return watch(cwd, { recursive: true }, onEvent);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") {
      return watch(cwd, { recursive: false }, onEvent);
    }
    throw err;
  }
}
