import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { sitePerform } from "../src/features/site/service";
import { defaultConfig } from "../src/features/cms/defaults";
import { siteConfigSchema, type SiteConfig } from "../src/features/cms/schema";
import { siteUrls, pageUrl, absoluteMedia } from "../src/features/seo/urls";
import {
  tenantRobots,
  platformRobots,
  AI_SEARCH_BOTS,
  AI_TRAINING_BOTS,
} from "../src/features/seo/robots";
import {
  indexablePages,
  sitemapEntries,
  renderSitemap,
} from "../src/features/seo/sitemap";
import { buildJsonLd, serializeJsonLd } from "../src/features/seo/jsonld";
import { seoFacts } from "../src/features/seo/server";
import type { Product, Settings } from "../src/features/commerce/schema";
import type { DB } from "../src/lib/database/db";

/* ───────────── Fictitious tenants: different domains, sectors, languages ───────────── */

const PLATFORM = "https://app.atacuisine.test";
type Tenant = {
  id: string;
  name: string;
  host: string | null;
  phone: string;
  address: string;
  products: Product[];
  config: SiteConfig;
  settings: Settings;
};
function tenant(
  id: string,
  name: string,
  host: string | null,
  extra: { phone: string; address: string; dish: string; faq?: boolean },
): Tenant {
  const config = defaultConfig();
  config.seo.noIndex = false;
  config.seo.title = `${name} — site officiel`;
  config.branding.publicName = name;
  config.branding.description = `Description propre à ${name}`;
  if (extra.faq) {
    config.pages.home.sections.push({
      id: `${id}-faq`,
      type: "faq",
      lock: 3,
      visible: true,
      required: false,
      props: {
        kicker: "",
        title: "Questions",
        items: [
          { question: `Où se trouve ${name} ?`, answer: extra.address },
          { question: "Vide", answer: "" },
        ],
      },
    });
  }
  return {
    id,
    name,
    host,
    phone: extra.phone,
    address: extra.address,
    config,
    settings: {
      open: true,
      prepMinutes: 20,
      interval: 15,
      capacity: 10,
      hours: [{ day: 1, open: "12:00", close: "14:30" }],
      categories: ["Plats"],
      address: extra.address,
      phone: extra.phone,
      logo: "",
      googleBusinessUrl: `https://maps.google.com/?cid=${id}`,
      googleReviewUrl: "",
    },
    products: [
      {
        id: `${id}-p1`,
        name: extra.dish,
        category: "Plats",
        description: `Spécialité de ${name}`,
        price: 1450,
        images: [],
        allergens: "",
        options: [],
        enabled: true,
        portions: 3,
      },
      {
        id: `${id}-p2`,
        name: `${extra.dish} épuisé`,
        category: "Plats",
        description: "",
        price: 900,
        images: [],
        allergens: "",
        options: [],
        enabled: true,
        portions: 0,
      },
    ],
  };
}
const tenants = [
  tenant("tajine", "Tajine Royal", null, {
    phone: "01 11 11 11 11",
    address: "1 rue A, Paris",
    dish: "Tajine d’agneau",
    faq: true,
  }),
  tenant("sushi", "Sushi Kaze", "www.sushi-kaze.test", {
    phone: "02 22 22 22 22",
    address: "2 rue B, Lyon",
    dish: "Maki saumon",
  }),
  tenant("pizza", "Pizzeria Napoli", "napoli.test", {
    phone: "03 33 33 33 33",
    address: "3 rue C, Nice",
    dish: "Margherita",
  }),
];
const urlsFor = (t: Tenant, requestHost: string) =>
  siteUrls({
    restaurant: t.id,
    platformUrl: PLATFORM,
    primaryHost: t.host,
    requestHost,
  });
const ld = (t: Tenant, pageKey: string, requestHost = t.host ?? "app.atacuisine.test") =>
  buildJsonLd({
    pageKey,
    config: t.config,
    context: { name: t.name, phone: t.phone, address: t.address },
    canonicalBase: urlsFor(t, requestHost).canonicalBase,
    settings: t.settings,
    products: t.products,
  });

/* ───────────────────────── Canonical URLs ───────────────────────── */

test("SEO canonical : plateforme, domaine principal et miroir", () => {
  const [tajine, sushi] = tenants;
  assert.deepEqual(urlsFor(tajine, "app.atacuisine.test"), {
    canonicalBase: `${PLATFORM}/r/tajine`,
    servedBase: `${PLATFORM}/r/tajine`,
    mirror: false,
  });
  const onDomain = urlsFor(sushi, "www.sushi-kaze.test");
  assert.equal(onDomain.canonicalBase, "https://www.sushi-kaze.test");
  assert.equal(onDomain.mirror, false);
  // Same site reached through the platform: canonical stays on the domain.
  const mirror = urlsFor(sushi, "app.atacuisine.test");
  assert.equal(mirror.canonicalBase, "https://www.sushi-kaze.test");
  assert.equal(mirror.servedBase, `${PLATFORM}/r/sushi`);
  assert.equal(mirror.mirror, true);
  // A spoofed or secondary Host never changes the canonical.
  assert.equal(
    urlsFor(sushi, "evil.test").canonicalBase,
    "https://www.sushi-kaze.test",
  );
  assert.equal(urlsFor(sushi, "WWW.SUSHI-KAZE.TEST:443").mirror, false);
  assert.equal(pageUrl("https://a.test", "home"), "https://a.test/");
  assert.equal(pageUrl("https://a.test", "carte"), "https://a.test/carte");
  assert.equal(
    absoluteMedia("https://a.test", "/cms/logo.svg"),
    "https://a.test/cms/logo.svg",
  );
  assert.equal(absoluteMedia("https://a.test", "javascript:x"), "");
  // Demo mode never points to a custom domain.
  assert.equal(
    siteUrls({
      restaurant: "sushi",
      platformUrl: PLATFORM,
      primaryHost: "www.sushi-kaze.test",
      requestHost: "www.sushi-kaze.test",
      demo: true,
    }).canonicalBase,
    `${PLATFORM}/r/sushi`,
  );
});

