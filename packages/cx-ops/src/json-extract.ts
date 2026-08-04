/**
 * Deterministic weak-output cleanup for model JSON (no regex).
 * Strips fences, finds outermost {…} or […] object/array.
 */

export function extractJsonText(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    const lines = text.split("\n");
    const body: string[] = [];
    let started = false;
    for (const line of lines) {
      if (!started) {
        if (line.trim().startsWith("```")) {
          started = true;
        }
        continue;
      }
      if (line.trim().startsWith("```")) break;
      body.push(line);
    }
    text = body.join("\n").trim();
  }

  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  let start = -1;
  let open = "";
  let close = "";
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    start = objStart;
    open = "{";
    close = "}";
  } else if (arrStart >= 0) {
    start = arrStart;
    open = "[";
    close = "]";
  }
  if (start < 0) return text;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

export function parseJsonLoose<T = unknown>(raw: string): T {
  return JSON.parse(extractJsonText(raw)) as T;
}
