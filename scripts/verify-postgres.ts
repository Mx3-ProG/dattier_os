import assert from "node:assert/strict";
import { PostgresDatabase } from "../src/lib/database/postgres";
import { withDatabaseContext } from "../src/lib/database/context";
import { seed } from "../src/lib/database/seed";
import { one, rows, type DB } from "../src/lib/database/db";
import { platformPerform } from "../src/features/platform/service";
import { offlinePerform } from "../src/features/offline/service";
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
    at: new Date().toISOString(),
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
  console.log(
    "PostgreSQL réel : migrations, RLS non propriétaire, refus croisés, initialisation, quotas et rejeu vérifiés.",
  );
} finally {
  await db.close();
}
