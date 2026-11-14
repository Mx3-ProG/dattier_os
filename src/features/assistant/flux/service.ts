/* Orchestration de FLUX : une demande → un site prêt à enregistrer.
   1. Lecture : solde, catalogue d’add-ons, brouillon du site (droits « website »).
   2. Plan : moteur réflexe, puis IA générative si elle est activée et payable.
   3. Aperçu : le site est construit et vérifié (verrous, contraste) avant d’être
      montré ; rien n’est enregistré tant que l’utilisateur n’a pas confirmé.
   4. Application : le plan est réappliqué côté serveur sur le brouillon actuel,
      puis enregistré (et publié si demandé) par le CMS, avec ses contrôles. */
import { z } from "zod";
import { authenticated, rateLimit } from "@/features/platform/http";
import { rows, type DB } from "@/lib/database/db";
import { website } from "@/features/cms/service";
import { enforceLocks, type CmsSettings } from "@/features/cms/rules";
import type { SiteAddonData } from "@/features/cms/site-addons";
import { llmCredits, minimumLlmCredits, reflexCredits } from "../pricing";
import { llmEnabled } from "../llm";
import { buildSite } from "./build";
import { askFluxLlm, type FluxCatalogEntry } from "./llm";
import { describePlan, normalizePlan, type FluxPlan, type FluxSuggestion } from "./plan";
import { reflexPlan } from "./reflex";

export const fluxBuildSchema = z.object({
  kind: z.literal("build"),
  message: z.string().trim().min(2).max(1500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(12)
    .default([]),
});
export const fluxApplySchema = z.object({
  kind: z.literal("apply"),
  plan: z.record(z.string(), z.unknown()),
  publish: z.boolean().default(false),
});

export type FluxReply = {
  reply: string;
  plan: FluxPlan;
  summary: string[];
  palette: { primary: string; background: string; accent: string; text: string; button: string };
  suggestions: FluxSuggestion[];
  engine: "reflex" | "llm";
  credits: number;
  balance: number;
};

const siteKinds = new Set(["loading_screen", "not_found", "site_background", "site_decoration"]);
const sectionAddonIds = new Set(["estimation-studio", "menu-allergens", "shipping-rules", "product-bundles", "appointment-booking"]);

async function wallet(db: DB, restaurant: string) {
  const { rows: r } = await db.query<{ balance: number }>("SELECT balance FROM app.ai_wallet($1)", [restaurant]);
  if (!r[0]) throw new Error("Accès non autorisé.");
  return r[0].balance;
}
async function consume(db: DB, restaurant: string, amount: number, engine: string, detail: string, costEur = 0, partial = false) {
  const { rows: r } = await db.query<{ balance: number }>("SELECT app.ai_consume($1,$2,$3,$4,$5,$6) AS balance", [
    restaurant,
    amount,
    engine,
    `FLUX · ${detail}`.slice(0, 300),
    Math.round(costEur * 1_000_000),
    partial,
  ]);
  return r[0].balance;
}

/** Produits de la boutique utiles à un site : vitrine (chargement, 404, fonds, décors) et modules métier. */
type ProductRow = { id: string; name: string; kind: string; pricing_mode: FluxCatalogEntry["pricing"]; price_cents: number };
/** À lire avant le changement de rôle du CMS (même accès que la boutique d’add-ons). */
const readProducts = (db: DB) =>
  rows<ProductRow>(db, "SELECT id,name,kind,pricing_mode,price_cents FROM addon_products WHERE listed AND sellable ORDER BY position,name");
export function siteCatalog(products: ProductRow[], addons: SiteAddonData): FluxCatalogEntry[] {
  const installed = new Set([
    ...addons.installed,
    ...addons.loadingScreens.map((p) => p.id),
    ...addons.notFoundPages.map((p) => p.id),
    ...addons.backgrounds.map((p) => p.id),
    ...addons.decorations.map((p) => p.id),
  ]);
  return products
    .filter((p) => siteKinds.has(p.kind) || sectionAddonIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, kind: p.kind, pricing: p.pricing_mode, priceCents: p.price_cents, installed: installed.has(p.id) }));
}

