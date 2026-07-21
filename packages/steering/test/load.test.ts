import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSteeringStore } from "../src/store";
import { makeConfig, makeTmpCwd, writeProjectFile, writeSteeringFile } from "./helpers";

describe("loadAll — .cox/steering docs", () => {
  it("R1.1: returns one SteeringDoc per top-level *.md with name/path/body/tokens mapped", async () => {
    const cwd = await makeTmpCwd();
    const raw = '---\ninclusion: fileMatch\nfileMatchPattern: "src/**"\n---\n# Tech\nBody content.\n';
    await writeSteeringFile(cwd, "tech.md", raw);
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: false } }) });

    const docs = await store.loadAll(cwd);

    expect(docs).toHaveLength(1);
    const doc = docs[0]!;
    expect(doc.name).toBe("tech");
    expect(doc.path).toBe(join(cwd, ".cox", "steering", "tech.md"));
    expect(doc.body).toBe("# Tech\nBody content.\n");
    expect(doc.tokens).toBe(Math.ceil("# Tech\nBody content.\n".length / 4));
    expect(doc.imported).toBe(false);
  });

  it("R1.3: a file with no front matter defaults to inclusion:always with the whole file as body", async () => {
    const cwd = await makeTmpCwd();
    const raw = "# Product\nNo front matter at all.\n";
    await writeSteeringFile(cwd, "product.md", raw);
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: false } }) });

    const docs = await store.loadAll(cwd);

    expect(docs[0]?.inclusion).toBe("always");
    expect(docs[0]?.body).toBe(raw);
  });

  it("R1.5: inclusion:fileMatch without a fileMatchPattern downgrades to manual", async () => {
    const cwd = await makeTmpCwd();
    await writeSteeringFile(cwd, "orphan.md", "---\ninclusion: fileMatch\n---\nbody\n");
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: false } }) });

    const docs = await store.loadAll(cwd);

    expect(docs[0]?.inclusion).toBe("manual");
  });

  it("R1.5: inclusion:fileMatch with an empty-string fileMatchPattern also downgrades to manual", async () => {
    const cwd = await makeTmpCwd();
    await writeSteeringFile(
      cwd,
      "orphan2.md",
      '---\ninclusion: fileMatch\nfileMatchPattern: ""\n---\nbody\n',
    );
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: false } }) });

    const docs = await store.loadAll(cwd);

    expect(docs[0]?.inclusion).toBe("manual");
  });

  it("R1.6: a missing .cox/steering directory does not throw and yields no docs", async () => {
    const cwd = await makeTmpCwd();
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: false } }) });

    await expect(store.loadAll(cwd)).resolves.toEqual([]);
  });

  it("R1.7: subdirectories and non-.md files under .cox/steering are ignored", async () => {
    const cwd = await makeTmpCwd();
    await writeSteeringFile(cwd, "real.md", "# Real\nkept\n");
    await writeSteeringFile(cwd, "notes.txt", "not markdown, ignored\n");
    await mkdir(join(cwd, ".cox", "steering", "nested"), { recursive: true });
    await writeFile(
      join(cwd, ".cox", "steering", "nested", "sneaky.md"),
      "# nested\nignored\n",
      "utf8",
    );
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: false } }) });

    const docs = await store.loadAll(cwd);

    expect(docs.map((d) => d.name)).toEqual(["real"]);
  });
});

describe("loadAll — compat imports", () => {
  it("R2.1: imports CLAUDE.md, AGENTS.md, and .github/copilot-instructions.md when importCompat is true", async () => {
    const cwd = await makeTmpCwd();
    await writeProjectFile(cwd, "CLAUDE.md", "# Claude instructions\n");
    await writeProjectFile(cwd, "AGENTS.md", "# Agents instructions (different)\n");
    await writeProjectFile(cwd, ".github/copilot-instructions.md", "# Copilot instructions\n");
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: true } }) });

    const docs = await store.loadAll(cwd);

    const byName = Object.fromEntries(docs.map((d) => [d.name, d]));
    expect(Object.keys(byName).sort()).toEqual(["AGENTS", "CLAUDE", "copilot-instructions"]);
    for (const name of ["AGENTS", "CLAUDE", "copilot-instructions"]) {
      expect(byName[name]?.imported).toBe(true);
      expect(byName[name]?.inclusion).toBe("always");
    }
    expect(byName.CLAUDE?.path).toBe(join(cwd, "CLAUDE.md"));
    expect(byName.AGENTS?.path).toBe(join(cwd, "AGENTS.md"));
    expect(byName["copilot-instructions"]?.path).toBe(
      join(cwd, ".github", "copilot-instructions.md"),
    );
  });

  it("R2.1: front matter in imported files is left in body untouched (never parsed/stripped)", async () => {
    const cwd = await makeTmpCwd();
    const raw = "---\ninclusion: manual\n---\n# Claude\nbody\n";
    await writeProjectFile(cwd, "CLAUDE.md", raw);
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: true } }) });

    const docs = await store.loadAll(cwd);

    const claude = docs.find((d) => d.name === "CLAUDE");
    expect(claude?.body).toBe(raw);
    expect(claude?.inclusion).toBe("always");
  });

  it("R2.2: byte-identical CLAUDE.md and AGENTS.md dedupe to CLAUDE only", async () => {
    const cwd = await makeTmpCwd();
    const shared = "# Shared instructions\nSame content in both files.\n";
    await writeProjectFile(cwd, "CLAUDE.md", shared);
    await writeProjectFile(cwd, "AGENTS.md", shared);
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: true } }) });

    const docs = await store.loadAll(cwd);

    expect(docs.map((d) => d.name)).toEqual(["CLAUDE"]);
  });

  it("R2.2: CLAUDE.md and AGENTS.md that merely differ by one byte are both imported", async () => {
    const cwd = await makeTmpCwd();
    await writeProjectFile(cwd, "CLAUDE.md", "# Instructions\nversion A\n");
    await writeProjectFile(cwd, "AGENTS.md", "# Instructions\nversion B\n");
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: true } }) });

    const docs = await store.loadAll(cwd);

    expect(docs.map((d) => d.name).sort()).toEqual(["AGENTS", "CLAUDE"]);
  });

  it("R2.3: importCompat:false imports none of the compat files", async () => {
    const cwd = await makeTmpCwd();
    await writeProjectFile(cwd, "CLAUDE.md", "# Claude\n");
    await writeProjectFile(cwd, "AGENTS.md", "# Agents\n");
    await writeProjectFile(cwd, ".github/copilot-instructions.md", "# Copilot\n");
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: false } }) });

    const docs = await store.loadAll(cwd);

    expect(docs).toEqual([]);
  });

  it("R2.1: compat imports are absent without error when the files don't exist", async () => {
    const cwd = await makeTmpCwd();
    const store = createSteeringStore({ config: makeConfig({ steering: { importCompat: true } }) });

    await expect(store.loadAll(cwd)).resolves.toEqual([]);
  });
});
