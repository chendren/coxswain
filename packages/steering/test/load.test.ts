import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSteeringStore } from "../src/store";
import { makeConfig, makeTmpCwd, writeSteeringFile } from "./helpers";

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
