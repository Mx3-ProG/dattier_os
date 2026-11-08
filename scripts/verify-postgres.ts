import assert from "node:assert/strict";
import { PostgresDatabase } from "../src/lib/database/postgres";
import { withDatabaseContext } from "../src/lib/database/context";
import { seed } from "../src/lib/database/seed";
import { one, rows, type DB } from "../src/lib/database/db";
import { platformPerform } from "../src/features/platform/service";
import { offlinePerform } from "../src/features/offline/service";
import { changeItem, createOrder, pay } from "../src/features/orders/service";
import { financeAction, financeState } from "../src/features/finance/service";
import { randomUUID } from "node:crypto";
const url = process.env.MIGRATION_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Base locale de vérification requise.");
if (process.env.CONFIRM_ISOLATED_DATABASE !== "true")
  throw new Error("CONFIRM_ISOLATED_DATABASE=true requis.");
const db = new PostgresDatabase(url);
async function app<T>(
  userId: string,
  restaurantId: string,
  fn: (tx: DB) => Promise<T>,
) {
  return withDatabaseContext({ userId, restaurantId }, () =>
    db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE atacuisine_app");
      return fn(tx);
    }),
  );
}
try {
  await db.transaction(seed);
  const user = { id: "nadia", name: "Nadia", role: "OWNER" as const };
  await db.query(
    "INSERT INTO profiles(id,name,role,email) VALUES('qa-other','QA Other','OWNER','qa-other@example.test')",
  );
  await withDatabaseContext({ userId: "qa-other" }, () =>
    db.query(
      "SELECT app.bootstrap_organization('qa-other-org','QA Other','qa-other-r','QA Other')",
    ),
  );
  assert.equal(
    (
      await app("nadia", "qa-other-r", (tx) =>
        rows(tx, "SELECT id FROM orders"),
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await app("nadia", "bernay", (tx) =>
        rows(tx, "SELECT id FROM restaurants WHERE id='qa-other-r'"),
      )
    ).length,
    0,
  );
  await assert.rejects(
    app("nadia", "bernay", (tx) =>
      tx.query(
        "INSERT INTO suppliers(id,restaurant_id,name) VALUES('qa-cross','qa-other-r','Forbidden')",
      ),
    ),
  );
  const flags = await app("nadia", "bernay", (tx) =>
    one<{ rolsuper: boolean; rolbypassrls: boolean; owns: boolean }>(
      tx,
      "SELECT r.rolsuper,r.rolbypassrls,EXISTS(SELECT FROM pg_tables WHERE schemaname='public' AND tableowner=current_user) AS owns FROM pg_roles r WHERE rolname=current_user",
    ),
  );
  assert.deepEqual(flags, {
    rolsuper: false,
    rolbypassrls: false,
    owns: false,
  });
  const addRestaurant = (name: string) =>
    app("qa-other", "qa-other-r", (tx) =>
      platformPerform(
        tx,
        { id: "qa-other", name: "QA", role: "OWNER" },
        {
          action: "restaurant",
          organization: "qa-other-org",
          name,
        },
      ),
    );
  await assert.rejects(addRestaurant("En attente"), /avant activation/);
  await db.query("SELECT app.configure_organization_plan('qa-other-org',69,2)");
  await assert.rejects(
    app("qa-other", "qa-other-r", (tx) =>
      tx.query("SELECT app.configure_organization_plan('qa-other-org',99,3)"),
    ),
    /permission denied/,
  );
  const results = await Promise.allSettled([
    addRestaurant("Restaurant B"),
    addRestaurant("Restaurant C"),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.match(
    String(results.find((result) => result.status === "rejected")?.reason),
    /Quota/,
  );
  const device = (await app("nadia", "bernay", (tx) =>
    offlinePerform(tx, "bernay", user, {
      action: "register",
      name: "QA Postgres",
    }),
  )) as { id: string };
  const quota = (await app("nadia", "bernay", (tx) =>
    offlinePerform(tx, "bernay", user, {
      action: "allocate",
      device: device.id,
      menu: "bernay-Plats-0",
      quantity: 2,
    }),
  )) as { id: string };
  const event = {
    id: randomUUID(),
    order: randomUUID(),
    kind: "order",
    items: [{ quota: quota.id, quantity: 1 }],
    // Heure de la base : celle de la machine de test peut retarder sur le conteneur.
    at: (await one<{ now: string }>(db, "SELECT now() AS now")).now,
  };
  for (let i = 0; i < 2; i++) {
    const result = (await app("nadia", "bernay", (tx) =>
      offlinePerform(tx, "bernay", user, {
        action: "sync",
        device: device.id,
        events: [event],
      }),
    )) as { results: { status: string; error?: string }[] };
    assert.equal(result.results[0].status, "applied", JSON.stringify(result));
  }
  assert.equal(
    (await rows(db, "SELECT id FROM orders WHERE id=$1", [event.order])).length,
    1,
  );
  await app("nadia", "bernay", (tx) =>
    offlinePerform(tx, "bernay", user, {
      action: "reconcile",
      device: device.id,
    }),
  );
  await assert.rejects(
    app("nadia", "bernay", (tx) =>
      tx.query("SELECT * FROM app.claim_jobs($1)", ["forbidden"]),
    ),
  );
  // Socle financier : la salle règle sans lire les écritures, la finance les consulte.
  const finance = await app("nadia", "bernay", (tx) =>
    financeState(tx, "bernay", user),
  );
  await app("nadia", "bernay", (tx) =>
    financeAction(tx, "bernay", user, {
      action: "settings",
      vatRegime: "normal",
      cashAccount: finance.settings.cash_account,
      cardAccount: finance.settings.card_account,
      otherAccount: finance.settings.other_account,
      salesAccount: finance.settings.sales_account,
    }),
  );
  const dish = await one<{ id: string; price: number }>(
    db,
    "SELECT m.id,m.price FROM menu_items m WHERE m.restaurant_id='bernay' AND m.enabled AND m.price>0 AND m.archived_at IS NULL AND EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id) AND NOT EXISTS(SELECT 1 FROM recipe_ingredients r WHERE r.menu_id=m.id AND coalesce((SELECT sum(l.quantity-l.reserved) FROM stock_lots l WHERE l.ingredient_id=r.ingredient_id AND l.expires_on>=CURRENT_DATE),0)<r.quantity) ORDER BY m.id LIMIT 1",
  );
  const ten = (finance.rates as { id: string; rate_bp: number }[]).find(
    (r) => r.rate_bp === 1000,
  )!;
  await app("nadia", "bernay", (tx) =>
    financeAction(tx, "bernay", user, {
      action: "productVat",
      menu: dish.id,
      onsite: ten.id,
      takeaway: ten.id,
    }),
  );
  const table = await one<{ id: string }>(
    db,
    "SELECT id FROM dining_tables t WHERE restaurant_id='bernay' AND status='free' AND archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.closed_at IS NULL) ORDER BY number LIMIT 1",
  );
  const sold = await app("nadia", "bernay", (tx) =>
    createOrder(
      tx,
      {
        restaurant: "bernay",
        table: table.id,
        channel: "staff",
        customer: "",
        contact: "",
        key: randomUUID(),
        items: [{ menu: dish.id, quantity: 1, note: "" }],
      },
      user,
    ),
  );
  const line = await one<{ id: string }>(
    db,
    "SELECT id FROM order_items WHERE order_id=$1",
    [sold],
  );
  for (const status of ["preparing", "ready", "served"])
    await app("nadia", "bernay", (tx) =>
      changeItem(tx, "bernay", line.id, status, user),
    );
  const waiter = { id: "sarah", name: "Sarah", role: "WAITER" as const };
  await app("sarah", "bernay", (tx) =>
    pay(tx, "bernay", sold, "card", waiter),
  );
  const posted = await rows<{ debit: number; credit: number }>(
    db,
    "SELECT l.debit,l.credit FROM fin_entry_lines l JOIN fin_entries n ON n.id=l.entry_id JOIN fin_events e ON e.id=n.event_id JOIN payment_declarations p ON 'payment:'||p.id=e.dedupe_key JOIN orders o ON o.session_id=p.session_id WHERE o.id=$1",
    [sold],
  );
  assert.equal(
    posted.reduce((s, l) => s + l.debit, 0),
    dish.price,
  );
  assert.equal(
    posted.reduce((s, l) => s + l.credit, 0),
    dish.price,
  );
  assert.equal(
    (await app("sarah", "bernay", (tx) => rows(tx, "SELECT id FROM fin_entries")))
      .length,
    0,
  );
  assert.ok(
    (await app("nadia", "bernay", (tx) => rows(tx, "SELECT id FROM fin_entries")))
      .length > 0,
  );
  assert.equal(
    (
      await app("nadia", "qa-other-r", (tx) =>
        rows(tx, "SELECT id FROM fin_entries"),
      )
    ).length,
    0,
  );
  // Sans politique de mise à jour, RLS rend les lignes invisibles à l’UPDATE : 0 ligne touchée.
  assert.equal(
    (
      await app("nadia", "bernay", (tx) =>
        tx.query("UPDATE fin_entries SET label='altérée'"),
      )
    ).affectedRows,
    0,
  );
  await assert.rejects(
    db.query("UPDATE fin_entries SET label='altérée'"),
    /ajout seul/,
  );
  await assert.rejects(
    app("nadia", "bernay", (tx) => tx.query("DELETE FROM payment_declarations")),
  );
  const chain = await app("nadia", "bernay", (tx) =>
    one<{ checked: number; broken_at: number | null }>(
      tx,
      "SELECT checked,broken_at FROM app.fin_verify_chain('bernay')",
    ),
  );
  assert.equal(chain.broken_at, null);
  assert.ok(chain.checked >= 1);
  console.log(
    "PostgreSQL réel : migrations, RLS non propriétaire, refus croisés, initialisation, quotas, rejeu et socle financier vérifiés.",
  );
} finally {
  await db.close();
}
