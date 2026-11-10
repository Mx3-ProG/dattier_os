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
import { can, permissionsOf } from "../src/lib/permissions";
import { snapshot } from "../src/lib/snapshot";
import {
  createOrder,
  changeItem,
  orderSchema,
} from "../src/features/orders/service";
import {
  listNotifications,
  sweep,
} from "../src/features/notifications/service";
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
const types = async (id: string, r = "bernay") =>
  (await listNotifications(db, r, await as(id, r))).items.map((n) => n.type);
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await db.query("INSERT INTO restaurants(id,name) VALUES('legacy','Ancien')");
  await db.query(
    "INSERT INTO notifications VALUES('old-notice','legacy','Message existant',now())",
  );
  await migrate(db);
  await db.transaction(seed);
});
after(async () => db.close());

test("migration 161 : notifications existantes conservées et visibles par tous", async () => {
  const n = await one<{ priority: string; type: string; permissions: null }>(
    db,
    "SELECT * FROM notifications WHERE id='old-notice'",
  );
  assert.equal(n.priority, "normal");
  assert.equal(n.type, "system.info");
  assert.equal(n.permissions, null);
  const versions = await rows<{ version: number }>(
    db,
    "SELECT version FROM schema_versions WHERE version IN (161,162) ORDER BY version",
  );
  assert.deepEqual(
    versions.map((v) => v.version),
    [161, 162],
  );
  const legacy = await one<{ module: string }>(
    db,
    "SELECT module FROM notifications WHERE id='old-notice'",
  );
  assert.equal(legacy.module, "general");
});

test("multi-rôle : rôle principal déterministe et union des permissions", async () => {
  await db.query("INSERT INTO memberships VALUES('leila','bernay','WAITER')");
  const leila = await as("leila");
  // Modèle actuel (auth/session.scope) : OWNER, puis MANAGER, puis ordre alphabétique.
  assert.equal(leila.role, "ACCOUNTANT");
  assert.deepEqual(leila.roles, ["ACCOUNTANT", "WAITER"]);
  const roles = leila.roles ?? leila.role;
  assert.ok(can(roles, "finance") && can(roles, "orders"));
  assert.ok(!can(roles, "stock"));
  assert.ok(permissionsOf(roles).includes("payments"));
  const data = await db.transaction((tx) =>
    snapshot(tx, profile("leila"), "bernay"),
  );
  assert.ok(data.tables.length > 0, "vue salle accessible");
  assert.ok(Array.isArray(data.expenses), "vue finance accessible");
  await db.query(
    "DELETE FROM memberships WHERE profile_id='leila' AND role='WAITER'",
  );
});

test("commandes : destinataires filtrés par permission", async () => {
  const id = await db.transaction(async (tx) =>
    createOrder(
      tx,
      orderSchema.parse({
        restaurant: "bernay",
        table: "bernay-t8",
        key: randomUUID(),
        items: [{ menu: "bernay-Plats-0", quantity: 1 }],
      }),
      await scope(tx, profile("sarah"), "bernay"),
    ),
  );
  const kitchen = (
    await listNotifications(db, "bernay", await as("karim"))
  ).items.find((n) => n.type === "order.created" && n.object_id === id);
  assert.equal(kitchen?.module, "kitchen");
  assert.match(kitchen!.message, /Table 8 · 1 × /);
  assert.ok((await types("lina")).includes("order.created"));
  assert.ok(
    !(await listNotifications(db, "bernay", await as("youssef"))).items.some(
      (n) => n.object_id === id,
    ),
    "le bar ne reçoit pas les plats",
  );
  assert.ok(
    !(await listNotifications(db, "bernay", await as("sarah"))).items.some(
      (n) => n.object_id === id && n.type === "order.created",
    ),
    "pas de notification pour sa propre action",
  );
  assert.ok(!(await types("ines")).includes("order.created"));
  assert.ok(!(await types("leila")).includes("order.created"));
  const item = await one<{ id: string }>(
    db,
    "SELECT id FROM order_items WHERE order_id=$1",
    [id],
  );
  const karim = await as("karim");
  await db.transaction((tx) =>
    changeItem(tx, "bernay", item.id, "preparing", karim),
  );
  await db.transaction((tx) =>
    changeItem(tx, "bernay", item.id, "ready", karim),
  );
  assert.ok((await types("sarah")).includes("order.ready"));
  assert.ok(!(await types("karim")).includes("order.ready"));
  assert.ok(!(await types("amine")).includes("order.ready"));
  const event = await one<{ type: string; actor: string }>(
    db,
    "SELECT type,actor FROM domain_events WHERE object_id=$1 AND type='order.ready'",
    [id],
  );
  assert.equal(event.actor, "karim");
});

