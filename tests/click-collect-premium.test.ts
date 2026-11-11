import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/lib/database/migrate";
import { seed } from "../src/lib/database/seed";
import type { DB } from "../src/lib/database/db";
import { addonCatalog, addonPriceCents, monthlyAddonIds } from "../src/features/addons/catalog";
import { boardStage, effectiveFlow } from "../src/features/commerce/premium";
import { commerce } from "../src/features/commerce/service";
import { groupSlots, linePrice } from "../src/components/cms-site/kiosk-order";

const owner = { id: "nadia", name: "Nadia", role: "OWNER" as const };

test("Click & Collect Premium : 9 € par mois, la boutique reste comprise dans Studio", () => {
  assert.equal(addonPriceCents("click-collect-premium"), 900);
  assert.ok((monthlyAddonIds as readonly string[]).includes("click-collect-premium"));
  assert.equal(addonCatalog.find((addon) => addon.id === "click-collect-premium")?.includedFrom, null);
  assert.equal(addonCatalog.find((addon) => addon.id === "online-orders")?.includedFrom, 39);
});

test("pause et rush ne s'appliquent qu'avec le Premium actif", () => {
  const now = Date.parse("2026-11-11T12:00:00.000Z");
  const settings = { prepMinutes: 20, pausedUntil: "2026-11-11T12:30:00.000Z", rushMinutes: 15 };
  assert.deepEqual(effectiveFlow(settings, true, now), {
    paused: true, pausedUntil: "2026-11-11T12:30:00.000Z", rushMinutes: 15, prepMinutes: 35,
  });
  assert.deepEqual(effectiveFlow(settings, false, now), {
    paused: false, pausedUntil: null, rushMinutes: 0, prepMinutes: 20,
  });
  // Pause expirée : les commandes reprennent seules.
  assert.equal(effectiveFlow(settings, true, Date.parse("2026-11-11T12:31:00.000Z")).paused, false);
});

test("l'écran de retrait ne montre que les commandes en cours ou prêtes", () => {
  assert.equal(boardStage(["waiting", "preparing"], "active"), "preparing");
  assert.equal(boardStage(["ready", "cancelled"], "active"), "ready");
  assert.equal(boardStage(["ready", "served"], "active"), "ready");
  assert.equal(boardStage(["served"], "active"), null);
  assert.equal(boardStage(["waiting"], "pending"), null, "paiement en ligne non confirmé");
  assert.equal(boardStage(["ready"], "cancelled"), null);
});

test("borne : prix des options et créneaux regroupés par jour", () => {
  const product = {
    price: 800,
    options: [{ id: "taille", label: "Taille", required: true, multiple: false, choices: [{ id: "xl", label: "XL", price: 150 }] }],
  } as unknown as Parameters<typeof linePrice>[0];
  assert.equal(linePrice(product, ["taille:xl"]), 950);
  assert.equal(linePrice(product, []), 800);
  const days = groupSlots(["2026-11-11T11:00:00.000Z", "2026-11-11T11:15:00.000Z", "2026-11-12T11:00:00.000Z"]);
  assert.deepEqual(days.map((day) => day.slots.length), [2, 1]);
});

