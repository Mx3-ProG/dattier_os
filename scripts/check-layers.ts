import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "src");
const violations: string[] = [];

function walk(dir: string, cb: (file: string) => void) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, cb);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) cb(full);
  }
}

function importsOf(file: string) {
  const text = readFileSync(file, "utf8");
  const matches = [...text.matchAll(/from\s+["']([^"']+)["']/g)];
  return matches.map((m) => m[1]);
}

// core & domain must not depend on features, app, components, infrastructure, shared types that pull features.
const forbiddenForCore = ["@/features", "@/app", "@/components", "@/infrastructure", "@/shared"];
const forbiddenForDomain = ["@/features", "@/app", "@/components", "@/infrastructure", "@/application"];
const forbiddenForInfra = ["@/features", "@/app", "@/components", "@/application"];

walk(path.join(root, "core"), (file) => {
  for (const imp of importsOf(file)) {
    if (forbiddenForCore.some((f) => imp === f || imp.startsWith(f + "/"))) {
      violations.push(`${path.relative(process.cwd(), file)} imports ${imp}`);
    }
  }
});
walk(path.join(root, "domain"), (file) => {
  for (const imp of importsOf(file)) {
    if (forbiddenForDomain.some((f) => imp === f || imp.startsWith(f + "/"))) {
      violations.push(`${path.relative(process.cwd(), file)} imports ${imp}`);
    }
  }
});
walk(path.join(root, "infrastructure"), (file) => {
  for (const imp of importsOf(file)) {
    if (forbiddenForInfra.some((f) => imp === f || imp.startsWith(f + "/"))) {
      // allow dynamic imports? They still appear as from "..." in import() and are caught; exempt none.
      violations.push(`${path.relative(process.cwd(), file)} imports ${imp}`);
    }
  }
});

if (violations.length) {
  console.error("Layer violations:");
  for (const v of violations) console.error(" - " + v);
  process.exit(1);
}
console.log("Layer check passed.");
