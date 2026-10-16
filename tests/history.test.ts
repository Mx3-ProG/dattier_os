import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import { one, rows } from "../src/lib/database/db";
import { perform, actionSchema } from "../src/lib/actions";
import { scope, type Actor } from "../src/lib/auth/session";
import { orderSchema } from "../src/features/orders/service";
import { listHistory } from "../src/features/events/history";
import { listNotifications } from "../src/features/notifications/service";
let db: PGlite;
const profile = (id: string): Actor => ({ id, name: id, role: "WAITER" });
const as = (id: string, r = "bernay") =>
  db.transaction((tx) => scope(tx, profile(id), r));
const act = async (id: string, input: unknown) => {
  const user = await as(id);
  return db.transaction((tx) =>
    perform(tx, "bernay", user, actionSchema.parse(input)),
  );
};
const history = async (
  id: string,
  options: Parameters<typeof listHistory>[3] = {},
  r = "bernay",
) => (await listHistory(db, r, await as(id, r), options)).items;
const modules = async (id: string) =>
  new Set((await history(id, { limit: 200 })).map((e) => e.module));
let orderId = "";
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  orderId = (await act("sarah", {
    action: "order",
    data: orderSchema.parse({
      restaurant: "bernay",
      table: "bernay-t8",
      key: randomUUID(),
      items: [
        { menu: "bernay-Plats-0", quantity: 2 },
        { menu: "bernay-Boissons-0", quantity: 2 },
      ],
    }),
  })) as string;
  const items = await rows<{ id: string; station: string }>(
    db,
    "SELECT id,station FROM order_items WHERE order_id=$1",
    [orderId],
  );
  for (const i of items) {
    const who = i.station === "bar" ? "youssef" : "karim";
    await act(who, { action: "item", id: i.id, status: "preparing" });
    await act(who, { action: "item", id: i.id, status: "ready" });
    await act("sarah", { action: "item", id: i.id, status: "served" });
  }
  await act("sarah", { action: "pay", id: orderId, method: "card" });
  await act("sarah", { action: "clock", event: "start" });
  await act("leila", { action: "expense", label: "Fleurs", amount: 2500 });
  await act("amine", {
    action: "stock",
    id: "bernay-the-lot",
    quantity: 5,
    reason: "Thé renversé",
    kind: "waste",
  });
});
after(async () => db.close());

test("chaque étape du service est rangée dans sa rubrique, avec son auteur", async () => {
  const events = await history("nadia", { limit: 200 });
  const of = (module: string) =>
    events.filter((e) => e.object_id === orderId && e.module === module);
  assert.equal(
    of("kitchen").find((e) => e.type === "order.created")?.actor_name,
    "Sarah",
  );
  assert.match(
    of("kitchen").find((e) => e.type === "order.created")!.summary,
    /Table 8 · 2 × Couscous royal/,
  );
  assert.ok(of("bar").some((e) => e.type === "order.created"));
  assert.ok(
    of("kitchen").some(
      (e) => e.type === "order.item_preparing" && e.actor_name === "Karim",
    ),
  );
  assert.ok(
    of("bar").some(
      (e) => e.type === "order.ready" && e.actor_name === "Youssef",
    ),
  );
  assert.equal(
    of("orders").filter((e) => e.type === "order.item_served").length,
    2,
  );
  const paid = of("orders").find((e) => e.type === "order.paid")!;
  assert.match(paid.summary, /Encaissement déclaré · Table 8 · .*carte/);
  assert.ok(
    events.some(
      (e) =>
        e.module === "stocks" &&
        e.type === "stock.waste" &&
        /Perte déclarée : 5 g de Thé vert/.test(e.summary),
    ),
  );
  assert.ok(events.some((e) => e.module === "expenses"));
  assert.ok(events.some((e) => e.module === "attendance"));
});

