import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { resolve, basename } from "node:path";

/**
 * Récupère les composants React Bits choisis (variante TypeScript + CSS) et les
 * dépose dans `src/components/reactbits/<Nom>/`. Licence : MIT + Commons Clause
 * — usage commercial autorisé, redistribution de la bibliothèque interdite.
 *
 * Usage : npm run reactbits:fetch [-- --force]
 */
const COMPONENTS = [
  "ShinyText",
  "GradientText",
  "GlareHover",
  "ClickSpark",
] as const;

const root = process.cwd();
const base = resolve(root, "src/components/reactbits");
const force = process.argv.includes("--force");

for (const name of COMPONENTS) {
  const response = await fetch(`https://reactbits.dev/r/${name}-TS-CSS`);
  if (!response.ok) {
    console.error(`✖ ${name} : HTTP ${response.status}`);
    continue;
  }
  const item = (await response.json()) as {
    files?: { path: string; content: string }[];
  };
  const dir = resolve(base, name);
  if (force && existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  for (const file of item.files ?? []) {
    const path = resolve(dir, basename(file.path));
    writeFileSync(path, file.content);
    console.log(`✔ ${name}/${basename(file.path)}`);
  }
}
console.log("\nComposants prêts dans src/components/reactbits/");
