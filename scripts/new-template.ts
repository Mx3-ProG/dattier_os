import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type Cfg = {
  id: string;
  name: string;
  category: string;
  description: string;
  premium: boolean;
  primary: string;
  background: string;
  heading: string;
  title: string;
  order: string[];
  surprise?: string;
  textColor?: string;
  mutedColor?: string;
  buttonTextColor?: string;
  svg?: string;
  css?: string;
};

const root = process.cwd();
const arg = process.argv[2];
if (!arg) {
  console.error("Usage: npm run template:new -- <config.json>");
  process.exit(1);
}
const cfg: Cfg = JSON.parse(readFileSync(resolve(arg), "utf8"));

const idRe = /^[a-z][a-z0-9-]*$/;
if (!idRe.test(cfg.id)) {
  console.error("id invalide (minuscules, chiffres, tirets).");
  process.exit(1);
}

// 1. schema.ts
const schemaPath = resolve(root, "src/features/cms/schema.ts");
let schema = readFileSync(schemaPath, "utf8");
if (schema.includes(`"${cfg.id}"`)) {
  console.error(`L'id "${cfg.id}" existe déjà dans schema.ts.`);
  process.exit(1);
}
// insert before the closing of z.enum([ ... ]) of presentationSchema.layout
const enumMarker = "layout: z.enum([";
const enumStart = schema.indexOf(enumMarker);
if (enumStart < 0) throw new Error("ancre schema introuvable");
const enumClose = schema.indexOf("])", enumStart);
if (enumClose < 0) throw new Error("fermeture enum introuvable");
schema =
  schema.slice(0, enumClose) +
  `    "${cfg.id}",\n` +
  schema.slice(enumClose);
writeFileSync(schemaPath, schema);
console.log("✔ schema.ts mis à jour");

// 2. templates.ts
const tplPath = resolve(root, "src/features/cms/templates.ts");
let tpl = readFileSync(tplPath, "utf8");
if (tpl.includes(`"${cfg.id}",\n    "${cfg.name}"`)) {
  console.error("modèle déjà présent.");
  process.exit(1);
}
const orderStr = JSON.stringify(cfg.order);
const call = `  template(
    "${cfg.id}",
    "${cfg.name}",
    "${cfg.category}",
    "${cfg.description}",
    ${cfg.premium},
    "${cfg.primary}",
    "${cfg.background}",
    "${cfg.heading}",
    "${cfg.title}",
    ${orderStr},
${cfg.textColor ? `    "${cfg.textColor}",\n` : ""}${cfg.mutedColor ? `    "${cfg.mutedColor}",\n` : ""}${cfg.buttonTextColor ? `    "${cfg.buttonTextColor}",\n` : ""}  ),
`;
// insert before the final ];
const lastClose = tpl.lastIndexOf("];");
if (lastClose < 0) throw new Error("ancre templates introuvable");
tpl = tpl.slice(0, lastClose) + call + tpl.slice(lastClose);
writeFileSync(tplPath, tpl);
console.log("✔ templates.ts mis à jour");

// 3. template-extras.tsx
const extrasPath = resolve(root, "src/components/cms-site/template-extras.tsx");
let extras = readFileSync(extrasPath, "utf8");
const surprise = cfg.surprise ?? `Bienvenue chez ${cfg.name}.`;
const entry = `                  ${cfg.id}: "${surprise}",\n`;
const anchor = "                }[p.layout]";
if (!extras.includes(anchor)) throw new Error("ancre extras introuvable");
extras = extras.replace(anchor, entry + anchor);
writeFileSync(extrasPath, extras);
console.log("✔ template-extras.tsx mis à jour");

// 4. SVG
const svgPath = resolve(root, "public/cms/templates", `${cfg.id}.svg`);
if (!existsSync(svgPath)) {
  const svg =
    cfg.svg ??
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="${cfg.background}"/><text x="300" y="300" text-anchor="middle" fill="${cfg.primary}" font-family="sans-serif" font-size="24">${cfg.name}</text></svg>`;
  writeFileSync(svgPath, svg);
  console.log("✔ SVG créé");
}

// 5. CSS (append)
const cssPath = resolve(root, "src/components/cms-site/templates.css");
let css = readFileSync(cssPath, "utf8");
const cssBlock =
  cfg.css ??
  `\n.donut-site[data-template="${cfg.id}"] .donut-hero { background: ${cfg.background}; }\n.donut-site[data-template="${cfg.id}"] .donut-button { background: ${cfg.primary}; }\n`;
css = css + cssBlock;
writeFileSync(cssPath, css);
console.log("✔ templates.css mis à jour");

console.log(`\nModèle "${cfg.id}" créé. Lancez : npm test && npx tsc --noEmit`);
console.log("Pensez à mettre à jour docs/platform/SITE_TEMPLATES.md.");
