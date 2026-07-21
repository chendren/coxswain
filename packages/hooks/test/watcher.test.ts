import { watch as nodeWatch } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Vitest hoists vi.mock calls above regular imports, but the flag below
// must exist before the factory runs — vi.hoisted() guarantees that.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { watchBehavior } = vi.hoisted(() => ({
  watchBehavior: { forceNextCallToThrowUnavailable: false },
}));

// vi.spyOn fails on node:fs's `watch` in this setup ("Cannot redefine
// property"), same as node:child_process — see packages/hooks/NOTES.md.
// vi.mock is used instead, delegating to the real implementation except
// when a test explicitly arms the one-shot failure flag (R11.1 fallback).
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    watch: (...args: Parameters<typeof actual.watch>) => {
      if (watchBehavior.forceNextCallToThrowUnavailable) {
        watchBehavior.forceNextCallToThrowUnavailable = false;
        const err = new Error("recursive watch not supported (simulated)") as NodeJS.ErrnoException;
        err.code = "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM";
        throw err;
      }
      return actual.watch(...args);
    },
  };
});

import { createFileWatcher } from "../src/watcher";
import { makeAgentHook, makeTmpCwd, waitFor } from "./helpers";

async function probeRecursiveWatchSupport(): Promise<boolean> {
  const dir = await makeTmpCwd();
  try {
    const w = nodeWatch(dir, { recursive: true }, () => {});
    w.close();
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") return false;
    throw err;
  }
}

// Capability probe (design.md): recursive-dependent cases skip on platforms
// that don't support it; the fallback itself (below) is always exercised
// via the forced-failure mock, independent of the host's real capability.
const RECURSIVE_WATCH_SUPPORTED = await probeRecursiveWatchSupport();

beforeEach(() => {
  watchBehavior.forceNextCallToThrowUnavailable = false;
});

function collector(): { triggers: { hook: string; file: string }[]; onTrigger: (hook: { name: string }, file: string) => void } {
  const triggers: { hook: string; file: string }[] = [];
  return { triggers, onTrigger: (hook, file) => triggers.push({ hook: hook.name, file }) };
}

