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

const PLATFORM = "https://app.dattier.test";
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
const ld = (t: Tenant, pageKey: string, requestHost = t.host ?? "app.dattier.test") =>
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
  assert.deepEqual(urlsFor(tajine, "app.dattier.test"), {
    canonicalBase: `${PLATFORM}/r/tajine`,
    servedBase: `${PLATFORM}/r/tajine`,
    mirror: false,
  });
  const onDomain = urlsFor(sushi, "www.sushi-kaze.test");
  assert.equal(onDomain.canonicalBase, "https://www.sushi-kaze.test");
  assert.equal(onDomain.mirror, false);
  // Same site reached through the platform: canonical stays on the domain.
  const mirror = urlsFor(sushi, "app.dattier.test");
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
  assert.match(platform, /Sitemap: https:\/\/app\.dattier\.test\/sitemap\.xml/);
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
            canonicalBase: urlsFor(t, t.host ?? "app.dattier.test").canonicalBase,
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
    await tx.exec("SET LOCAL ROLE dattier_app");
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