/* ───────────────────────── Sitemaps ───────────────────────── */

test("SEO sitemap : pages indexables seulement, URL canoniques, lastmod", () => {
  const [tajine, sushi] = tenants;
  const keys = indexablePages(tajine.config);
  assert.ok(keys.includes("home") && keys.includes("carte"));
  for (const excluded of ["checkout", "compte", "suivi", "qr"])
    assert.ok(!keys.includes(excluded), `${excluded} exclue`);
  const hidden = structuredClone(tajine.config);
  hidden.pages.galerie.visible = false;
  hidden.pages.avis.seo.noIndex = true;
  assert.ok(!indexablePages(hidden).includes("galerie"));
  assert.ok(!indexablePages(hidden).includes("avis"));
  // Indexing is opt-in: the default configuration publishes nothing.
  assert.deepEqual(indexablePages(defaultConfig()), []);

  const entries = sitemapEntries({
    config: sushi.config,
    canonicalBase: urlsFor(sushi, "www.sushi-kaze.test").canonicalBase,
    publishedAt: "2026-11-01T10:00:00Z",
  });
  assert.ok(entries.every((e) => e.loc.startsWith("https://www.sushi-kaze.test/")));
  assert.ok(entries.every((e) => e.lastmod === "2026-11-01T10:00:00.000Z"));
  const xml = renderSitemap([
    { loc: "https://a.test/?a=1&b=<2>" },
  ]);
  assert.match(xml, /<loc>https:\/\/a\.test\/\?a=1&amp;b=&lt;2&gt;<\/loc>/);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
});

/* ───────────────────────── robots.txt ───────────────────────── */

test("SEO robots : par domaine, sitemap déclaré, préférences robots IA", () => {
  const all = tenantRobots({
    pathPrefix: "",
    sitemapUrl: "https://napoli.test/sitemap.xml",
    blockAll: false,
  });
  assert.match(all, /User-agent: \*\nAllow: \/\n/);
  assert.match(all, /Disallow: \/checkout/);
  assert.match(all, /Disallow: \/compte/);
  assert.match(all, /Sitemap: https:\/\/napoli\.test\/sitemap\.xml/);
  assert.ok(!all.includes("GPTBot"), "aucune règle IA par défaut");

  const noTraining = tenantRobots({
    pathPrefix: "",
    sitemapUrl: null,
    blockAll: false,
    ai: { search: true, training: false },
  });
  for (const bot of AI_TRAINING_BOTS) assert.ok(noTraining.includes(`User-agent: ${bot}`));
  for (const bot of AI_SEARCH_BOTS) assert.ok(!noTraining.includes(`User-agent: ${bot}`));
  assert.ok(!noTraining.includes("Sitemap:"));

  const noAi = tenantRobots({
    pathPrefix: "",
    sitemapUrl: null,
    blockAll: false,
    ai: { search: false, training: false },
  });
  for (const bot of [...AI_SEARCH_BOTS, ...AI_TRAINING_BOTS])
    assert.ok(noAi.includes(`User-agent: ${bot}`));

  assert.equal(
    tenantRobots({ pathPrefix: "", sitemapUrl: "x", blockAll: true }),
    "User-agent: *\nDisallow: /\n",
  );
  const platform = platformRobots({
    blockAll: false,
    sitemapUrl: `${PLATFORM}/sitemap.xml`,
  });
  for (const p of ["/restaurant/", "/platform", "/dashboard", "/api/", "/r/*/checkout"])
    assert.ok(platform.includes(`Disallow: ${p}`), p);
  assert.ok(!/Disallow: \/r\/\n/.test(platform), "les vitrines /r/{id} restent explorables");
  assert.match(platform, /Sitemap: https:\/\/app\.atacuisine\.test\/sitemap\.xml/);
});

/* ───────────────────────── JSON-LD ───────────────────────── */

