import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "src");
const allowlistPath = path.resolve(process.cwd(), "tests/fixtures/module-boundaries.allowlist.txt");

// Surfaces publiques autorisées par module. Un module qui possède un public.ts
// n'est accessible de l'extérieur que via ces sous-chemins. Un module sans
// public.ts reste pleinement accessible (grandfathered) en attendant sa façade.
const publicSurfaces: Record<string, Set<string>> = {
  orders: new Set(["public", "navigation", "events"]),
  finance: new Set(["public", "navigation", "events"]),
  loyalty: new Set(["public", "navigation"]),
  catalog: new Set(["public", "navigation"]),
  commerce: new Set(["public"]),
  bank: new Set(["public", "navigation"]),
  billing: new Set(["public", "navigation"]),
  messaging: new Set(["public"]),
  floor: new Set(["public", "navigation"]),
  events: new Set(["public"]),
  assistant: new Set(["public"]),
  credits: new Set(["public"]),
  estimation: new Set(["public", "navigation"]),
  hr: new Set(["public", "navigation"]),
  invoices: new Set(["public", "navigation"]),
  offline: new Set(["public"]),
  payments: new Set(["public", "navigation"]),
  qr: new Set(["public", "navigation"]),
  reservations: new Set(["public", "navigation"]),
  site: new Set(["public"]),
  support: new Set(["public"]),
  admin: new Set(["public"]),
  appearance: new Set(["public"]),
  guide: new Set(["public"]),
  integrations: new Set(["public"]),
  inventory: new Set(["public", "navigation"]),
  legal: new Set(["public"]),
  modules: new Set(["public"]),
  onboarding: new Set(["public"]),
  procurement: new Set(["public", "navigation"]),
  reputation: new Set(["public"]),
  trade: new Set(["public", "navigation"]),
  pilotage: new Set(["public", "navigation"]),
  "pilotage-addons": new Set(["public"]),
  addons: new Set(["public", "navigation"]),
  analytics: new Set(["public", "navigation"]),
  cms: new Set(["public", "navigation"]),
  "ops-security": new Set(["public", "navigation"]),
  platform: new Set(["public", "navigation"]),
  seo: new Set(["public"]),
};

function walk(dir: string, cb: (file: string) => void) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, cb);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) cb(full);
  }
}

function moduleOf(filePath: string): string | null {
  const rel = path.relative(root, filePath).replace(/\\/g, "/");
  const m = rel.match(/^features\/([^/]+)\//);
  return m ? m[1] : null;
}

const importRe = /import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;

const violations: string[] = [];
walk(root, (file) => {
  const selfModule = moduleOf(file);
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(importRe)) {
    const isTypeOnly = !!m[1];
    if (isTypeOnly) continue; // pas de couplage d'exécution
    const spec = m[2];
    const fm = spec.match(/^@\/features\/([^/]+)(?:\/(.+))?$/);
    if (!fm) continue;
    const targetModule = fm[1];
    const subpath = fm[2]; // undefined si import du barrel (inexistant aujourd'hui)
    if (selfModule === targetModule) continue; // interne au module : ok
    // Module sans façade : grandfathered, pas de règle.
    if (!publicSurfaces[targetModule]) continue;
    const surface = subpath ? subpath.split("/")[0] : "";
    if (publicSurfaces[targetModule].has(surface)) continue;
    violations.push(`${path.relative(process.cwd(), file)} -> ${spec}`);
  }
});

const current = [...new Set(violations)].sort();
const allowlist = existsSync(allowlistPath)
  ? readFileSync(allowlistPath, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  : [];
const allowset = new Set(allowlist);

const newOnes = current.filter((v) => !allowset.has(v));
const stale = allowlist.filter((v) => !current.includes(v));

if (newOnes.length) {
  console.error("Nouvelles violations de frontière de module (non autorisées) :");
  for (const v of newOnes) console.error(" - " + v);
}
if (stale.length) {
  console.warn("Entrées obsolètes de l'allowlist (à nettoyer) :");
  for (const v of stale) console.warn(" - " + v);
}

// Écrit l'état courant si demandé, pour initialiser l'allowlist.
if (process.argv.includes("--write-allowlist")) {
  writeFileSync(allowlistPath, current.join("\n") + (current.length ? "\n" : ""));
  console.log(`Allowlist écrite : ${current.length} entrées.`);
  process.exit(0);
}

if (newOnes.length) process.exit(1);
console.log(`Module boundary check passed (${current.length} violations grandfathered).`);
