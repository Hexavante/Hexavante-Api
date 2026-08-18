import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const distDir = join(fileURLToPath(new URL("..", import.meta.url)), "dist");

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      fixFile(full);
    }
  }
}

function resolvePath(baseDir, specifier) {
  const jsPath = join(baseDir, specifier + ".js");
  if (existsSync(jsPath)) return specifier + ".js";
  const indexPath = join(baseDir, specifier, "index.js");
  if (existsSync(indexPath)) return specifier + "/index.js";
  return specifier + ".js";
}

function fixFile(filePath) {
  let content = readFileSync(filePath, "utf-8");
  const original = content;
  const baseDir = dirname(filePath);

  content = content.replace(
    /(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
    (match, prefix, path, suffix) => {
      if (path.endsWith(".js") || path.endsWith(".mjs")) return match;
      const resolved = resolvePath(baseDir, path);
      return `${prefix}${resolved}${suffix}`;
    },
  );

  content = content.replace(
    /(import\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
    (match, prefix, path, suffix) => {
      if (path.endsWith(".js") || path.endsWith(".mjs")) return match;
      const resolved = resolvePath(baseDir, path);
      return `${prefix}${resolved}${suffix}`;
    },
  );

  if (content !== original) {
    writeFileSync(filePath, content, "utf-8");
  }
}

walk(distDir);
console.log("Import extensions fixed in dist/");