test("SEO JSON-LD : types par page, données réelles, aucune donnée inventée", () => {
  const [tajine, sushi] = tenants;
  const home = ld(tajine, "home")!;
  const graph = home["@graph"] as Record<string, unknown>[];
  const types = graph.map((n) => n["@type"]);
  assert.deepEqual(types, ["WebSite", "Restaurant", "FAQPage"]);
  const business = graph[1];
  assert.equal(business.name, "Tajine Royal");
  assert.equal(business.telephone, "01 11 11 11 11");
  assert.equal(business["@id"], `${PLATFORM}/r/tajine/#business`);
  assert.equal(business.hasMenu, `${PLATFORM}/r/tajine/carte`);
  assert.deepEqual(business.sameAs, ["https://maps.google.com/?cid=tajine"]);
  assert.deepEqual(business.openingHoursSpecification, [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "https://schema.org/Monday",
      opens: "12:00",
      closes: "14:30",
    },
  ]);
  // Empty FAQ answers are not published.
  const faq = graph[2].mainEntity as unknown[];
  assert.equal(faq.length, 1);

  // Custom domain: identifiers use the canonical domain.
  const sushiHome = ld(sushi, "home")!;
  assert.match(JSON.stringify(sushiHome), /https:\/\/www\.sushi-kaze\.test\/#business/);
  assert.ok(!(sushiHome["@graph"] as { "@type": string }[]).some((n) => n["@type"] === "FAQPage"));

  // Menu only on the menu page, with real prices and stock.
  const menu = ld(sushi, "carte")!;
  const menuTypes = (menu["@graph"] as { "@type": string }[]).map((n) => n["@type"]);
  assert.deepEqual(menuTypes, ["Menu", "BreadcrumbList"]);
  const text = JSON.stringify(menu);
  assert.match(text, /"price":"14.50","priceCurrency":"EUR","availability":"https:\/\/schema.org\/InStock"/);
  assert.match(text, /"price":"9.00","priceCurrency":"EUR","availability":"https:\/\/schema.org\/OutOfStock"/);

  // Other pages: breadcrumb only, no business repeated everywhere.
  const story = ld(sushi, "histoire")!;
  assert.deepEqual(
    (story["@graph"] as { "@type": string }[]).map((n) => n["@type"]),
    ["BreadcrumbList"],
  );
  // Never fabricated: no rating, review or award anywhere.
  for (const t of tenants)
    for (const key of Object.keys(t.config.pages)) {
      const s = JSON.stringify(ld(t, key));
      assert.ok(!/aggregateRating|"review"|award/i.test(s), `${t.id}/${key}`);
    }
  // Missing data stays missing.
  const bare = buildJsonLd({
    pageKey: "home",
    config: defaultConfig(),
    context: { name: "Sans données" },
    canonicalBase: `${PLATFORM}/r/bare`,
    settings: null,
    products: [],
  })!;
  const bareBusiness = (bare["@graph"] as Record<string, unknown>[])[1];
  for (const k of ["telephone", "address", "openingHoursSpecification", "sameAs", "email"])
    assert.ok(!(k in bareBusiness), k);
});

test("SEO JSON-LD : sérialisation sûre dans <script>", () => {
  const s = serializeJsonLd({ name: "</script><script>alert(1)</script>&" });
  assert.ok(!s.includes("<") && !s.includes(">") && !s.includes("&"));
  assert.deepEqual(JSON.parse(s), {
    name: "</script><script>alert(1)</script>&",
  });
});

test("SEO isolation : aucune donnée d’un établissement chez un autre", () => {
  for (const t of tenants)
    for (const key of Object.keys(t.config.pages)) {
      const out = JSON.stringify(ld(t, key)) +
        JSON.stringify(
          sitemapEntries({
            config: t.config,
            canonicalBase: urlsFor(t, t.host ?? "app.atacuisine.test").canonicalBase,
            publishedAt: null,
          }),
        );
      for (const other of tenants.filter((o) => o.id !== t.id)) {
        for (const leak of [other.name, other.phone, other.address, other.products[0].name, `/r/${other.id}`])
          assert.ok(!out.includes(leak), `${t.id}/${key} contient ${leak}`);
        if (other.host) assert.ok(!out.includes(other.host), `${t.id}/${key} → ${other.host}`);
      }
    }
});

test("SEO schéma CMS : préférences robots IA facultatives et rétrocompatibles", () => {
  const legacy = defaultConfig();
  delete (legacy.seo as { aiCrawlers?: unknown }).aiCrawlers;
  assert.ok(siteConfigSchema.safeParse(legacy).success);
  legacy.seo.aiCrawlers = { search: true, training: false };
  assert.ok(siteConfigSchema.safeParse(legacy).success);
});

/* ───────────────────────── Database: primary domain ───────────────────────── */

let db: PGlite;
const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
});
after(() => db.close());
/** Public visitor context of one restaurant, under the application role (RLS enforced). */
const visitor = <T>(r: string, fn: (tx: DB) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE atacuisine_app");
    await tx.query(
      "SELECT set_config('app.user_id','',true),set_config('app.restaurant_id',$1,true),set_config('app.public','true',true)",
      [r],
    );
    return fn(tx);
  });

test("SEO domaine principal : vérifié uniquement, unique, isolé", async () => {
  await db.query(
    "INSERT INTO restaurant_domains(hostname,restaurant_id,verification_hash) VALUES('bernay-a.test','bernay','h'),('bernay-b.test','bernay','h'),('atelier.test','atelier','h')",
  );
  // Unverified domains are never canonical.
  assert.equal((await visitor("bernay", (tx) => seoFacts(tx, "bernay"))).primaryHost, null);
  await db.query(
    "UPDATE restaurant_domains SET verified_at=now()-interval '1 day' WHERE hostname='bernay-b.test'",
  );
  await db.query("UPDATE restaurant_domains SET verified_at=now() WHERE hostname='bernay-a.test'");
  // Fallback: oldest verified domain.
  assert.equal((await visitor("bernay", (tx) => seoFacts(tx, "bernay"))).primaryHost, "bernay-b.test");

  await db.transaction((tx) =>
    sitePerform(tx, "bernay", owner, { action: "primaryDomain", hostname: "bernay-a.test" }),
  );
  assert.equal((await visitor("bernay", (tx) => seoFacts(tx, "bernay"))).primaryHost, "bernay-a.test");
  await db.transaction((tx) =>
    sitePerform(tx, "bernay", owner, { action: "primaryDomain", hostname: "bernay-b.test" }),
  );
  const primaries = await db.query<{ hostname: string }>(
    "SELECT hostname FROM restaurant_domains WHERE restaurant_id='bernay' AND is_primary",
  );
  assert.deepEqual(primaries.rows.map((r) => r.hostname), ["bernay-b.test"]);
  await assert.rejects(
    db.query("UPDATE restaurant_domains SET is_primary=true WHERE hostname='bernay-a.test'"),
    /restaurant_domains_one_primary|unique/i,
  );

  // Unverified domain and another restaurant's domain are refused.
  await assert.rejects(
    db.transaction((tx) =>
      sitePerform(tx, "bernay", owner, { action: "primaryDomain", hostname: "atelier.test" }),
    ),
  );
  await assert.rejects(
    db.transaction((tx) =>
      sitePerform(tx, "atelier", owner, { action: "primaryDomain", hostname: "atelier.test" }),
    ),
  );
  // Atelier has no verified domain: its canonical stays on the platform.
  assert.equal((await visitor("atelier", (tx) => seoFacts(tx, "atelier"))).primaryHost, null);
  // A visitor context never reads the domain table of another restaurant (hashes stay private).
  const leaked = await visitor("atelier", (tx) =>
    tx.query("SELECT hostname,verification_hash FROM restaurant_domains WHERE restaurant_id='bernay'"),
  );
  assert.equal(leaked.rows.length, 0);
  // Suspended organisation: no canonical domain.
  await db.query("UPDATE organizations SET status='suspended' WHERE id='legacy'");
  assert.equal(
    (await db.query<{ h: string | null }>("SELECT app.primary_domain('bernay') AS h")).rows[0].h,
    null,
  );
  await db.query("UPDATE organizations SET status='active' WHERE id='legacy'");
  assert.equal(
    (await db.query<{ ok: boolean }>("SELECT app.health_ready() AS ok")).rows[0].ok,
    true,
  );
});