describe("createFileWatcher", () => {
  it.skipIf(!RECURSIVE_WATCH_SUPPORTED)(
    "R11.1/R11.2: recursive watch detects a change in a subdirectory and fires the matching fileSave hook",
    async () => {
      const cwd = await makeTmpCwd();
      await mkdir(join(cwd, "src", "nested"), { recursive: true });
      const hook = makeAgentHook({ name: "ts-hook", trigger: { type: "fileSave", pattern: "src/**/*.ts" } });
      const { triggers, onTrigger } = collector();
      const watcher = createFileWatcher({ cwd, hooks: [hook], onTrigger });

      try {
        await writeFile(join(cwd, "src", "nested", "thing.ts"), "export {}\n", "utf8");
        await waitFor(() => triggers.length > 0);
        expect(triggers).toEqual([{ hook: "ts-hook", file: "src/nested/thing.ts" }]);
      } finally {
        watcher.close();
      }
    },
    { retry: 2 },
  );

  it(
    "R11.1: falls back to a non-recursive watch when recursive watch throws ERR_FEATURE_UNAVAILABLE_ON_PLATFORM, and still detects top-level changes",
    async () => {
      const cwd = await makeTmpCwd();
      watchBehavior.forceNextCallToThrowUnavailable = true;
      const hook = makeAgentHook({ name: "top-level-hook", trigger: { type: "fileSave", pattern: "*.md" } });
      const { triggers, onTrigger } = collector();
      const watcher = createFileWatcher({ cwd, hooks: [hook], onTrigger });

      try {
        await writeFile(join(cwd, "readme.md"), "# hi\n", "utf8");
        await waitFor(() => triggers.length > 0);
        expect(triggers).toEqual([{ hook: "top-level-hook", file: "readme.md" }]);
      } finally {
        watcher.close();
      }
    },
    { retry: 2 },
  );

  it(
    "R11.2: picomatch runs with dot:true, so fileSave patterns reach dotfiles",
    async () => {
      const cwd = await makeTmpCwd();
      const hook = makeAgentHook({ name: "dot-hook", trigger: { type: "fileSave", pattern: "*" } });
      const { triggers, onTrigger } = collector();
      const watcher = createFileWatcher({ cwd, hooks: [hook], onTrigger });

      try {
        await writeFile(join(cwd, ".env.example"), "KEY=value\n", "utf8");
        await waitFor(() => triggers.length > 0);
        expect(triggers.map((t) => t.file)).toContain(".env.example");
      } finally {
        watcher.close();
      }
    },
    { retry: 2 },
  );

  it(
    "R11.3: changes under .git/, node_modules/, and .cox/ never trigger, even with a catch-all pattern",
    async () => {
      const cwd = await makeTmpCwd();
      const hook = makeAgentHook({ name: "any-hook", trigger: { type: "fileSave", pattern: "**/*" } });
      const { triggers, onTrigger } = collector();
      const watcher = createFileWatcher({ cwd, hooks: [hook], onTrigger });

      try {
        await mkdir(join(cwd, ".git"), { recursive: true });
        await mkdir(join(cwd, "node_modules", "pkg"), { recursive: true });
        await mkdir(join(cwd, ".cox", "steering"), { recursive: true });
        await writeFile(join(cwd, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8");
        await writeFile(join(cwd, "node_modules", "pkg", "index.js"), "", "utf8");
        await writeFile(join(cwd, ".cox", "steering", "product.md"), "# p\n", "utf8");
        // A real, non-ignored change afterward proves the watcher was live
        // throughout and simply chose not to fire for the ignored paths.
        await writeFile(join(cwd, "real.txt"), "hi\n", "utf8");
        await waitFor(() => triggers.some((t) => t.file === "real.txt"));

        expect(triggers.map((t) => t.file)).toEqual(["real.txt"]);
      } finally {
        watcher.close();
      }
    },
    { retry: 2 },
  );

  it(
    "R11.3: events for paths that no longer exist by event time are ignored",
    async () => {
      const cwd = await makeTmpCwd();
      const hook = makeAgentHook({ name: "any-hook", trigger: { type: "fileSave", pattern: "*.tmp" } });
      const { triggers, onTrigger } = collector();
      const watcher = createFileWatcher({ cwd, hooks: [hook], onTrigger });

      try {
        const filePath = join(cwd, "scratch.tmp");
        await writeFile(filePath, "temp\n", "utf8");
        await rm(filePath);
        await new Promise((resolve) => setTimeout(resolve, 700));
        expect(triggers).toEqual([]);
      } finally {
        watcher.close();
      }
    },
    { retry: 1 },
  );

  it(
    "R11.2: a 500ms trailing debounce collapses rapid writes to the same file into a single trigger",
    async () => {
      const cwd = await makeTmpCwd();
      const hook = makeAgentHook({ name: "debounced", trigger: { type: "fileSave", pattern: "*.txt" } });
      const { triggers, onTrigger } = collector();
      const watcher = createFileWatcher({ cwd, hooks: [hook], onTrigger });

      try {
        const filePath = join(cwd, "rapid.txt");
        for (let i = 0; i < 5; i++) {
          await writeFile(filePath, `write ${i}\n`, "utf8");
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        await waitFor(() => triggers.length > 0, { timeoutMs: 2000 });
        // Give a bit longer to prove a second trigger doesn't sneak in.
        await new Promise((resolve) => setTimeout(resolve, 600));
        expect(triggers).toEqual([{ hook: "debounced", file: "rapid.txt" }]);
      } finally {
        watcher.close();
      }
    },
    { retry: 2, timeout: 10_000 },
  );

  it("R11.5: manual-trigger hooks never fire from the watcher", async () => {
    const cwd = await makeTmpCwd();
    const manualHook = makeAgentHook({ name: "manual-only", trigger: { type: "manual" } });
    const { triggers, onTrigger } = collector();
    const watcher = createFileWatcher({ cwd, hooks: [manualHook], onTrigger });

    try {
      await writeFile(join(cwd, "anything.ts"), "export {}\n", "utf8");
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(triggers).toEqual([]);
    } finally {
      watcher.close();
    }
  });

  it("R11.4: close() cancels pending debounced triggers — no trigger fires after close", async () => {
    const cwd = await makeTmpCwd();
    const hook = makeAgentHook({ name: "cancel-me", trigger: { type: "fileSave", pattern: "*.txt" } });
    const { triggers, onTrigger } = collector();
    const watcher = createFileWatcher({ cwd, hooks: [hook], onTrigger });

    await writeFile(join(cwd, "closing.txt"), "hi\n", "utf8");
    // Close well before the 500ms debounce would have fired.
    await new Promise((resolve) => setTimeout(resolve, 100));
    watcher.close();
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(triggers).toEqual([]);
  });

  it("R11.4: close() stops the underlying watcher — changes afterward never trigger", async () => {
    const cwd = await makeTmpCwd();
    const hook = makeAgentHook({ name: "stop-me", trigger: { type: "fileSave", pattern: "*.txt" } });
    const { triggers, onTrigger } = collector();
    const watcher = createFileWatcher({ cwd, hooks: [hook], onTrigger });
    watcher.close();

    await writeFile(join(cwd, "after-close.txt"), "hi\n", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(triggers).toEqual([]);
  });
});