test("chacun ne voit que l’historique de son métier", async () => {
  const waiter = await modules("sarah");
  assert.ok(waiter.has("kitchen") && waiter.has("bar") && waiter.has("orders"));
  assert.ok(waiter.has("attendance"), "ses propres pointages");
  assert.ok(!waiter.has("stocks") && !waiter.has("expenses"));
  const chef = await modules("karim");
  assert.ok(chef.has("kitchen") && chef.has("stocks"));
  assert.ok(!chef.has("expenses") && !chef.has("attendance"));
  assert.ok(
    !(await history("karim")).some((e) => e.type === "order.paid"),
    "montants encaissés réservés aux profils règlement/finance",
  );
  const stock = await modules("amine");
  assert.ok(
    stock.has("stocks") && !stock.has("kitchen") && !stock.has("orders"),
  );
  const accountant = await modules("leila");
  assert.ok(accountant.has("expenses") && !accountant.has("stocks"));
  assert.ok(
    (await history("leila")).some((e) => e.type === "order.paid"),
    "la comptabilité voit les encaissements",
  );
  const owner = await modules("nadia");
  for (const m of [
    "kitchen",
    "bar",
    "orders",
    "stocks",
    "expenses",
    "attendance",
  ])
    assert.ok(owner.has(m), m);
});

test("filtres : rubrique, recherche, période et isolation", async () => {
  const bar = await history("nadia", { category: "bar" });
  assert.ok(bar.length && bar.every((e) => e.module === "bar"));
  const found = await history("nadia", { query: "Fleurs" });
  assert.ok(found.length && found.every((e) => /Fleurs/.test(e.summary)));
  assert.ok((await history("nadia", { query: "Leïla" })).length);
  assert.equal((await history("nadia", { query: "100%_" })).length, 0);
  await db.query(
    "UPDATE domain_events SET created_at=now()-interval '20 days' WHERE type='stock.waste'",
  );
  assert.ok(
    !(await history("nadia", { days: 7 })).some(
      (e) => e.type === "stock.waste",
    ),
  );
  assert.ok(
    (await history("nadia", { days: 30 })).some(
      (e) => e.type === "stock.waste",
    ),
  );
  assert.equal((await history("nadia", {}, "atelier")).length, 0);
  await assert.rejects(as("sarah", "atelier"), /autorisé/);
});

test("pagination stable malgré des événements simultanés", async () => {
  await db.query(
    "UPDATE domain_events SET created_at='2026-10-16 10:00:00.123456+00' WHERE restaurant_id='bernay' AND module IN ('kitchen','bar')",
  );
  const all = await history("nadia", { limit: 200 });
  const seen: string[] = [];
  let before: string | undefined;
  for (let guard = 0; guard < 100; guard++) {
    const page = await listHistory(db, "bernay", await as("nadia"), {
      limit: 3,
      before,
    });
    seen.push(...page.items.map((e) => e.id));
    if (!page.hasMore) break;
    before = page.next!;
  }
  assert.deepEqual(
    seen,
    all.map((e) => e.id),
  );
});

test("libellés lisibles calculés avant l’action (produit supprimé, prix modifié)", async () => {
  await act("lina", {
    action: "createProduct",
    name: "Assiette test",
    category: "Entrées",
    price: 900,
    station: "kitchen",
    ingredients: [{ id: "bernay-legumes", quantity: 100 }],
  });
  const product = await one<{ id: string }>(
    db,
    "SELECT id FROM menu_items WHERE name='Assiette test'",
  );
  await act("lina", {
    action: "menu",
    id: product.id,
    name: "Assiette test",
    price: 1100,
    enabled: false,
    description: "",
  });
  await act("lina", {
    action: "productLifecycle",
    id: product.id,
    operation: "delete",
  });
  const menu = await history("lina", { category: "menu" });
  assert.ok(menu.some((e) => e.summary === "Produit supprimé : Assiette test"));
  assert.ok(
    menu.some((e) =>
      /Fiche modifiée : Assiette test · prix 9,00\s€ → 11,00\s€ · retiré de la vente/.test(
        e.summary,
      ),
    ),
  );
  assert.ok(menu.every((e) => e.actor_name === "Lina" || !e.actor_name));
});

test("notifications au-delà de 7 jours : retirées du centre, conservées dans l’historique", async () => {
  const kitchen = await listNotifications(db, "bernay", await as("lina"));
  const target = kitchen.items.find((n) => n.object_id === orderId)!;
  await db.query(
    "UPDATE notifications SET created_at=now()-interval '8 days' WHERE id=$1",
    [target.id],
  );
  const after = await listNotifications(db, "bernay", await as("lina"));
  assert.ok(!after.items.some((n) => n.id === target.id));
  assert.ok(
    (await history("lina", { limit: 200 })).some(
      (e) => e.object_id === orderId,
    ),
  );
});