/* ───────────────────────── P1: locale, identity, redirects ───────────────────────── */

import { siteLocale, findRedirect, safeLanguage, SITE_HEADER } from "../src/features/seo/locale";
import { redirectSchema, businessSchema } from "../src/features/cms/schema";
import { platformSites } from "../src/features/seo/server";
import { renderSitemapIndex } from "../src/features/seo/sitemap";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

test("SEO langue : défaut historique fr/FR, langues et pays déclarés", () => {
  const c = defaultConfig();
  assert.deepEqual(siteLocale(c), { language: "fr", country: "FR", ogLocale: "fr_FR" });
  c.seo.locale = { language: "en-GB", country: "GB" };
  assert.equal(siteLocale(c).ogLocale, "en_GB");
  c.seo.locale = { language: "de", country: "CH" };
  assert.deepEqual(siteLocale(c), { language: "de", country: "CH", ogLocale: "de_CH" });
  c.seo.locale = { language: "es", country: "" };
  assert.equal(siteLocale(c).ogLocale, undefined);
  assert.ok(siteConfigSchema.safeParse(c).success);
  c.seo.locale = { language: "english", country: "" };
  assert.ok(!siteConfigSchema.safeParse(c).success);
  assert.equal(safeLanguage("en-US"), "en-US");
  assert.equal(safeLanguage('fr" onload="x'), "fr");
  assert.equal(safeLanguage(null), "fr");
});

test("SEO redirections : validation, sens permanent/temporaire, pas de boucle", () => {
  const ok = (r: unknown) => redirectSchema.safeParse(r).success;
  assert.ok(ok({ from: "/ancienne-carte", to: "/carte", permanent: true }));
  assert.ok(ok({ from: "/promo", to: "https://exemple.test/x", permanent: false }));
  for (const bad of [
    { from: "/a", to: "//evil.test", permanent: true },
    { from: "/a", to: "javascript:alert(1)", permanent: true },
    { from: "/a", to: "http://insecure.test", permanent: true },
    { from: "/", to: "/carte", permanent: true },
    { from: "/a", to: "/a", permanent: true },
    { from: "a", to: "/b", permanent: true },
  ])
    assert.ok(!ok(bad), JSON.stringify(bad));
  const c = defaultConfig();
  c.seo.redirects = [
    { from: "/ancienne-carte", to: "/carte", permanent: true },
    { from: "/promo", to: "/commander", permanent: false },
  ];
  assert.ok(siteConfigSchema.safeParse(c).success);
  assert.equal(findRedirect(c, "ancienne-carte")?.to, "/carte");
  assert.equal(findRedirect(c, "ancienne-carte/")?.permanent, true);
  assert.equal(findRedirect(c, "promo")?.permanent, false);
  assert.equal(findRedirect(c, "inconnue"), null);
});

