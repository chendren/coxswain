#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";

const packagesDir = new URL("../packages", import.meta.url).pathname;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && full.endsWith(".js")) out.push(full);
  }
  return out;
}

function fixFile(file) {
  let content = readFileSync(file, "utf8");
  const original = content;
  const fileDir = file.substring(0, file.lastIndexOf("/"));

  function resolveImport(importPath) {
    // importPath is like "./ontology" or "../core"
    // Check if already has extension
    if (importPath.endsWith(".js") || importPath.endsWith(".json") || importPath.endsWith(".mjs") || importPath.endsWith("/")) {
      return null; // already handled, but check for directory .js misfix
    }
    if (/\.[a-zA-Z0-9]+$/.test(importPath)) return null;
    // Resolve absolute path relative to fileDir
    const absBase = join(fileDir, importPath);
    // Check if absBase is a directory with index.js
    try {
      if (statSync(absBase).isDirectory()) {
        // check for index.js inside
        try {
          if (statSync(join(absBase, "index.js")).isFile()) return importPath + "/index.js";
        } catch {}
        return importPath + ".js"; // fallback
      }
    } catch {}
    // Check if absBase + ".js" exists as file
    try {
      if (statSync(absBase + ".js").isFile()) return importPath + ".js";
    } catch {}
    // Check if absBase is directory with index
    try {
      if (statSync(join(absBase, "index.js")).isFile()) return importPath + "/index.js";
    } catch {}
    // fallback to .js
    return importPath + ".js";
  }

  // Fix from "..."
  content = content.replace(
    /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
    (m, p1, p2, p3) => {
      // Handle already .js but possibly mis-fixed directory: e.g. "./ontology.js" where ontology is dir
      if (p2.endsWith(".js")) {
        const withoutJs = p2.slice(0, -3);
        const absBase = join(fileDir, withoutJs);
        try {
          if (statSync(absBase).isDirectory() && statSync(join(absBase, "index.js")).isFile()) {
            // was incorrectly mapped to .js, should be /index.js
            // Check if .js file exists - if not, fix
            try {
              statSync(join(fileDir, p2));
              return m; // .js exists, keep
            } catch {
              return `${p1}${withoutJs}/index.js${p3}`;
            }
          }
        } catch {}
        return m;
      }
      if (p2.endsWith(".json") || p2.endsWith(".mjs") || p2.endsWith("/")) return m;
      if (/\.[a-zA-Z0-9]+$/.test(p2)) return m;
      const fixed = resolveImport(p2);
      return fixed ? `${p1}${fixed}${p3}` : m;
    }
  );
  // Handle import("./foo")
  content = content.replace(
    /(import\s*\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g,
    (m, p1, p2, p3) => {
      if (p2.endsWith(".js") || p2.endsWith(".json") || p2.endsWith(".mjs") || p2.endsWith("/")) return m;
      if (/\.[a-zA-Z0-9]+$/.test(p2)) return m;
      const fixed = resolveImport(p2);
      return fixed ? `${p1}${fixed}${p3}` : m;
    }
  );
  if (content !== original) {
    writeFileSync(file, content);
    return true;
  }
  return false;
}

let fixed = 0;
const pkgDirs = readdirSync(packagesDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(packagesDir, d.name, "dist")).filter(p => {
  try { return statSync(p).isDirectory(); } catch { return false; }
});

for (const dist of pkgDirs) {
  for (const file of walk(dist)) {
    if (fixFile(file)) fixed++;
  }
}
console.log(`fixed ${fixed} files`);
