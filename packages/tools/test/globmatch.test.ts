import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { globToRegExp } from "../src/globmatch";
import { walk } from "../src/walk";
import { withTmpDir } from "./helpers/tmp";

describe("globToRegExp (R8.5)", () => {
  const cases: Array<{ pattern: string; matches: string[]; rejects: string[] }> = [
    {
      pattern: "*.ts",
      matches: ["a.ts", "index.ts"],
      rejects: ["a/b.ts", "a.tsx", "a.js"],
    },
    {
      pattern: "a?.ts",
      matches: ["ab.ts", "ax.ts"],
      rejects: ["a.ts", "abc.ts"],
    },
    {
      pattern: "**/*.ts",
      matches: ["a.ts", "src/a.ts", "src/sub/a.ts"],
      rejects: ["a.js", "src/a.js"],
    },
    {
      pattern: "src/**",
      matches: ["src/a.ts", "src/sub/a.ts"],
      rejects: ["lib/a.ts"],
    },
    {
      pattern: "{foo,bar}.ts",
      matches: ["foo.ts", "bar.ts"],
      rejects: ["baz.ts", "foobar.ts"],
    },
    {
      pattern: "src/{a,b}/*.ts",
      matches: ["src/a/x.ts", "src/b/y.ts"],
      rejects: ["src/c/x.ts"],
    },
    {
      pattern: "a.b",
      matches: ["a.b"],
      rejects: ["aXb", "a.b.c"],
    },
  ];

  for (const { pattern, matches, rejects } of cases) {
    const re = globToRegExp(pattern);
    for (const m of matches) {
      it(`"${pattern}" matches "${m}"`, () => {
        expect(re.test(m)).toBe(true);
      });
    }
    for (const r of rejects) {
      it(`"${pattern}" rejects "${r}"`, () => {
        expect(re.test(r)).toBe(false);
      });
    }
  }
});

describe("walk", () => {
  it("yields files with mtimes, skipping node_modules and .git", async () =>
    withTmpDir(async (dir) => {
      await mkdir(join(dir, "src"), { recursive: true });
      await mkdir(join(dir, "node_modules", "pkg"), { recursive: true });
      await mkdir(join(dir, ".git", "objects"), { recursive: true });

      await writeFile(join(dir, "src", "a.ts"), "a");
      await writeFile(join(dir, "node_modules", "pkg", "index.js"), "x");
      await writeFile(join(dir, ".git", "objects", "abc"), "x");
      await writeFile(join(dir, "top.txt"), "top");

      const results: string[] = [];
      for await (const entry of walk(dir)) {
        results.push(entry.path);
        expect(typeof entry.mtimeMs).toBe("number");
        expect(entry.mtimeMs).toBeGreaterThan(0);
      }

      expect(results.sort()).toEqual(["src/a.ts", "top.txt"]);
    }));

  it("uses POSIX-style relative paths", async () =>
    withTmpDir(async (dir) => {
      await mkdir(join(dir, "a", "b"), { recursive: true });
      await writeFile(join(dir, "a", "b", "c.ts"), "x");
      const results: string[] = [];
      for await (const entry of walk(dir)) results.push(entry.path);
      expect(results).toEqual(["a/b/c.ts"]);
    }));

  it("reflects real mtimes (newer file has a larger mtimeMs)", async () =>
    withTmpDir(async (dir) => {
      await writeFile(join(dir, "old.txt"), "x");
      await writeFile(join(dir, "new.txt"), "x");
      const older = new Date(Date.now() - 60_000);
      await utimes(join(dir, "old.txt"), older, older);

      const byPath = new Map<string, number>();
      for await (const entry of walk(dir)) byPath.set(entry.path, entry.mtimeMs);

      expect(byPath.get("new.txt")! > byPath.get("old.txt")!).toBe(true);
    }));

  it("returns nothing for a missing directory instead of throwing", async () =>
    withTmpDir(async (dir) => {
      const results: string[] = [];
      for await (const entry of walk(join(dir, "nope"))) results.push(entry.path);
      expect(results).toEqual([]);
    }));
});