test("SEO identité : type d’activité, cuisines, profils, zone, coordonnées", () => {
  const [tajine] = tenants;
  const config = structuredClone(tajine.config);
  config.seo.locale = { language: "en", country: "GB" };
  config.business = {
    type: "CafeOrCoffeeShop",
    cuisines: ["Marocaine", "Thé"],
    priceRange: "€€",
    sameAs: [
      "https://www.instagram.com/tajine",
      "https://maps.google.com/?cid=tajine",
    ],
    areaServed: ["Paris"],
    geo: { latitude: 48.85, longitude: 2.35 },
  };
  assert.ok(businessSchema.safeParse(config.business).success);
  assert.ok(
    !businessSchema.safeParse({ ...config.business, sameAs: ["http://x.test"] }).success,
  );
  const build = (c: SiteConfig, pageKey = "home") =>
    buildJsonLd({
      pageKey,
      config: c,
      context: { name: tajine.name, phone: tajine.phone, address: tajine.address },
      canonicalBase: `${PLATFORM}/r/tajine`,
      settings: tajine.settings,
      products: tajine.products,
    })!;
  const graph = build(config)["@graph"] as Record<string, unknown>[];
  assert.equal(graph[0].inLanguage, "en");
  const b = graph[1];
  assert.equal(b["@type"], "CafeOrCoffeeShop");
  assert.deepEqual(b.servesCuisine, ["Marocaine", "Thé"]);
  assert.equal(b.priceRange, "€€");
  assert.deepEqual(b.areaServed, ["Paris"]);
  assert.deepEqual(b.geo, { "@type": "GeoCoordinates", latitude: 48.85, longitude: 2.35 });
  // Google Business link from shop settings is merged once, never duplicated.
  assert.deepEqual(b.sameAs, [
    "https://maps.google.com/?cid=tajine",
    "https://www.instagram.com/tajine",
  ]);
  const menu = build(config, "carte")["@graph"] as Record<string, unknown>[];
  assert.equal(menu[0].inLanguage, "en");

  // Online only: no premises, so no address, hours or position.
  config.business.type = "Organization";
  const org = (build(config)["@graph"] as Record<string, unknown>[])[1];
  for (const k of ["address", "openingHoursSpecification", "geo", "hasMenu", "servesCuisine", "acceptsReservations"])
    assert.ok(!(k in org), k);
  assert.equal(org.telephone, tajine.phone);
  // A shop is not a food establishment: no menu or cuisine properties.
  config.business.type = "Store";
  const store = (build(config)["@graph"] as Record<string, unknown>[])[1];
  assert.ok(!("hasMenu" in store) && !("servesCuisine" in store));
  assert.equal(store.address, tajine.address);
});

