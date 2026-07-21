import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EventBus, configSchema } from "@cox/core";
import { loadDeps, NotWiredError } from "../src/deps";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");

const ENGINE_PACKAGES = [
  "@cox/providers",
  "@cox/router",
  "@cox/ledger",
  "@cox/agent",
  "@cox/tools",
  "@cox/spec",
  "@cox/steering",
  "@cox/hooks",
];

async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTsFiles(full)));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function staticImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const re = /^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m[1]) specifiers.push(m[1]);
  }
  return specifiers;
}

describe("R8.2: deps.ts NotWiredError boundary", () => {
  // Post-integration (M2): every lane is merged, so loadDeps now succeeds —
  // the stub-era "throws NotWiredError" assertion is inverted. The error
  // class itself remains the boundary for any future unwired package.
  it("loadDeps constructs the full engine graph now that all lanes are merged", async () => {
    const cfg = configSchema.parse({});
    const bus = new EventBus();
    const deps = await loadDeps(cfg, "/tmp/cox-deps-test-not-a-real-cwd", bus);
    expect(deps.registry).toBeDefined();
    expect(deps.ledger).toBeDefined();
    expect(deps.router).toBeDefined();
    expect(deps.agent).toBeDefined();
    expect(deps.specs).toBeDefined();
    expect(typeof deps.resolvePermission).toBe("function");
  });

  it("NotWiredError names the package in its message and pkg field", () => {
    const err = new NotWiredError("@cox/example");
    expect(err.pkg).toBe("@cox/example");
    expect(err.message).toBe("@cox/example not wired");
    expect(ENGINE_PACKAGES.length).toBeGreaterThan(0);
  });

  it("main.ts has no static imports of any engine package", async () => {
    const mainSrc = await readFile(join(srcDir, "main.ts"), "utf8");
    const imported = staticImportSpecifiers(mainSrc);
    for (const pkg of ENGINE_PACKAGES) {
      expect(imported).not.toContain(pkg);
    }
  });

  it("no source file other than deps.ts statically imports an engine package (grep-style)", async () => {
    const files = await listTsFiles(srcDir);
    for (const file of files) {
      if (file === join(srcDir, "deps.ts")) continue;
      const source = await readFile(file, "utf8");
      const imported = staticImportSpecifiers(source);
      for (const pkg of ENGINE_PACKAGES) {
        expect(imported, `${file} must not statically import ${pkg}`).not.toContain(pkg);
      }
    }
  });

  it("deps.ts imports every engine package exactly once (dynamically)", async () => {
    const depsSrc = await readFile(join(srcDir, "deps.ts"), "utf8");
    for (const pkg of ENGINE_PACKAGES) {
      const occurrences = depsSrc.split(`import("${pkg}")`).length - 1;
      expect(occurrences, `deps.ts should dynamic-import ${pkg} once`).toBe(1);
    }
  });
});