test("droit, pause, rush et écran de retrait côté serveur", async () => {
  const pg = new PGlite();
  const db = pg as unknown as DB;
  try {
    await pg.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await migrate(pg);
    await pg.transaction(seed);
    const installed = async () =>
      (await pg.query<{ ok: boolean }>("SELECT app.addon_installed('bernay','click-collect-premium') AS ok")).rows[0].ok;
    const shop = commerce("bernay");
    await shop.updateSettings(db, owner, {
      open: true, prepMinutes: 5, interval: 5, capacity: 20,
      hours: Array.from({ length: 7 }, (_, day) => ({ day, open: "00:00", close: "23:59" })),
      categories: ["Entrées", "Plats", "Desserts", "Boissons"],
      address: "Test", phone: "", logo: "",
    });

    // Sans abonnement : aucun droit, aucune action Premium.
    assert.equal(await installed(), false);
    await assert.rejects(shop.updateFlow(db, owner, { kind: "pause", minutes: 30 }), /Premium/);
    await assert.rejects(shop.pickupBoard(db, owner), /Premium/);
    assert.equal((await shop.catalog(db)).premium, false);

    await pg.query("INSERT INTO addon_subscriptions(id,restaurant_id,addon,stripe_session) VALUES('test-cc','bernay','click-collect-premium','cs_test_cc')");
    await pg.query("SELECT app.addon_reconcile('test-cc','cs_test_cc','sub_test_cc','active',now()+interval '1 month')");
    assert.equal(await installed(), true);
    assert.equal((await shop.catalog(db)).premium, true);

    // Rush : le premier créneau recule ; un réglage boutique ne l'efface pas.
    const before = Date.parse((await shop.slots(db))[0]);
    await shop.updateFlow(db, owner, { kind: "rush", minutes: 30 });
    assert.ok(Date.parse((await shop.slots(db))[0]) >= before + 25 * 60_000);
    await shop.updateSettings(db, owner, { ...(await shop.settings(db)), rushMinutes: 0, address: "Autre" });
    assert.equal((await shop.settings(db)).rushMinutes, 30);
    await assert.rejects(shop.updateFlow(db, owner, { kind: "rush", minutes: 7 }));

    // Pause : plus aucun créneau, la commande est refusée, puis reprise.
    await shop.updateFlow(db, owner, { kind: "pause", minutes: 15 });
    assert.deepEqual(await shop.slots(db), []);
    assert.equal((await shop.flow(db)).paused, true);
    const order = (slot: string) => ({
      key: randomUUID(), customer: "Client test", email: "test@example.test", consumption: "onsite",
      payment: "counter", termsAccepted: true, slot,
      items: [{ menu: "bernay-Boissons-0", quantity: 1, choices: [], note: "" }],
    });
    await assert.rejects(pg.transaction((tx) => shop.checkout(tx as unknown as DB, order(new Date(before + 3600_000).toISOString()))), /créneau/);
    await shop.updateFlow(db, owner, { kind: "pause", minutes: 0 });
    const slot = (await shop.slots(db))[0];
    assert.ok(slot);

    // Écran de retrait : le numéro apparaît en préparation, sans nom de client.
    const placed = await pg.transaction((tx) => shop.checkout(tx as unknown as DB, order(slot)));
    const board = await shop.pickupBoard(db, owner);
    const entry = board.board.find((item) => item.number === placed.number);
    assert.deepEqual(entry, { number: placed.number, stage: "preparing", consumption: "onsite" });
    assert.equal(JSON.stringify(board).includes("Client test"), false);

    // Abonnement désinstallé : la pause enregistrée n'a plus d'effet.
    await shop.updateFlow(db, owner, { kind: "pause", minutes: 60 });
    await pg.query("INSERT INTO addon_installations(restaurant_id,addon_id,installed) VALUES('bernay','click-collect-premium',false)");
    assert.equal((await shop.flow(db)).paused, false);
    assert.ok((await shop.slots(db)).length > 0);
  } finally {
    await pg.close();
  }
});

test("création de la base en une transaction : les triggers restent actifs après la migration 130", async () => {
  const { applyMigrations } = await import("../src/lib/database/migrate");
  const pg = new PGlite();
  try {
    await pg.transaction(async (tx) => {
      await tx.exec(await readFile("database/migrations/001_core.sql", "utf8"));
      await applyMigrations(tx as unknown as DB);
      await seed(tx as unknown as DB);
    });
    const settings = await pg.query<{ restaurant_id: string }>("SELECT restaurant_id FROM shop_settings ORDER BY restaurant_id");
    assert.deepEqual(settings.rows.map((row) => row.restaurant_id), ["atelier", "bernay"]);
  } finally {
    await pg.close();
  }
});