test("SEO sitemap plateforme : index valide", () => {
  const xml = renderSitemapIndex([
    { loc: `${PLATFORM}/sitemap-platform.xml` },
    { loc: `${PLATFORM}/r/a/sitemap.xml`, lastmod: "2026-11-01T00:00:00.000Z" },
  ]);
  assert.match(xml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.equal(xml.match(/<sitemap>/g)?.length, 2);
});

test("SEO sitemap plateforme : sites publiés, indexables, sans domaine propre", async () => {
  const publish = async (r: string, noIndex: boolean) => {
    const config = defaultConfig();
    config.seo.noIndex = noIndex;
    const id = crypto.randomUUID();
    await db.query(
      "INSERT INTO cms_versions(id,restaurant_id,number,schema_version,config) VALUES($1,$2,(SELECT coalesce(max(number),0)+1 FROM cms_versions WHERE restaurant_id=$2),1,$3)",
      [id, r, JSON.stringify(config)],
    );
    await db.query("UPDATE restaurant_cms SET published_version_id=$1 WHERE restaurant_id=$2", [id, r]);
  };
  const list = () =>
    visitor("atelier", async (tx) => (await platformSites(tx)).map((s) => s.restaurant_id));
  await publish("atelier", true);
  await publish("bernay", false);
  // Not indexable: absent. Bernay has its own verified domain: absent.
  assert.deepEqual(await list(), []);
  await publish("atelier", false);
  assert.deepEqual(await list(), ["atelier"]);
  await db.query("UPDATE restaurant_domains SET verified_at=now() WHERE hostname='atelier.test'");
  assert.deepEqual(await list(), []);
  await db.query("UPDATE restaurant_domains SET verified_at=NULL WHERE hostname='atelier.test'");
  await db.query("UPDATE organizations SET status='suspended' WHERE id='legacy'");
  assert.deepEqual(await list(), []);
  await db.query("UPDATE organizations SET status='active' WHERE id='legacy'");
  assert.deepEqual(await list(), ["atelier"]);
});

test("SEO proxy : en-tête de site posé par le proxy, jamais par le client", async () => {
  assert.ok(!process.env.DATABASE_URL, "test hors production");
  const site = async (path: string) => {
    const res = await proxy(
      new NextRequest(`http://127.0.0.1:3000${path}`, {
        headers: { [SITE_HEADER]: "usurpation" },
      }),
    );
    return res.headers.get(`x-middleware-request-${SITE_HEADER}`);
  };
  assert.equal(await site("/r/bernay/carte"), "bernay");
  assert.equal(await site("/r/bernay"), "bernay");
  assert.equal(await site("/"), null);
  assert.equal(await site("/restaurant/bernay"), null);
});

/* ───────────────────────── P2: performance & GEO ───────────────────────── */

import { buildLlmsTxt, llmsEnabled } from "../src/features/seo/llms";
import { existsSync, statSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { CookieConsent } from "../src/components/cms-site/cookie-consent";
import { TenantSiteProvider } from "../src/components/cms-site/context";
import type { FC, ReactNode } from "react";
const Provider = TenantSiteProvider as FC<{ restaurant: string; children?: ReactNode }>;

const llms = (t: Tenant, config = t.config) =>
  buildLlmsTxt({
    config,
    context: { name: t.name, phone: t.phone, address: t.address, opening_hours: "lun. 12:00–14:30" },
    canonicalBase: urlsFor(t, t.host ?? "app.atacuisine.test").canonicalBase,
    settings: t.settings,
    products: t.products,
    publishedAt: "2026-11-02T09:00:00Z",
  });

test("GEO llms.txt : facultatif, contenu publié seulement, sans fuite", () => {
  const [tajine, sushi] = tenants;
  // Opt-in, and only for an indexable site.
  assert.equal(llmsEnabled(tajine.config), false);
  const on = structuredClone(tajine.config);
  on.seo.llmsTxt = true;
  assert.equal(llmsEnabled(on), true);
  on.seo.noIndex = true;
  assert.equal(llmsEnabled(on), false);

  const txt = llms(sushi);
  assert.match(txt, /^# Sushi Kaze\n\n> Description propre à Sushi Kaze\n/);
  assert.match(txt, /- Adresse : 2 rue B, Lyon/);
  assert.match(txt, /- Horaires : lun\. 12:00–14:30/);
  assert.match(txt, /- \[[^\]]+\]\(https:\/\/www\.sushi-kaze\.test\/carte\)/);
  assert.match(txt, /- Maki saumon — 14,50\s€: Spécialité de Sushi Kaze/);
  assert.match(txt, /- Maki saumon épuisé — 9,00\s€ \(indisponible actuellement\)/);
  assert.match(txt, /Dernière mise à jour du site : 2026-11-02/);
  for (const hidden of ["/checkout", "/compte", "/suivi"])
    assert.ok(!txt.includes(hidden), hidden);
  for (const other of tenants.filter((o) => o.id !== "sushi"))
    for (const leak of [other.name, other.phone, other.address, other.products[0].name])
      assert.ok(!txt.includes(leak), leak);

  // English site: English labels and number format.
  const en = structuredClone(sushi.config);
  en.seo.locale = { language: "en", country: "GB" };
  const enTxt = llms(sushi, en);
  assert.match(enTxt, /- Address: 2 rue B, Lyon/);
  assert.match(enTxt, /€14\.50/);
  // Online only: no address or hours.
  const online = structuredClone(sushi.config);
  online.business = { type: "Organization", cuisines: [], priceRange: "", sameAs: [], areaServed: [], geo: null };
  const onlineTxt = llms(sushi, online);
  assert.ok(!onlineTxt.includes("Adresse") && !onlineTxt.includes("Horaires"));
  // Hidden menu page: no menu section.
  const noMenu = structuredClone(sushi.config);
  noMenu.pages.carte.visible = false;
  assert.ok(!llms(sushi, noMenu).includes("## Carte"));
  // Markdown injection from owner-entered text is neutralised.
  const evil = { ...sushi, name: "Evil](https://x.test)\n# Fake" };
  const evilTxt = llms(evil);
  assert.ok(!evilTxt.includes("](https://x.test)") && !evilTxt.includes("\n# Fake"));
});

test("GEO JSON-LD : date de mise à jour du site", () => {
  const [tajine] = tenants;
  const data = buildJsonLd({
    pageKey: "home",
    config: tajine.config,
    context: { name: tajine.name },
    canonicalBase: `${PLATFORM}/r/tajine`,
    settings: null,
    products: [],
    dateModified: "2026-11-02T09:00:00Z",
  })!;
  assert.equal((data["@graph"] as Record<string, unknown>[])[0].dateModified, "2026-11-02T09:00:00.000Z");
});

test("Performance : bandeau cookies dans le HTML serveur, masqué avant affichage si choix connu", () => {
  const html = renderToString(
    createElement(
      Provider,
      { restaurant: "sushi" },
      createElement(CookieConsent, { onChange: () => {} }),
    ),
  );
  assert.match(html, /<aside class="donut-cookie-banner"/);
  assert.match(html, /<script>try\{var v=JSON\.parse\(localStorage\.getItem\("atacuisine-cookie-consent:sushi"\)/);
  assert.match(html, /previousElementSibling\.hidden=true/);
  // A tenant id cannot break out of the inline script.
  const evil = renderToString(
    createElement(
      Provider,
      { restaurant: "x</script><script>alert(1)" },
      createElement(CookieConsent, { onChange: () => {} }),
    ),
  );
  assert.ok(!evil.includes("</script><script>alert(1)"));
});

test("Performance : polices WOFF2 servies en premier, plus légères que les TTF", async () => {
  const css = await readFile("src/app/fonts.css", "utf8");
  const faces = css.split("@font-face").slice(1);
  assert.ok(faces.length >= 7);
  for (const face of faces) {
    const urls = [...face.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
    assert.ok(urls[0].endsWith(".woff2"), urls[0]);
    assert.match(face, /font-display: swap/);
    for (const u of urls) assert.ok(existsSync("public" + u), u);
    assert.ok(statSync("public" + urls[0]).size < statSync("public" + urls[1]).size);
  }
});

/* ───────────────────────── P3: automation & dashboard ───────────────────────── */

import { auditSite, type AuditInput } from "../src/features/seo/audit";
import { effectiveTitle } from "../src/features/seo/meta";
import { adminState, adminPerform } from "../src/features/platform/admin";
import type { seoState, seoPerform } from "../src/features/seo/admin";
type Actor = Parameters<typeof adminState>[2];
/** The real admin module (scope + permission), typed for the "seo" module. */
const seoGet = (tx: DB, r: string, user: Actor) =>
  adminState(tx, r, user, "seo") as ReturnType<typeof seoState>;
const seoPost = (tx: DB, r: string, user: Actor, body: unknown) =>
  adminPerform(tx, r, user, "seo", body) as ReturnType<typeof seoPerform>;

const auditOf = (t: Tenant, patch: Partial<AuditInput> = {}) =>
  auditSite({
    restaurant: t.id,
    config: t.config,
    context: { name: t.name, phone: t.phone, address: t.address, description: t.config.branding.description },
    settings: t.settings,
    products: t.products,
    primaryHost: t.host,
    domains: [],
    publishedAt: "2026-11-02T09:00:00Z",
    platformUrl: PLATFORM,
    ...patch,
  });
const byId = (r: ReturnType<typeof auditSite>, id: string) => r.checks.find((c) => c.id === id);

test("CMS : la configuration par défaut ne partage aucun objet entre pages ni entre restaurants", () => {
  const a = defaultConfig(), b = defaultConfig();
  a.pages.carte.seo.title = "Carte de A";
  assert.equal(a.pages.contact.seo.title, "");
  assert.equal(b.pages.carte.seo.title, "");
  a.theme.colors.primary = "#000000";
  assert.notEqual(b.theme.colors.primary, "#000000");
});

test("SEO titres : une page sans titre propre n’hérite plus du titre de l’accueil", () => {
  const c = defaultConfig();
  c.seo.title = "Accueil du site";
  c.seo.shareName = "Chez Nous";
  assert.equal(effectiveTitle(c, "home", {}), "Accueil du site");
  assert.equal(effectiveTitle(c, "carte", {}), "La carte · Chez Nous");
  c.pages.carte.seo.title = "Notre carte";
  assert.equal(effectiveTitle(c, "carte", {}), "Notre carte");
});

test("SEO audit : contrôles factuels, sans score ni donnée inventée", () => {
  const [tajine, sushi] = tenants;
  const r = auditOf(sushi);
  assert.equal(r.version, 1);
  assert.ok(!("score" in r), "aucune note globale");
  assert.equal(r.canonicalBase, "https://www.sushi-kaze.test");
  assert.equal(
    r.counts.ok + r.counts.info + r.counts.warning + r.counts.error,
    r.checks.length,
  );
  assert.equal(byId(r, "titles-unique")?.status, "ok");
  assert.equal(byId(r, "domain")?.status, "ok");
  assert.equal(byId(r, "business-info")?.status, "ok");
  // Default logo is an SVG: social networks will not show it.
  assert.equal(byId(r, "share-image")?.status, "warning");
  assert.equal(byId(r, "indexing")?.status, "ok");
  assert.equal(byId(r, "perf-fonts")?.status, "ok");

  // Duplicate titles are blocking.
  const dup = structuredClone(sushi.config);
  dup.pages.carte.seo.title = "Même titre";
  dup.pages.contact.seo.title = "Même titre";
  const d = byId(auditOf(sushi, { config: dup }), "titles-unique")!;
  assert.equal(d.status, "error");
  assert.match(d.detail, /« Même titre » : Nous trouver, La carte$/);

  // Indexing off: says what is missing to turn it on, and titles are still checked.
  const off = structuredClone(sushi.config);
  off.seo.noIndex = true;
  off.pages.carte.seo.title = off.pages.contact.seo.title = "Pareil";
  assert.equal(byId(auditOf(sushi, { config: off }), "titles-unique")?.status, "error");
  const idx = byId(auditOf(sushi, { config: off }), "indexing")!;
  assert.equal(idx.status, "warning");
  assert.match(idx.fix!, /exploitant, e-mail de contact, hébergeur/);

  // Never published, pending domain, broken redirect, empty FAQ answer, missing practical info, heavy fonts.
  const messy = structuredClone(tajine.config);
  messy.seo.redirects = [{ from: "/old", to: "/nulle-part", permanent: true }];
  messy.theme.fonts = { heading: "playfair", body: "inter", button: "fraunces" };
  const m = auditOf(tajine, {
    config: messy,
    publishedAt: null,
    domains: [{ hostname: "tajine.test", verified: false }],
    context: { name: tajine.name },
    settings: { ...tajine.settings, hours: [] },
  });
  assert.equal(byId(m, "published")?.status, "error");
  assert.equal(byId(m, "domain-pending")?.detail, "tajine.test");
  assert.match(byId(m, "redirects-target")!.detail, /\/old → \/nulle-part/);
  assert.match(byId(m, "faq-empty")!.detail, /Vide/);
  assert.match(byId(m, "business-info")!.detail, /adresse, téléphone, horaires/);
  assert.equal(byId(m, "perf-fonts")?.status, "warning");
  // 32-character description: too short to present the business.
  assert.equal(byId(m, "geo-description")?.status, "warning");

  // Online-only business: no premises, so no practical-info check.
  const online = structuredClone(sushi.config);
  online.business = { type: "Organization", cuisines: [], priceRange: "", sameAs: [], areaServed: [], geo: null };
  assert.equal(byId(auditOf(sushi, { config: online, context: { name: "x" } }), "business-info"), undefined);
  // The report of one restaurant never mentions another.
  const text = JSON.stringify(auditOf(sushi));
  for (const o of tenants.filter((t) => t.id !== "sushi"))
    for (const leak of [o.name, o.phone, o.address, o.products[0].name])
      assert.ok(!text.includes(leak), leak);
});

/** Member context (authenticated staff) under the application role. */
const member = <T>(user: string, r: string, fn: (tx: DB) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE atacuisine_app");
    await tx.query(
      "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public','false',true)",
      [user, r],
    );
    return fn(tx);
  });
type JobRow = { dedupe_key: string; status: string; trigger: string };
const seoJobs = async (r: string) =>
  (
    await db.query<JobRow>(
      "SELECT dedupe_key,status,payload->>'trigger' AS trigger FROM outbox_jobs WHERE restaurant_id=$1 AND kind='seo_audit' ORDER BY dedupe_key",
      [r],
    )
  ).rows;

test("SEO automatisation : événements métier → une analyse regroupée, reprise sans doublon", async () => {
  // Creation of the restaurants (seed) already queued one audit each.
  assert.deepEqual(
    (await seoJobs("atelier")).map((j) => j.dedupe_key),
    ["auto"],
  );
  // A catalogue change by the application role coalesces into the same pending job.
  await member("nadia", "bernay", (tx) =>
    tx.query("UPDATE menu_items SET description=description||'' WHERE restaurant_id='bernay'"),
  );
  let jobs = await seoJobs("bernay");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, "pending");
  assert.equal(jobs[0].trigger, "catalogue");
  // While an audit runs, a change queues one follow-up instead of being lost.
  await db.query("UPDATE outbox_jobs SET status='running' WHERE restaurant_id='bernay' AND kind='seo_audit' AND dedupe_key='auto'");
  await db.query("UPDATE shop_settings SET config=config WHERE restaurant_id='bernay'");
  await db.query("UPDATE shop_settings SET config=config WHERE restaurant_id='bernay'");
  jobs = await seoJobs("bernay");
  assert.deepEqual(jobs.map((j) => [j.dedupe_key, j.status, j.trigger]), [
    ["auto", "running", "catalogue"],
    ["auto-next", "pending", "réglages boutique"],
  ]);
  // A finished job is reused for the next event (no unbounded growth).
  await db.query("UPDATE outbox_jobs SET status='done' WHERE restaurant_id='bernay' AND kind='seo_audit'");
  await db.query("UPDATE restaurant_domains SET verified_at=verified_at WHERE hostname='bernay-a.test'");
  jobs = await seoJobs("bernay");
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.find((j) => j.dedupe_key === "auto"), { dedupe_key: "auto", status: "pending", trigger: "domaine" });
  // Publication triggers it too; other restaurants are untouched.
  const before = JSON.stringify(await seoJobs("atelier"));
  await db.query("UPDATE outbox_jobs SET status='done' WHERE restaurant_id='bernay' AND kind='seo_audit'");
  const v = (await db.query<{ id: string }>("SELECT published_version_id AS id FROM restaurant_cms WHERE restaurant_id='bernay'")).rows[0].id;
  await db.query("UPDATE restaurant_cms SET published_version_id=NULL WHERE restaurant_id='bernay'");
  await db.query("UPDATE restaurant_cms SET published_version_id=$1 WHERE restaurant_id='bernay'", [v]);
  assert.equal((await seoJobs("bernay")).find((j) => j.dedupe_key === "auto")?.trigger, "publication");
  assert.equal(JSON.stringify(await seoJobs("atelier")), before);
});

test("SEO tableau de bord : analyse, historique, observations IA, droits et isolation", async () => {
  const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };
  const chef = { id: "karim", name: "Karim", role: "CHEF" as const };
  // Manual audit through the real admin module.
  const run = await member("nadia", "bernay", (tx) => seoPost(tx, "bernay", owner, { action: "audit" }));
  assert.ok(run.id);
  const state = await member("nadia", "bernay", (tx) => seoGet(tx, "bernay", owner));
  assert.equal(state.latest?.id, run.id);
  assert.equal(state.latest?.trigger, "manuel (Nadia)");
  // Publication date exposed as ISO 8601 whatever the driver returns.
  assert.match(state.latest!.report.publishedAt!, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(byId(state.latest!.report, "published")?.detail.slice(0, 31), `Version en ligne publiée le ${state.latest!.report.publishedAt!.slice(0, 4)}`.slice(0, 31));
  // Canonical host from the database; protocol of the platform (http here, APP_URL is unset).
  assert.match(state.latest!.report.canonicalBase, /^https?:\/\/bernay-b\.test$/);
  assert.deepEqual(state.integrations, { searchConsole: false, bingWebmaster: false, fieldData: false });
  // Without the website permission: refused.
  await assert.rejects(member("karim", "bernay", (tx) => seoGet(tx, "bernay", chef)));
  await assert.rejects(member("karim", "bernay", (tx) => seoPost(tx, "bernay", chef, { action: "audit" })));

  // Reports: never readable in a visitor context, never writable for another restaurant.
  const visible = await visitor("bernay", (tx) => tx.query("SELECT id FROM seo_audits"));
  assert.equal(visible.rows.length, 0);
  await assert.rejects(
    visitor("atelier", (tx) => tx.query("SELECT app.record_seo_audit('bernay','x','{}'::jsonb)")),
    /non autorisé/,
  );
  // History is bounded.
  for (let i = 0; i < 22; i++)
    await member("nadia", "bernay", (tx) => tx.query("SELECT app.record_seo_audit('bernay','test','{}'::jsonb)"));
  assert.equal((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM seo_audits WHERE restaurant_id='bernay'")).rows[0].n, 20);

  // AI observations: entered by the team, dated, never in the future, scoped to the restaurant.
  await member("nadia", "bernay", (tx) =>
    seoPost(tx, "bernay", owner, { action: "observe", observedOn: "2026-11-01", assistant: "Perplexity", query: "couscous Bernay", cited: true, evidence: "Cité avec lien vers le site" }),
  );
  await assert.rejects(
    member("nadia", "bernay", (tx) =>
      seoPost(tx, "bernay", owner, { action: "observe", observedOn: "2999-01-01", assistant: "X", query: "q", cited: false }),
    ),
    /futur/,
  );
  const obs = await member("nadia", "bernay", (tx) => seoGet(tx, "bernay", owner));
  assert.equal(obs.observations.length, 1);
  assert.equal((obs.observations[0] as { created_by: string }).created_by, "Nadia");
  const other = await member("nadia", "atelier", (tx) => seoGet(tx, "atelier", owner));
  assert.equal(other.observations.length, 0);
  assert.equal(other.latest, null);
  // Deleting from another restaurant's context does nothing.
  const id = (obs.observations[0] as { id: string }).id;
  await member("nadia", "atelier", (tx) => seoPost(tx, "atelier", owner, { action: "deleteObservation", id }));
  assert.equal((await member("nadia", "bernay", (tx) => seoGet(tx, "bernay", owner))).observations.length, 1);
});