/** Suggestions du moteur réflexe : ce qui sert la demande, jamais ce qui est déjà installé. */
export function reflexSuggestions(message: string, plan: FluxPlan, catalog: FluxCatalogEntry[]) {
  const n = message.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const wanted: { id: string; reason: string }[] = [];
  const want = (id: string, reason: string) => wanted.push({ id, reason });
  if (plan.goal === "order" || /livr/.test(n)) want("shipping-rules", "Affichez vos zones et frais de livraison, avec un vérificateur de code postal pour vos clients.");
  if (/allergen|restau|pizz|burger|cafe|boulang|sushi/.test(n)) want("menu-allergens", "Un tableau des 14 allergènes toujours à jour, très attendu par les clients.");
  if (/lot|formule|box|coffret|menu/.test(n)) want("product-bundles", "Vendez des formules et coffrets qui augmentent le panier moyen.");
  if (/rendez-vous|rdv|prestation|coiff|beaute/.test(n)) want("appointment-booking", "Laissez vos clients réserver un créneau en ligne, sans appel.");
  if (/devis|estimation|traiteur/.test(n)) want("estimation-studio", "Un simulateur de prix qui transforme les visiteurs en demandes de devis.");
  const loader = catalog.find((c) => c.kind === "loading_screen" && !c.installed);
  if (loader) want(loader.id, "Un écran de chargement animé à vos couleurs, pour une première impression soignée.");
  return wanted;
}

export function toSuggestions(list: { id: string; reason: string }[], catalog: FluxCatalogEntry[]): FluxSuggestion[] {
  const seen = new Set<string>();
  return list
    .map((s) => ({ s, c: catalog.find((c) => c.id === s.id) }))
    .filter(({ s, c }) => c && !c.installed && !seen.has(s.id) && seen.add(s.id))
    .slice(0, 3)
    .map(({ s, c }) => ({ id: c!.id, name: c!.name, reason: s.reason, priceCents: c!.priceCents, pricing: c!.pricing, owned: false }));
}

type Prepared = {
  config: Awaited<ReturnType<ReturnType<typeof website>["editorState"]>>["config"];
  role: "OWNER" | "SUPER_ADMIN";
  settings: CmsSettings;
  addons: SiteAddonData;
  name: string;
  revision: number;
};

/** Lecture du brouillon et des droits, dans la transaction courante. */
async function readSite(db: DB, restaurant: string, user: Parameters<Parameters<typeof authenticated>[1]>[1]): Promise<Prepared> {
  await db.exec("SET LOCAL ROLE atacuisine_app");
  const cms = website(restaurant);
  const scope = await cms.siteScope(db, user);
  const state = await cms.editorState(db, scope);
  return {
    config: state.config,
    role: state.role,
    settings: state.settings,
    addons: state.siteAddons,
    name: state.context.name ?? "",
    revision: state.revision,
  };
}

function preview(prepared: Prepared, plan: FluxPlan) {
  const config = buildSite(prepared.config, plan, { addons: prepared.addons, allowedTypes: prepared.settings.allowedTypes });
  // Mêmes contrôles qu’à l’enregistrement : un aperçu montré est un aperçu enregistrable.
  enforceLocks(prepared.config, config, prepared.role, prepared.settings);
  const c = config.theme.colors;
  const addons = config.pages.home?.sections.filter((x) => x.id.startsWith("flux-") && !["faq", "cta"].includes(x.type)).length ?? 0;
  return { palette: { primary: c.primary, background: c.background, accent: c.accent, text: c.text, button: c.buttonText }, addons };
}

export async function fluxState(restaurant: string) {
  return authenticated(restaurant, async (db, user) => {
    const balance = await wallet(db, restaurant);
    await readSite(db, restaurant, user);
    return { balance, llm: llmEnabled() };
  });
}

