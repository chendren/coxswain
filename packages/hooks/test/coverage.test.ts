import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REQUIREMENT_IDS = [
  "R5.1",
  "R5.2",
  "R5.3",
  "R6.1",
  "R6.2",
  "R6.3",
  "R7.1",
  "R7.2",
  "R7.3",
  "R7.4",
  "R8.1",
  "R8.2",
  "R8.3",
  "R8.4",
  "R8.5",
  "R9.1",
  "R9.2",
  "R9.3",
  "R9.4",
  "R10.1",
  "R10.2",
  "R10.3",
  "R10.4",
  "R11.1",
  "R11.2",
  "R11.3",
  "R11.4",
  "R11.5",
];

function allOtherTestSource(): string {
  const files = readdirSync(__dirname).filter(
    (f) => f.endsWith(".test.ts") && f !== "coverage.test.ts",
  );
  return files.map((f) => readFileSync(join(__dirname, f), "utf8")).join("\n");
}

describe("hooks spec coverage sweep", () => {
  it("every R5.1-R11.5 requirement id is referenced by at least one test", () => {
    const source = allOtherTestSource();
    const missing = REQUIREMENT_IDS.filter((id) => !source.includes(id));
    expect(missing).toEqual([]);
  });

  it("src/index.ts exports exactly createHookEngine, createFileWatcher", () => {
    const indexSource = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8");

    expect(indexSource).not.toMatch(/export\s+default/);
    expect(indexSource).not.toMatch(/export\s+\*/);

    const exportNames = [...indexSource.matchAll(/export\s*\{([^}]+)\}/g)].flatMap((m) =>
      m[1]!.split(",").map((s) => s.trim()).filter(Boolean),
    );

    expect(exportNames.sort()).toEqual(["createFileWatcher", "createHookEngine"].sort());
  });
});
