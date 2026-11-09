import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import type { Client } from "pg";
import Stripe from "stripe";
import { parisToUtc, serviceSlots } from "../../src/features/reservations/service";
import type { World } from "./seed";

type Check = (section: string, ok: boolean, detail: string) => void;
export const SESSION_SECRET = "isolation-test-secret-0123456789-abcdef";
export const WEBHOOK_SECRET = "whsec_isolation_test";

/** Même cookie que la fin de connexion OIDC : aucun raccourci côté application. */
export async function sessionCookie(id: string, email = `${id}@example.test`) {
  const token = await new SignJWT({
    sub: id,
    name: id,
    email,
    issuedAtMs: Date.now(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atacuisine")
    .setAudience("atacuisine-web")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SESSION_SECRET));
  return `atacuisine_identity=${token}`;
}

function apiRoutes(dir = "src/app/api"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...apiRoutes(full));
    else if (entry === "route.ts")
      found.push(dir.replace(/^src\/app/, "").replaceAll(path.sep, "/"));
  }
  return found;
}

const MODULES = [
  "site",
  "seo",
  "shop",
  "team",
  "loyalty",
  "inventory",
  "security",
  "events",
  "integrations",
];
/** Routes publiques par conception : couvertes par les parcours et les ID forgés. */
const PUBLIC_ROUTES = [/^\/api\/store\//, /^\/api\/media\//, /\/media\/\[file\]$/];

function concrete(route: string, restaurant: string) {
  const base = route.replace("[restaurant]", encodeURIComponent(restaurant));
  if (base.includes("[module]"))
    return MODULES.map((m) => base.replace("[module]", m));
  return [base.replace(/\[[^\]]+\]/g, "x").replace("[...path]", "state")];
}

