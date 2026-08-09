import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "node:os";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/commands/doctor";

async function tmpProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cox-doctor-"));
}

function collector(): { lines: string[]; write: (l: string) => void } {
  const lines: string[] = [];
  return { lines, write: (l) => lines.push(l) };
}

describe("R10.1: cox doctor", () => {
  it("passes every check (node/config/env/.cox writable/reachable) and returns true", async () => {
    const cwd = await tmpProject();
    const { lines, write } = collector();
    const ok = await runDoctor({
      cwd,
      offline: false,
      nodeVersion: "v22.5.0",
      env: { ANTHROPIC_API_KEY: "sk-test-key" },
      checkReachability: async () => true,
      write,
    });
    expect(ok).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.startsWith("✓")).toBe(true);
  });

  it("fails when the node major version is below 20", async () => {
    const cwd = await tmpProject();
    const { lines, write } = collector();
    const ok = await runDoctor({
      cwd,
      offline: true,
      nodeVersion: "v18.19.0",
      env: { ANTHROPIC_API_KEY: "sk-test-key" },
      write,
    });
    expect(ok).toBe(false);
    expect(lines.some((l) => l.startsWith("✗") && l.includes("node >= 20"))).toBe(true);
  });

  it("fails when cox.config.json does not parse", async () => {
    const cwd = await tmpProject();
    await writeFile(join(cwd, "cox.config.json"), "{ not valid json", "utf8");
    const { lines, write } = collector();
    const ok = await runDoctor({
      cwd,
      offline: true,
      nodeVersion: "v22.0.0",
      env: {},
      write,
    });
    expect(ok).toBe(false);
    expect(lines.some((l) => l.startsWith("✗") && l.includes("config parses"))).toBe(true);
    // Downstream checks that need a parsed config are skipped, not crashed.
    expect(lines.some((l) => l.includes("is writable"))).toBe(false);
  });

  it("offline: missing api keys are advisory and still pass", async () => {
    const cwd = await tmpProject();
    const { lines, write } = collector();
    const ok = await runDoctor({
      cwd,
      offline: true,
      nodeVersion: "v22.0.0",
      env: {}, // ANTHROPIC_API_KEY deliberately absent — offline-first
      write,
    });
    expect(ok).toBe(true);
    expect(lines.some((l) => l.includes("optional offline") && l.includes("ANTHROPIC_API_KEY"))).toBe(true);
  });

  it("online: fails when the configured provider's apiKeyEnv is not set", async () => {
    const cwd = await tmpProject();
    const { lines, write } = collector();
    const ok = await runDoctor({
      cwd,
      offline: false,
      nodeVersion: "v22.0.0",
      env: {},
      checkReachability: async () => true,
      write,
    });
    expect(ok).toBe(false);
    expect(lines.some((l) => l.startsWith("✗") && l.includes("ANTHROPIC_API_KEY"))).toBe(true);
  });

  it("skips the apiKeyEnv check for an openai-compat entry with no apiKeyEnv (local server)", async () => {
    const cwd = await tmpProject();
    await writeFile(
      join(cwd, "cox.config.json"),
      JSON.stringify({
        providers: { openaiCompat: [{ id: "ollama", baseUrl: "http://localhost:11434/v1", models: ["llama3"] }] },
      }),
      "utf8",
    );
    const { lines, write } = collector();
    await runDoctor({ cwd, offline: true, nodeVersion: "v22.0.0", env: { ANTHROPIC_API_KEY: "k" }, write });
    expect(lines.some((l) => l.includes("ollama"))).toBe(false);
  });

  (platform() === "win32" ? it.skip : it)(
    "fails when .cox/ is not writable",
    async () => {
      const cwd = await tmpProject();
      await mkdir(join(cwd, ".cox"), { recursive: true });
      await chmod(join(cwd, ".cox"), 0o444);
      try {
        const { lines, write } = collector();
        const ok = await runDoctor({
          cwd,
          offline: true,
          nodeVersion: "v22.0.0",
          env: { ANTHROPIC_API_KEY: "k" },
          write,
        });
        expect(ok).toBe(false);
        expect(lines.some((l) => l.startsWith("✗") && l.includes("is writable"))).toBe(true);
      } finally {
        await chmod(join(cwd, ".cox"), 0o755); // restore so mkdtemp cleanup can remove it
      }
    },
  );

  it("fails when the provider reachability check returns false", async () => {
    const cwd = await tmpProject();
    const { lines, write } = collector();
    const ok = await runDoctor({
      cwd,
      offline: false,
      nodeVersion: "v22.0.0",
      env: { ANTHROPIC_API_KEY: "k" },
      checkReachability: async () => false,
      write,
    });
    expect(ok).toBe(false);
    expect(lines.some((l) => l.startsWith("✗") && l.includes("reachable"))).toBe(true);
  });

  it("fails (not crashes) when the reachability check throws, reporting the error as the detail", async () => {
    const cwd = await tmpProject();
    const { lines, write } = collector();
    const ok = await runDoctor({
      cwd,
      offline: false,
      nodeVersion: "v22.0.0",
      env: { ANTHROPIC_API_KEY: "k" },
      checkReachability: async () => {
        throw new Error("@cox/providers not wired");
      },
      write,
    });
    expect(ok).toBe(false);
    expect(lines.some((l) => l.includes("reachable") && l.includes("@cox/providers not wired"))).toBe(true);
  });

  it("--offline skips the reachability check entirely (no line emitted)", async () => {
    const cwd = await tmpProject();
    const { lines, write } = collector();
    const ok = await runDoctor({
      cwd,
      offline: true,
      nodeVersion: "v22.0.0",
      env: { ANTHROPIC_API_KEY: "k" },
      write,
    });
    expect(ok).toBe(true);
    expect(lines.some((l) => l.includes("reachable"))).toBe(false);
  });
});
