// One-shot codemod: rewrite `@/x/y` imports in apps/api/src to relative paths
// (tsc does not rewrite tsconfig path aliases in emitted JS).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";

const SRC = join(process.cwd(), "apps", "api", "src");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

let filesChanged = 0;
let importsChanged = 0;

for (const file of walk(SRC)) {
  const original = readFileSync(file, "utf8");
  const updated = original.replace(
    /(from\s+|import\()(['"])@\/([^'"]+)\2/g,
    (_m, prefix, quote, target) => {
      let rel = relative(dirname(file), join(SRC, target)).split(sep).join(posix.sep);
      if (!rel.startsWith(".")) rel = `./${rel}`;
      importsChanged++;
      return `${prefix}${quote}${rel}${quote}`;
    },
  );
  if (updated !== original) {
    writeFileSync(file, updated);
    filesChanged++;
  }
}

console.log(`Rewrote ${importsChanged} imports in ${filesChanged} files.`);
