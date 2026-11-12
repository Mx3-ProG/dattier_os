import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import {
  sitePerform,
  publicSite,
  siteState,
} from "../src/features/site/service";
import { inventoryPerform } from "../src/features/platform/inventory";
import { commerce } from "../src/features/commerce/service";
import { one, rows } from "../src/infrastructure/database/db";
import {
  encryptSecret,
  decryptSecret,
  verifyEnvelope,
} from "../src/features/integrations/security";
import { randomUUID, createHmac } from "node:crypto";
let db: PGlite;
const user = { id: "nadia", name: "Nadia", role: "OWNER" as const };
before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
});
after(async () => {
  await db.close();
});
test("CMS : brouillon privé, publication, conflit de révision et restauration", async () => {
  const document = {
    title: "Mon restaurant",
    description: "Texte public",
    color: "#184d3b",
    pages: [
      { slug: "histoire", title: "Notre histoire", text: "Une histoire." },
    ],
  };
  await db.transaction((tx) =>
    sitePerform(tx, "bernay", user, { action: "save", revision: 0, document }),
  );
  assert.equal((await publicSite(db, "bernay")).document, null);
  await assert.rejects(
    db.transaction((tx) =>
      sitePerform(tx, "bernay", user, {
        action: "save",
        revision: 0,
        document,
      }),
    ),
    /modifié/,
  );
  await db.transaction((tx) =>
    sitePerform(tx, "bernay", user, { action: "publish", revision: 1 }),
  );
  assert.equal(
    (await publicSite(db, "bernay")).document?.title,
    "Mon restaurant",
  );
  assert.equal((await publicSite(db, "atelier")).document, null);
  const state = await siteState(db, "bernay", user);
  assert.equal(state.versions.length, 1);
  await db.transaction((tx) =>
    sitePerform(tx, "bernay", user, {
      action: "save",
      revision: 2,
      document: { ...document, title: "Brouillon suivant" },
    }),
  );
  assert.equal(
    (await publicSite(db, "bernay")).document?.title,
    "Mon restaurant",
  );
});
test("achats multilignes : confirmation, réception partielle, restant et stock", async () => {
  const supplier = (
    await one<{ id: string }>(
      db,
      "SELECT id FROM suppliers WHERE restaurant_id='bernay' LIMIT 1",
    )
  ).id;
  const p = (await db.transaction((tx) =>
    inventoryPerform(tx, "bernay", user, {
      action: "purchase",
      supplier,
      due: "2026-12-01",
      lines: [
        { ingredient: "bernay-semoule", quantity: 100, unit: "g" },
        { ingredient: "bernay-poulet", quantity: 100, unit: "g" },
      ],
    }),
  )) as { id: string };
  await db.transaction((tx) =>
    inventoryPerform(tx, "bernay", user, {
      action: "confirmPurchase",
      id: p.id,
    }),
  );
  const lines = await rows<{ id: string }>(
    db,
    "SELECT id FROM purchase_document_lines WHERE document_id=$1 ORDER BY id",
    [p.id],
  );
  await db.transaction((tx) =>
    inventoryPerform(tx, "bernay", user, {
      action: "receivePurchase",
      line: lines[0].id,
      quantity: 40,
      expires: "2099-01-01",
      location: "Réserve",
    }),
  );
  assert.equal(
    (
      await one<{ status: string }>(
        db,
        "SELECT status FROM purchase_documents WHERE id=$1",
        [p.id],
      )
    ).status,
    "partial",
  );
  await assert.rejects(
    db.transaction((tx) =>
      inventoryPerform(tx, "bernay", user, {
        action: "receivePurchase",
        line: lines[0].id,
        quantity: 61,
        expires: "2099-01-01",
        location: "Réserve",
      }),
    ),
    /incompatible/,
  );
  await db.transaction((tx) =>
    inventoryPerform(tx, "bernay", user, {
      action: "receivePurchase",
      line: lines[0].id,
      quantity: 60,
      expires: "2099-01-01",
      location: "Réserve",
    }),
  );
  await db.transaction((tx) =>
    inventoryPerform(tx, "bernay", user, {
      action: "receivePurchase",
      line: lines[1].id,
      quantity: 100,
      expires: "2099-01-01",
      location: "Réserve",
    }),
  );
  assert.equal(
    (
      await one<{ status: string }>(
        db,
        "SELECT status FROM purchase_documents WHERE id=$1",
        [p.id],
      )
    ).status,
    "received",
  );
});
test("inventaire : validation unique et protections du stock réservé", async () => {
  const lot = "bernay-semoule-lot";
  const stock = await one<{ reserved: number }>(
    db,
    "SELECT reserved::float FROM stock_lots WHERE id=$1",
    [lot],
  );
  const draft = (await db.transaction((tx) =>
    inventoryPerform(tx, "bernay", user, {
      action: "inventory",
      lines: [{ lot, counted: stock.reserved + 1000 }],
    }),
  )) as { id: string };
  await db.transaction((tx) =>
    inventoryPerform(tx, "bernay", user, {
      action: "applyInventory",
      id: draft.id,
    }),
  );
  assert.equal(
    (
      await one<{ quantity: number }>(
        db,
        "SELECT quantity::float FROM stock_lots WHERE id=$1",
        [lot],
      )
    ).quantity,
    stock.reserved + 1000,
  );
  await assert.rejects(
    db.transaction((tx) =>
      inventoryPerform(tx, "bernay", user, {
        action: "applyInventory",
        id: draft.id,
      }),
    ),
    /déjà/,
  );
});
test("boutique : total serveur, options, rejeu et référence entre restaurants", async () => {
  const shop = commerce("bernay");
  await shop.updateSettings(db, user, {
    open: true,
    prepMinutes: 5,
    interval: 5,
    capacity: 20,
    hours: Array.from({ length: 7 }, (_, day) => ({
      day,
      open: "00:00",
      close: "23:59",
    })),
    categories: ["Entrées", "Plats", "Desserts", "Boissons"],
    address: "Test",
    phone: "",
    logo: "",
  });
  const slot = (await shop.slots(db))[0];
  assert.ok(slot);
  const input = {
    key: randomUUID(),
    customer: "Client test",
    email: "test@example.test",
    consumption: "takeaway",
    payment: "counter",
    termsAccepted: true,
    slot,
    items: [{ menu: "bernay-Boissons-0", quantity: 1, choices: [], note: "" }],
    total: 1,
  };
  const o = await db.transaction((tx) => shop.checkout(tx, input));
  assert.equal(
    o.total,
    (
      await one<{ price: number }>(
        db,
        "SELECT price FROM menu_items WHERE id='bernay-Boissons-0'",
      )
    ).price,
  );
  assert.equal(
    (await db.transaction((tx) => shop.checkout(tx, input))).order_id,
    o.order_id,
  );
  await assert.rejects(
    db.transaction((tx) =>
      shop.checkout(tx, { ...input, customer: "Autre panier" }),
    ),
    /autre panier/,
  );
  await assert.rejects(commerce("atelier").receipt(db, o.token));
});
test("connecteurs : chiffrement lié au restaurant et signature horodatée", () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = "ab".repeat(32);
  const c = encryptSecret("a", "stripe", { key: "fixture" });
  assert.deepEqual(decryptSecret("a", "stripe", c), { key: "fixture" });
  assert.throws(() => decryptSecret("b", "stripe", c));
  const now = Date.now(),
    timestamp = String(Math.floor(now / 1000)),
    body = '{"event":"fixture"}',
    signature = createHmac("sha256", "fixture")
      .update(`${timestamp}.${body}`)
      .digest("hex");
  verifyEnvelope("fixture", body, timestamp, signature, now);
  assert.throws(() =>
    verifyEnvelope("fixture", body, timestamp, signature, now + 600000),
  );
  delete process.env.INTEGRATION_ENCRYPTION_KEY;
});
