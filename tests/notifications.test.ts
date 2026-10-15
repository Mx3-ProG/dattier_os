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

test("migration 003 : notifications existantes conservées et visibles par tous", async () => {
  const n = await one<{ priority: string; type: string; permissions: null }>(
    db,
    "SELECT * FROM notifications WHERE id='old-notice'",
  );
  assert.equal(n.priority, "normal");
  assert.equal(n.type, "system.info");
  assert.equal(n.permissions, null);
  const versions = await rows<{ version: number }>(
    db,
    "SELECT version FROM schema_versions ORDER BY version",
  );
  assert.deepEqual(
    versions.map((v) => v.version),
    [1, 2, 3],
  );
});

test("multi-rôle : rôle principal déterministe et union des permissions", async () => {
  await db.query("INSERT INTO memberships VALUES('leila','bernay','WAITER')");
  const leila = await as("leila");
  assert.equal(leila.role, "WAITER");
  assert.deepEqual(leila.roles, ["ACCOUNTANT", "WAITER"]);
  assert.ok(can(leila, "finance") && can(leila, "orders"));
  assert.ok(!can(leila, "stock"));
  assert.ok(permissionsOf(leila).includes("payments"));
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
  assert.ok((await types("karim")).includes("order.created"));
  assert.ok((await types("sarah")).includes("order.created"));
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
  const leila = await listNotifications(db, "bernay", await as("leila"));
  const alert = leila.items.find((n) => n.type === "finance.unusual_expense");
  assert.ok(alert && alert.priority === "high" && alert.module === "expenses");
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
  assert.ok(amine.includes("stock.inventory_gap"));
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
  assert.ok(!(await types("ines")).includes("stock.expiring"));
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
  const leila = await listNotifications(db, "bernay", await as("leila"));
  const secret = leila.items.find((n) => n.type === "finance.unusual_expense")!;
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
  assert.ok((await types("sarah")).includes("order.created"));
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
