import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig } from "../src/features/cms/defaults";
import { contrastChecks, defaultCmsSettings, enforceLocks } from "../src/features/cms/rules";
import { siteConfigSchema } from "../src/features/cms/schema";
import { emptySiteAddons } from "../src/features/cms/site-addons";
import { buildSite, fluxSectionId } from "../src/features/assistant/flux/build";
import { fluxColors } from "../src/features/assistant/flux/palette";
import { normalizePlan } from "../src/features/assistant/flux/plan";
import { nameIn, reflexPlan } from "../src/features/assistant/flux/reflex";
import { reflexSuggestions, siteCatalog, toSuggestions } from "../src/features/assistant/flux/service";

const ctx = { addons: emptySiteAddons, allowedTypes: defaultCmsSettings().allowedTypes };

test("une seule demande donne un site e-commerce complet et enregistrable", () => {
  const base = defaultConfig();
  const plan = reflexPlan("Crée le site de ma pizzeria qui s’appelle Da Marco, en vert, avec commande en ligne", { name: "" });
  assert.equal(plan.name, "Da Marco");
  assert.equal(plan.goal, "order");
  assert.equal(plan.colors.primary, "#2f7d4a");
  const site = buildSite(base, plan, ctx);
  siteConfigSchema.parse(site);
  // Mêmes contrôles qu’à l’enregistrement, y compris pour un simple administrateur.
  enforceLocks(base, site, "OWNER", defaultCmsSettings());
  assert.equal(site.branding.publicName, "Da Marco");
  const hero = site.pages.home.sections.find((s) => s.type === "hero");
  assert.ok(hero && hero.type === "hero");
  assert.equal(hero.props.primary.href, "/commander");
  assert.ok(site.pages.home.sections.some((s) => s.id === fluxSectionId("faq")));
  assert.ok(site.pages.home.sections.some((s) => s.id === fluxSectionId("cta")));
  // Pages légales, protégées et commerce intactes.
  for (const key of ["mentions-legales", "checkout", "commander", "carte", "compte"])
    assert.deepEqual(site.pages[key], base.pages[key]);
  assert.deepEqual(site.legal, base.legal);
});

test("relancer FLUX met à jour ses sections sans les dupliquer", () => {
  const first = buildSite(defaultConfig(), reflexPlan("site pour mon café, ambiance douce", { name: "Le Nid" }), ctx);
  const second = buildSite(first, reflexPlan("plutôt une boutique en ligne en bleu", { name: "Le Nid" }), ctx);
  const ids = second.pages.home.sections.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => id.startsWith("flux-")).length, 2);
  enforceLocks(first, second, "OWNER", defaultCmsSettings());
});

test("une nouvelle demande retire les modules FLUX qui ne servent plus", () => {
  const addons = { ...emptySiteAddons, installed: ["booking"] };
  const allowedTypes = [...ctx.allowedTypes, "reservation" as const];
  const table = buildSite(defaultConfig(), reflexPlan("restaurant gastronomique avec réservation", { name: "" }), { addons, allowedTypes });
  assert.ok(table.pages.home.sections.some((s) => s.id === fluxSectionId("reservation")));
  const shop = buildSite(table, reflexPlan("boutique en ligne de bijoux", { name: "" }), { addons, allowedTypes });
  assert.ok(!shop.pages.home.sections.some((s) => s.id === fluxSectionId("reservation")));
  assert.ok(shop.pages.home.sections.some((s) => s.id === fluxSectionId("cta")));
  enforceLocks(table, shop, "OWNER", { ...defaultCmsSettings(), allowedTypes });
});

test("la palette respecte toujours les contrastes exigés par le CMS", () => {
  const samples = [
    { primary: "#ffff00", background: "#ffffff", accent: "#ff00ff" },
    { primary: "#111111", background: "#161312", accent: "#333333" },
    { primary: "#88ccff", background: "#f8f1e5", accent: "#00ff00" },
    { primary: "#b91c1c", background: "#000000", accent: "#ffffff" },
  ];
  for (const colors of samples) {
    const theme = { ...defaultConfig().theme, colors: fluxColors(colors) };
    for (const check of contrastChecks(theme)) assert.ok(check.ratio >= check.min, `${JSON.stringify(colors)} ${check.id} ${check.ratio}`);
  }
});

