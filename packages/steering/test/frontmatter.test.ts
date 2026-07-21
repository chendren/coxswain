import { describe, expect, it } from "vitest";
import { parseFrontMatter } from "../src/frontmatter";

describe("parseFrontMatter", () => {
  it("R1.2: parses a valid front matter block and strips it from body", () => {
    const raw = '---\ninclusion: fileMatch\nfileMatchPattern: "src/**"\n---\n# Body\ntext\n';
    const { data, body } = parseFrontMatter(raw);
    expect(data).toEqual({ inclusion: "fileMatch", fileMatchPattern: "src/**" });
    expect(body).toBe("# Body\ntext\n");
  });

  it("R1.2: a file with no front matter block returns data:null and body === raw", () => {
    const raw = "# Just a doc\nno front matter here\n";
    const { data, body } = parseFrontMatter(raw);
    expect(data).toBeNull();
    expect(body).toBe(raw);
  });

  it("R1.2: a bare '---' with no trailing newline is not a valid opening delimiter", () => {
    const raw = "---";
    const { data, body } = parseFrontMatter(raw);
    expect(data).toBeNull();
    expect(body).toBe(raw);
  });

  it("R1.2: an unclosed front matter block is treated as no block (data:null, body === raw)", () => {
    const raw = "---\ninclusion: always\n# no closing delimiter anywhere\nbody text\n";
    const { data, body } = parseFrontMatter(raw);
    expect(data).toBeNull();
    expect(body).toBe(raw);
  });

  it("R1.4: invalid YAML returns data:null and the full raw file as body", () => {
    const raw = "---\ninclusion: [unterminated\n---\nbody\n";
    const { data, body } = parseFrontMatter(raw);
    expect(data).toBeNull();
    expect(body).toBe(raw);
  });

  it("R1.4: front matter that parses to a non-object (a bare scalar) is treated as invalid", () => {
    const raw = "---\njust a scalar string, no colon\n---\nbody\n";
    const { data, body } = parseFrontMatter(raw);
    expect(data).toBeNull();
    expect(body).toBe(raw);
  });

  it("R1.4: front matter that parses to an array is treated as invalid", () => {
    const raw = "---\n- a\n- b\n---\nbody\n";
    const { data, body } = parseFrontMatter(raw);
    expect(data).toBeNull();
    expect(body).toBe(raw);
  });

  it("R1.2: CRLF opening/closing delimiters are recognized and stripped", () => {
    const raw = "---\r\ninclusion: always\r\n---\r\n# Body\r\ntext\r\n";
    const { data, body } = parseFrontMatter(raw);
    expect(data).toEqual({ inclusion: "always" });
    expect(body).toBe("# Body\r\ntext\r\n");
  });

  it("R1.2: an empty front matter block is valid (empty data object), body stripped", () => {
    const raw = "---\n---\nbody only\n";
    const { data, body } = parseFrontMatter(raw);
    expect(data).toEqual({});
    expect(body).toBe("body only\n");
  });

  it("R1.2: front matter closing delimiter as the very last line with no trailing newline", () => {
    const raw = "---\ninclusion: manual\n---";
    const { data, body } = parseFrontMatter(raw);
    expect(data).toEqual({ inclusion: "manual" });
    expect(body).toBe("");
  });
});
