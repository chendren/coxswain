/**
 * Hard-rule invariants for OSS trust: plan-only AWS, no CreateStack APIs.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeStackHealth } from "../src/stack-health";

const ROOT = join(import.meta.dirname, "..", "src");
const AWS_PKG = join(import.meta.dirname, "..", "..", "cx-aws", "src");

function walkTs(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walkTs(p));
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** Executable CreateStack / UpdateStack / DeleteStack call shapes (not prose). */
const FORBIDDEN = [
  /CreateStack\s*\(/,
  /UpdateStack\s*\(/,
  /DeleteStack\s*\(/,
  /create-stack/,
  /update-stack/,
  /delete-stack/,
  /\.createStack\s*\(/,
  /\.updateStack\s*\(/,
  /\.deleteStack\s*\(/,
];

describe("hard rules: plan-only AWS", () => {
  it("cx-ops and cx-aws sources never call Create/Update/DeleteStack", () => {
    const files = [...walkTs(ROOT), ...walkTs(AWS_PKG)];
    expect(files.length).toBeGreaterThan(5);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const re of FORBIDDEN) {
        if (re.test(text)) hits.push(`${file}: ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("stack ready requires platform, not only ollama", async () => {
    const stack = await probeStackHealth({
      platformBaseUrl: "http://127.0.0.1:1",
      ollamaBaseUrl: "http://127.0.0.1:1",
    });
    expect(stack.platform.ok).toBe(false);
    expect(stack.ready).toBe(false);
  });
});