export async function fluxBuild(restaurant: string, input: z.infer<typeof fluxBuildSchema>): Promise<FluxReply> {
  const first = await authenticated(restaurant, async (db, user) => {
    await rateLimit(db, `flux:${user.id}`, 12);
    const balance = await wallet(db, restaurant);
    const llm = llmEnabled() && balance >= minimumLlmCredits;
    if (!llm && balance < reflexCredits) throw new Error("Crédits insuffisants pour lancer FLUX.");
    const products = await readProducts(db);
    const site = await readSite(db, restaurant, user);
    const catalog = siteCatalog(products, site.addons);
    const plan = reflexPlan(input.message, { name: site.name });
    if (llm) return { site, catalog, plan, balance, llm };
    const shown = preview(site, plan);
    return { site, catalog, plan, shown, balance, llm };
  });
  if (!first.llm) {
    const balance = await authenticated(restaurant, (db) => consume(db, restaurant, reflexCredits, "reflex", input.message));
    return {
      reply: `Votre site est prêt${first.plan.name ? ` pour ${first.plan.name}` : ""} : base e-commerce, couleurs, textes et questions fréquentes adaptés à votre activité. Confirmez pour l’enregistrer dans le brouillon, puis publiez quand vous voulez.`,
      plan: first.plan,
      summary: describePlan(first.plan, first.shown!.addons),
      palette: first.shown!.palette,
      suggestions: toSuggestions(reflexSuggestions(input.message, first.plan, first.catalog), first.catalog),
      engine: "reflex",
      credits: reflexCredits,
      balance,
    };
  }
  const current = `nom ${first.site.name || "inconnu"}, couleur ${first.site.config.theme.colors.primary}, modèle ${first.site.config.theme.presentation?.layout ?? "classique"}`;
  const outcome = await askFluxLlm(input.message, input.history, first.plan, { name: first.site.name, current }, first.catalog).catch((error) => {
    console.error(JSON.stringify({ level: "flux-llm-failed", error: String(error) }));
    return null;
  });
  let plan = outcome?.plan ?? first.plan;
  let shown: ReturnType<typeof preview>;
  try {
    shown = preview(first.site, plan);
  } catch {
    // Plan de l’IA refusé par les contrôles du CMS : le plan réflexe reste valable.
    plan = first.plan;
    shown = preview(first.site, plan);
  }
  const credits = outcome ? llmCredits(outcome.costEur) : reflexCredits;
  const balance = await authenticated(restaurant, (db) =>
    outcome
      ? consume(db, restaurant, credits, outcome.model, input.message, outcome.costEur, true)
      : consume(db, restaurant, credits, "reflex", input.message),
  );
  return {
    reply:
      outcome?.reply ||
      "Votre site est prêt, avec des textes et des couleurs adaptés à votre activité. Confirmez pour l’enregistrer dans le brouillon.",
    plan,
    summary: describePlan(plan, shown.addons),
    palette: shown.palette,
    suggestions: toSuggestions(outcome?.suggestions.length ? outcome.suggestions : reflexSuggestions(input.message, plan, first.catalog), first.catalog),
    engine: outcome ? "llm" : "reflex",
    credits: Math.min(credits, first.balance),
    balance,
  };
}

/** Réapplique le plan sur le brouillon actuel puis l’enregistre (et le publie si demandé). */
export async function fluxApply(restaurant: string, input: z.infer<typeof fluxApplySchema>) {
  return authenticated(restaurant, async (db, user) => {
    const site = await readSite(db, restaurant, user);
    const plan = normalizePlan(input.plan, reflexPlan("", { name: site.name }));
    const config = buildSite(site.config, plan, { addons: site.addons, allowedTypes: site.settings.allowedTypes });
    const cms = website(restaurant);
    const scope = await cms.siteScope(db, user);
    const { revision } = (await cms.siteAction(db, scope, { op: "save", revision: site.revision, config })) as { revision: number };
    if (!input.publish) return { revision, published: null as number | null };
    const { number } = (await cms.siteAction(db, scope, { op: "publish", revision, summary: "Site construit avec FLUX" })) as { number: number };
    return { revision, published: number };
  });
}