test("un plan venu du modèle est borné et ne peut rien injecter", () => {
  const fallback = reflexPlan("restaurant", { name: "" });
  const plan = normalizePlan(
    {
      layout: "signature",
      goal: "steal",
      colors: { primary: "red", background: "#FFFFFF", accent: "#12345" },
      fonts: { heading: "comic", body: "inter" },
      hero: { title: "x".repeat(500), badges: ["a", "b", "c", "d", "e", "f"] },
      addonSections: ["reservation", "system", "reservation"],
      extras: { loader: "../../etc", notFound: "not-found-neon" },
      faq: [{ question: "Q ?", answer: "" }, { question: "Vraie ?", answer: "Oui." }],
    },
    fallback,
  );
  assert.equal(plan.layout, fallback.layout);
  assert.equal(plan.goal, fallback.goal);
  assert.equal(plan.colors.primary, fallback.colors.primary);
  assert.equal(plan.colors.background, "#ffffff");
  assert.equal(plan.fonts.heading, fallback.fonts.heading);
  assert.equal(plan.hero.title.length, 160);
  assert.equal(plan.hero.badges.length, 4);
  assert.deepEqual(plan.addonSections, ["reservation"]);
  assert.equal(plan.extras.loader, null);
  assert.equal(plan.extras.notFound, "not-found-neon");
  assert.equal(plan.faq.length, 1);
});

test("les add-ons non acquis ne sont jamais posés, seulement proposés", () => {
  const plan = { ...reflexPlan("restaurant gastronomique, réservation", { name: "" }), extras: { loader: "neon-pulse", notFound: null, background: null, decoration: null } };
  assert.ok(plan.addonSections.includes("reservation"));
  const site = buildSite(defaultConfig(), plan, ctx);
  assert.equal(site.branding.loader, undefined);
  assert.ok(!site.pages.home.sections.some((s) => s.type === "reservation"));

  const installed = { ...emptySiteAddons, installed: ["booking"], loadingScreens: [{ id: "neon-pulse", renderer: "neon", name: "Neon Pulse" }] };
  const owned = buildSite(defaultConfig(), plan, { addons: installed, allowedTypes: [...ctx.allowedTypes, "reservation"] });
  assert.deepEqual(owned.branding.loader, { product: "neon-pulse" });
  assert.ok(owned.pages.home.sections.some((s) => s.type === "reservation"));

  const catalog = siteCatalog(
    [
      { id: "shipping-rules", name: "Livraison", kind: "business", pricing_mode: "one_time", price_cents: 900 },
      { id: "neon-pulse", name: "Neon Pulse", kind: "loading_screen", pricing_mode: "one_time", price_cents: 500 },
      { id: "prospect-scanner", name: "Scanner", kind: "business", pricing_mode: "subscription", price_cents: 6900 },
    ],
    installed,
  );
  assert.deepEqual(catalog.map((c) => c.id), ["shipping-rules", "neon-pulse"]);
  const shop = reflexPlan("boutique en ligne avec livraison", { name: "" });
  const suggestions = toSuggestions(reflexSuggestions("boutique en ligne avec livraison", shop, catalog), catalog);
  assert.deepEqual(suggestions.map((s) => s.id), ["shipping-rules"]);
  assert.equal(suggestions[0].priceCents, 900);
});

test("le nom est compris à l’écrit comme à l’oral", () => {
  assert.equal(nameIn("mon resto s'appelle Chez Lulu et fait des burgers"), "Chez Lulu");
  assert.equal(nameIn("une boulangerie nommée « Le Fournil »"), "Le Fournil");
  assert.equal(nameIn("site pour Chez Paulette en bleu"), "Chez Paulette");
  assert.equal(nameIn("un site rouge pour mon restaurant"), "");
});