test("événement annulé avec l’opération qui échoue", async () => {
  const before = await one<{ n: number }>(
    db,
    "SELECT count(*)::int AS n FROM domain_events",
  );
  await assert.rejects(
    db.transaction(async (tx) => {
      await createOrder(
        tx,
        orderSchema.parse({
          restaurant: "bernay",
          table: "bernay-t9",
          key: randomUUID(),
          items: [{ menu: "bernay-Plats-0", quantity: 1 }],
        }),
        await scope(tx, profile("sarah"), "bernay"),
      );
      throw new Error("échec après l’émission");
    }),
    /échec/,
  );
  const after = await one<{ n: number }>(
    db,
    "SELECT count(*)::int AS n FROM domain_events",
  );
  assert.equal(after.n, before.n);
});

test("dépense inhabituelle réservée aux profils finance", async () => {
  for (let i = 0; i < 3; i++)
    await act("leila", { action: "expense", label: "Courses", amount: 1000 });
  assert.ok(!(await types("leila")).includes("finance.unusual_expense"));
  await act("leila", { action: "expense", label: "Four", amount: 90000 });
  const nadia = await listNotifications(db, "bernay", await as("nadia"));
  const alert = nadia.items.find((n) => n.type === "finance.unusual_expense");
  assert.ok(alert && alert.priority === "high" && alert.module === "expenses");
  assert.equal(alert.actor_name, "Leïla");
  assert.ok(!(await types("leila")).includes("finance.unusual_expense"));
  assert.ok(!(await types("lina")).includes("finance.unusual_expense"));
  assert.ok(!(await types("sarah")).includes("finance.unusual_expense"));
});

test("alertes calculées : stock faible, rupture, écart d’inventaire, sans doublon", async () => {
  await act("amine", {
    action: "stock",
    id: "bernay-the-lot",
    quantity: 50,
    reason: "Comptage",
    kind: "inventory",
  });
  await act("amine", {
    action: "stock",
    id: "bernay-dessert-lot",
    quantity: 0,
    reason: "Comptage",
    kind: "inventory",
  });
  await db.transaction((tx) => sweep(tx, "bernay"));
  await db.transaction((tx) => sweep(tx, "bernay"));
  const amine = await types("amine");
  assert.ok((await types("lina")).includes("stock.inventory_gap"));
  assert.ok(!amine.includes("stock.inventory_gap"));
  assert.equal(amine.filter((t) => t === "stock.low").length, 1);
  assert.ok(amine.includes("stock.out"));
  assert.ok((await types("ines")).includes("stock.low"));
  assert.ok(!(await types("sarah")).includes("stock.low"));
  assert.ok((await types("sarah")).includes("menu.unavailable"));
  const atelier = await types("nadia", "atelier");
  assert.ok(!atelier.includes("stock.out"), "isolation par établissement");
});

test("retard de commande et lot proche de la date limite", async () => {
  await db.query(
    "UPDATE orders SET created_at=now()-interval '45 minutes' WHERE restaurant_id='bernay' AND status='active'",
  );
  await db.query(
    "UPDATE stock_lots SET expires_on=CURRENT_DATE+1 WHERE id='bernay-menthe-lot'",
  );
  await db.transaction((tx) => sweep(tx, "bernay"));
  assert.ok((await types("karim")).includes("order.late"));
  assert.ok((await types("amine")).includes("stock.expiring"));
  assert.ok(!(await types("sarah")).includes("stock.expiring"));
});

test("planning : notification réservée à l’employé concerné", async () => {
  const start = new Date(Date.now() + 3 * 86400000);
  start.setUTCHours(8, 0, 0, 0);
  const end = new Date(start.getTime() + 4 * 3600000);
  await act("nadia", {
    action: "shift",
    profile: "sarah",
    start: start.toISOString(),
    end: end.toISOString(),
  });
  assert.ok((await types("sarah")).includes("team.shift"));
  assert.ok(!(await types("karim")).includes("team.shift"));
  assert.ok(!(await types("nadia")).includes("team.shift"));
});

test("lu unitaire, lu global et notifications invisibles intouchables", async () => {
  const nadia = await listNotifications(db, "bernay", await as("nadia"));
  const secret = nadia.items.find((n) => n.type === "finance.unusual_expense")!;
  await act("sarah", { action: "read", id: secret.id });
  assert.equal(
    (
      await rows(
        db,
        "SELECT 1 FROM notification_reads WHERE notification_id=$1",
        [secret.id],
      )
    ).length,
    0,
  );
  const sarah = await listNotifications(db, "bernay", await as("sarah"));
  const first = sarah.items[0];
  await act("sarah", { action: "read", id: first.id });
  const next = await listNotifications(db, "bernay", await as("sarah"));
  assert.equal(next.unread, sarah.unread - 1);
  assert.ok(next.items.find((n) => n.id === first.id)!.read);
  await act("sarah", { action: "read" });
  assert.equal(
    (await listNotifications(db, "bernay", await as("sarah"))).unread,
    0,
  );
});

