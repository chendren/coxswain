import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REQUIREMENT_IDS = [
  "R1.1",
  "R1.2",
  "R1.3",
  "R1.4",
  "R1.5",
  "R1.6",
  "R1.7",
  "R2.1",
  "R2.2",
  "R2.3",
  "R3.1",
  "R3.2",
  "R3.3",
  "R3.4",
  "R3.5",
  "R4.1",
  "R4.2",
  "R4.3",
  "R4.4",
];

function allOtherTestSource(): string {
  const files = readdirSync(__dirname).filter(
    (f) => f.endsWith(".test.ts") && f !== "coverage.test.ts",
  );
  return files.map((f) => readFileSync(join(__dirname, f), "utf8")).join("\n");
}

describe("steering spec coverage sweep", () => {
  it("every R1.1-R4.4 requirement id is referenced by at least one test", () => {
    const source = allOtherTestSource();
    const missing = REQUIREMENT_IDS.filter((id) => !source.includes(id));
    expect(missing).toEqual([]);
  });

  it("src/index.ts exports exactly createSteeringStore, steeringWarnings, STEERING_TEMPLATES", () => {
    const indexSource = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8");

    expect(indexSource).not.toMatch(/export\s+default/);
    expect(indexSource).not.toMatch(/export\s+\*/);

    const exportNames = [...indexSource.matchAll(/export\s*\{([^}]+)\}/g)].flatMap((m) =>
      m[1]!.split(",").map((s) => s.trim()).filter(Boolean),
    );

    expect(exportNames.sort()).toEqual(
      ["STEERING_TEMPLATES", "createSteeringStore", "steeringWarnings"].sort(),
    );
  });
});
