/**
 * Translate a glob pattern to a RegExp. Supports `**` (any number of path
 * segments, including zero), `*` (any chars except `/`), `?` (one char
 * except `/`), and `{a,b,c}` alternation. No nested braces, no `[...]`
 * character classes — not needed by any built-in tool in v1.
 */
export function globToRegExp(pattern: string): RegExp {
  let re = "";
  let i = 0;
  const n = pattern.length;

  while (i < n) {
    const c = pattern.charAt(i);

    if (c === "*") {
      if (pattern.charAt(i + 1) === "*") {
        let j = i + 2;
        if (pattern.charAt(j) === "/") {
          re += "(?:.*/)?"; // "**/"  → zero or more whole path segments
          j++;
        } else {
          re += ".*"; // trailing/bare "**" → anything, including "/"
        }
        i = j;
        continue;
      }
      re += "[^/]*";
      i++;
      continue;
    }

    if (c === "?") {
      re += "[^/]";
      i++;
      continue;
    }

    if (c === "{") {
      const close = pattern.indexOf("}", i);
      if (close === -1) {
        re += "\\{";
        i++;
        continue;
      }
      const options = pattern.slice(i + 1, close).split(",");
      re += "(?:" + options.map(escapeLiteral).join("|") + ")";
      i = close + 1;
      continue;
    }

    re += escapeLiteral(c);
    i++;
  }

  return new RegExp(`^${re}$`);
}

function escapeLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