export async function httpChecks(
  world: World,
  migrator: Client,
  appUrl: string,
  check: Check,
) {
  const call = async (
    method: string,
    url: string,
    options: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {},
  ) => {
    const response = await fetch(`${appUrl}${url}`, {
      method,
      redirect: "manual",
      headers: {
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(method === "GET"
          ? {}
          : { origin: appUrl, "content-type": "application/json" }),
        ...options.headers,
      },
      body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
    });
    return { status: response.status, text: await response.text() };
  };

  // Valeurs privées de A1 : aucune réponse à un autre client ne doit les contenir.
  const canaries = new Set<string>();
  for (const rows of world.rows.values())
    for (const value of Object.values(rows.a1 ?? {}))
      if (
        typeof value === "string" &&
        value.startsWith(`iso-${world.run}-`) &&
        !Object.values(world.restaurant).includes(value) &&
        !Object.values(world.org).includes(value) &&
        !Object.values(world.profile).includes(value)
      )
        canaries.add(value);
  const leaked = (text: string) => [...canaries].find((c) => text.includes(c));

  const p = world.profile,
    r = world.restaurant;
  const ownerB = await sessionCookie(p.ownerB),
    employee = await sessionCookie(p.employeeA1),
    ownerA = await sessionCookie(p.ownerA),
    nadia = await sessionCookie("nadia");

  // 1. Toute route tenant refuse un autre client, un autre établissement, un anonyme.
  const routes = apiRoutes().filter(
    (route) =>
      route.includes("[restaurant]") &&
      !PUBLIC_ROUTES.some((pattern) => pattern.test(route)),
  );
  check(
    "HTTP : routes tenant",
    routes.length >= 15,
    `Seulement ${routes.length} routes tenant trouvées`,
  );
  const actors: [string, string | undefined, string][] = [
    ["client B", ownerB, r.a1],
    ["employé de A1 sur A2", employee, r.a2],
    ["anonyme", undefined, r.a1],
  ];
  for (const route of routes)
    for (const url of concrete(route, "__R__"))
      for (const method of ["GET", "POST"])
        for (const [label, cookie, target] of actors) {
          const target_url = url.replace("__R__", encodeURIComponent(target));
          const res = await call(method, target_url, { cookie });
          check(
            "HTTP : routes tenant",
            res.status >= 400 && res.status < 500,
            `${label} ${method} ${target_url} → ${res.status}`,
          );
          const secret = leaked(res.text);
          check(
            "HTTP : routes tenant",
            !secret,
            `${label} ${method} ${target_url} expose ${secret}`,
          );
        }

  // 2. Contrôle positif : les refus ci-dessus ne viennent pas d'une app cassée.
  for (const url of [
    "/api/restaurants/bernay/finance",
    "/api/restaurants/bernay/bank",
    "/api/restaurants/bernay/invoices",
    "/api/restaurants/bernay/hr",
    "/api/restaurants/bernay/payments",
    "/api/restaurants/bernay/billing",
    "/api/restaurants/bernay/team",
    "/api/v1/state?restaurant=bernay",
  ]) {
    const res = await call("GET", url, { cookie: nadia });
    check(
      "HTTP : contrôle positif propriétaire",
      res.status === 200,
      `GET ${url} → ${res.status} ${res.text.slice(0, 160)}`,
    );
  }

  // 3. ID valides de A, demandés depuis l'espace de B.
  const invoice = world.rows.get("fin_supplier_invoices")?.a1?.id;
  const sale = world.rows.get("fin_invoices")?.a1?.id;
  const asset = world.rows.get("site_assets")?.a1?.id;
  const media = world.rows.get("cms_media")?.a1?.id;
  for (const url of [
    `/api/restaurants/${r.b1}/invoices/${invoice}`,
    `/api/restaurants/${r.b1}/billing/${sale}/html`,
    `/api/media/${r.b1}/${asset}`,
    `/api/cms/${r.b1}/media/${media}`,
    `/api/media/${r.a1}/${asset}`,
  ])
    for (const [label, cookie] of [
      ["client B", ownerB],
      ["anonyme", undefined],
    ] as const) {
      const res = await call("GET", url, { cookie });
      check(
        "HTTP : ID forgés",
        res.status >= 400 && res.status < 500,
        `${label} GET ${url} → ${res.status}`,
      );
    }

  // 4. /api/v1 ne retombe jamais sur un tenant implicite.
  for (const url of ["/api/v1/state", "/api/v1/public", "/api/v1/calendar"]) {
    const res = await call("GET", url, { cookie: ownerB });
    check(
      "HTTP : tenant implicite",
      res.status === 400 && !res.text.includes("Studio Restau"),
      `GET ${url} sans restaurant → ${res.status}`,
    );
  }
  const forced = await call("GET", `/api/v1/state?restaurant=${r.a1}`, {
    cookie: ownerB,
  });
  check(
    "HTTP : tenant implicite",
    forced.status === 403,
    `Client B GET /api/v1/state?restaurant=A1 → ${forced.status}`,
  );

  // 5. Visiter le site de A ne crée aucune fiche client chez A.
  const visit = await call("GET", `/api/store/${r.a1}/customer-session`, {
    cookie: ownerB,
  });
  const visitCount = async (restaurant: string, profile: string) =>
    (
      await migrator.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM customers c JOIN organization_customers a ON a.id=c.account_id WHERE c.restaurant_id=$1 AND a.subject=$2",
        [restaurant, profile],
      )
    ).rows[0].count;
  check(
    "HTTP : identité entre clients",
    visit.status === 200 && JSON.parse(visit.text).email === `${p.ownerB}@example.test`,
    `customer-session → ${visit.status} ${visit.text.slice(0, 120)}`,
  );
  check(
    "HTTP : identité entre clients",
    (await visitCount(r.a1, p.ownerB)) === 0,
    "Ouvrir le site de A crée une fiche client de B chez A",
  );

  // 6. Une action explicite du client crée bien la fiche, et seulement là.
  const joined = await call("POST", `/api/store/${r.b1}/loyalty-join`, {
    cookie: ownerB,
  });
  check(
    "HTTP : identité entre clients",
    joined.status === 200 && (await visitCount(r.b1, p.ownerB)) === 1,
    `Adhésion explicite → ${joined.status} ${joined.text.slice(0, 120)}`,
  );

  // 7. Rate limit : saturer le site de A n'atteint pas celui de B.
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  let limited = false;
  for (let i = 0; i < 62 && !limited; i++) {
    const res = await call("POST", `/api/store/${r.a1}/unknown`, {
      headers: { "x-real-ip": ip },
    });
    limited = res.status === 429;
  }
  check("HTTP : rate limit", limited, "Le site de A n'est jamais limité");
  const neighbour = await call("POST", `/api/store/${r.b1}/unknown`, {
    headers: { "x-real-ip": ip },
  });
  check(
    "HTTP : rate limit",
    neighbour.status !== 429,
    "Le site de B est limité à cause du site de A",
  );

  // 8. Webhook signé : l'événement reste chez le restaurant de ses métadonnées.
  const event = {
    id: `evt_iso_${randomUUID()}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_iso_${randomUUID()}`,
        payment_status: "paid",
        metadata: { restaurant: r.a1, order: "absent" },
      },
    },
  };
  const raw = JSON.stringify(event);
  const webhook = await fetch(`${appUrl}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({
        payload: raw,
        secret: WEBHOOK_SECRET,
      }),
    },
    body: raw,
  });
  const queued = await migrator.query<{ restaurant_id: string }>(
    "SELECT restaurant_id FROM outbox_jobs WHERE kind='stripe_event' AND dedupe_key=$1",
    [event.id],
  );
  check(
    "HTTP : webhook",
    webhook.status === 200 &&
      queued.rows.length === 1 &&
      queued.rows[0].restaurant_id === r.a1,
    `Webhook → ${webhook.status}, jobs : ${JSON.stringify(queued.rows)}`,
  );
  const unsigned = await fetch(`${appUrl}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=faux" },
    body: raw,
  });
  check(
    "HTTP : webhook",
    unsigned.status === 400,
    `Webhook non signé → ${unsigned.status}`,
  );

  await publicJourneys(world, call);
  void ownerA;

  async function publicJourneys(w: World, c: typeof call) {
    const section = "HTTP : parcours publics (non-régression)";
    const expectOk = async (
      label: string,
      method: string,
      url: string,
      options: Parameters<typeof call>[2] = {},
    ) => {
      const res = await c(method, url, options);
      check(
        section,
        res.status >= 200 && res.status < 400,
        `${label} ${method} ${url} → ${res.status} ${res.text.slice(0, 200)}`,
      );
      return res;
    };
    void w;
    await expectOk("Site", "GET", "/r/bernay");
    await expectOk("Sitemap", "GET", "/r/bernay/sitemap.xml");
    await expectOk("Robots", "GET", "/r/bernay/robots.txt");
    // llms.txt est facultatif : 404 tant que le restaurant ne l'a pas activé.
    const llms = await c("GET", "/r/bernay/llms.txt");
    check(section, llms.status < 500, `llms.txt → ${llms.status}`);
    const catalog = await expectOk("Catalogue", "GET", "/api/store/bernay/catalog");
    const items = (
      JSON.parse(catalog.text) as { products?: { id: string; available?: boolean }[] }
    ).products ?? [];
    check(section, items.length > 0, "Le catalogue public est vide");

    await expectOk("API publique", "GET", "/api/v1/public?restaurant=bernay");

    // Réservation anonyme : le premier créneau que le service proposerait.
    let reserved = false;
    const times = serviceSlots().flatMap((slot) => slot.times);
    for (let offset = 2; offset < 12 && !reserved; offset++) {
      const date = new Date(Date.now() + offset * 86400000)
        .toISOString()
        .slice(0, 10);
      const day = await c("GET", `/api/store/bernay/availability?date=${date}&guests=2`);
      check(section, day.status === 200, `Disponibilités ${date} → ${day.status} ${day.text.slice(0, 160)}`);
      if (day.status !== 200 || !(JSON.parse(day.text) as { open: boolean }).open)
        continue;
      const start = new Date(parisToUtc(date, times[0])).toISOString();
      const res = await c("POST", "/api/store/bernay/reservation", {
        body: { name: "Visiteur", contact: "visiteur@example.test", guests: 2, start },
      });
      reserved = res.status === 200;
      check(section, reserved, `Réservation ${start} → ${res.status} ${res.text.slice(0, 200)}`);
    }
    check(section, reserved, "Aucun créneau de réservation trouvé");

    // Commande anonyme au comptoir, puis suivi par jeton.
    const slot = (JSON.parse(catalog.text) as { slots?: string[] }).slots?.[0];
    check(section, !!slot, "Aucun créneau de commande proposé");
    const order = await c("POST", "/api/store/bernay/checkout", {
      body: {
        key: randomUUID(),
        customer: "Visiteur",
        email: "visiteur@example.test",
        consumption: "takeaway",
        payment: "counter",
        termsAccepted: true,
        slot,
        items: [{ menu: items[0]?.id, quantity: 1, choices: [], note: "" }],
      },
    });
    check(
      section,
      order.status === 200,
      `Commande → ${order.status} ${order.text.slice(0, 240)}`,
    );
    if (order.status === 200) {
      const token = (JSON.parse(order.text) as { token: string }).token;
      await expectOk("Suivi", "GET", "/api/store/bernay/receipt", {
        headers: { "x-order-token": token },
      });
    }

    // Compte client connecté : identité partagée, fiche créée par action explicite.
    const customer = await sessionCookie(`iso-${w.run}-visitor`);
    await migrator.query(
      "INSERT INTO profiles(id,name,role,email) VALUES($1,$1,'WAITER',$2) ON CONFLICT DO NOTHING",
      [`iso-${w.run}-visitor`, `iso-${w.run}-visitor@example.test`],
    );
    await expectOk("Session", "GET", "/api/store/bernay/customer-session", {
      cookie: customer,
    });
    await expectOk("Fidélité", "POST", "/api/store/bernay/loyalty-join", {
      cookie: customer,
    });
    await expectOk("Parrainage", "POST", "/api/store/bernay/referral-code", {
      cookie: customer,
    });
    await expectOk("Compte", "GET", "/api/store/bernay/account", {
      cookie: customer,
    });
    const qr = await expectOk(
      "QR client",
      "GET",
      "/api/store/bernay/qr?kind=customer",
      { cookie: customer },
    );
    if (qr.status === 200) {
      const token = (JSON.parse(qr.text) as { token: string }).token;
      await expectOk("Scan QR", "GET", `/q/${token}`);
    }
  }
}