test("préférences : sourdine par type, critique toujours affiché", async () => {
  assert.ok((await types("karim")).includes("order.created"));
  await act("karim", {
    action: "notificationPreference",
    type: "order.created",
    muted: true,
  });
  assert.ok(!(await types("karim")).includes("order.created"));
  assert.ok((await types("lina")).includes("order.created"));
  await assert.rejects(
    act("amine", {
      action: "notificationPreference",
      type: "stock.out",
      muted: true,
    }),
    /critiques/,
  );
  await assert.rejects(
    act("amine", {
      action: "notificationPreference",
      type: "inconnu",
      muted: true,
    }),
    /inconnu/,
  );
  await act("karim", {
    action: "notificationPreference",
    type: "order.created",
    muted: false,
  });
  assert.ok((await types("karim")).includes("order.created"));
});

test("isolation en base (atacuisine_app) : événements et préférences restent dans leur établissement", async () => {
  const as = <T>(
    ctx: { user?: string; restaurant: string; public?: boolean },
    fn: (tx: Parameters<Parameters<PGlite["transaction"]>[0]>[0]) => Promise<T>,
  ) =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      await tx.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.restaurant_id',$2,true),set_config('app.public',$3,true)",
        [ctx.user ?? "", ctx.restaurant, ctx.public ? "true" : "false"],
      );
      return fn(tx);
    });
  await db.query(
    "INSERT INTO domain_events(id,restaurant_id,type,module,summary) VALUES('ev-bernay','bernay','test','general','Bernay'),('ev-atelier','atelier','test','general','Atelier')",
  );
  // Karim n'appartient qu'à Bernay : il ne lit rien de l'Atelier, même en le demandant.
  const seen = await as({ user: "karim", restaurant: "bernay" }, (tx) =>
    rows<{ id: string }>(tx, "SELECT id FROM domain_events WHERE id LIKE 'ev-%'"),
  );
  assert.deepEqual(seen.map((e) => e.id), ["ev-bernay"]);
  assert.equal(
    (
      await as({ user: "karim", restaurant: "atelier" }, (tx) =>
        rows(tx, "SELECT id FROM domain_events"),
      )
    ).length,
    0,
  );
  await assert.rejects(
    as({ user: "karim", restaurant: "bernay" }, (tx) =>
      tx.query(
        "INSERT INTO domain_events(id,restaurant_id,type,module,summary) VALUES('ev-x','atelier','test','general','Intrus')",
      ),
    ),
  );
  // Journal en ajout seul.
  await assert.rejects(
    as({ user: "nadia", restaurant: "bernay" }, (tx) =>
      tx.query("UPDATE domain_events SET summary='modifié' WHERE id='ev-bernay'"),
    ),
  );
  // Canal public : dépose un événement de son établissement sans pouvoir relire le journal.
  await as({ restaurant: "bernay", public: true }, async (tx) => {
    await tx.query(
      "INSERT INTO domain_events(id,restaurant_id,type,module,summary) VALUES('ev-public','bernay','reservation.requested','reservations','Demande')",
    );
    assert.equal((await rows(tx, "SELECT id FROM domain_events")).length, 0);
    assert.equal(
      (await rows(tx, "SELECT type FROM notification_preferences")).length,
      0,
    );
  });
  // Préférences : chacun ne lit et n'écrit que les siennes.
  await db.query(
    "INSERT INTO notification_preferences VALUES('karim','bernay','stock.low',true) ON CONFLICT DO NOTHING",
  );
  assert.equal(
    (
      await as({ user: "sarah", restaurant: "bernay" }, (tx) =>
        rows(tx, "SELECT * FROM notification_preferences"),
      )
    ).length,
    0,
  );
  await assert.rejects(
    as({ user: "sarah", restaurant: "bernay" }, (tx) =>
      tx.query(
        "INSERT INTO notification_preferences VALUES('karim','bernay','order.ready',true)",
      ),
    ),
  );
  // Une notification ne peut pas citer l'événement d'un autre établissement.
  await assert.rejects(
    db.query(
      "INSERT INTO notifications(id,restaurant_id,message,event_id) VALUES('n-cross','bernay','x','ev-atelier')",
    ),
    /hors etablissement/,
  );
});
