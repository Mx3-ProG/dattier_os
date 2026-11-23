import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { migrate } from "../src/infrastructure/database/migrate";
import { seed } from "../src/infrastructure/database/seed";
import { commerce } from "../src/features/commerce/service";
import {
  followItem,
  unfollowItem,
} from "../src/features/commerce/account";

const R = "atelier";
let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
  await migrate(db);
  await db.transaction(seed);
  await db.query(
    "INSERT INTO customers(id,restaurant_id,name,contact) VALUES('c-reader','atelier','Camille','camille@example.test') ON CONFLICT DO NOTHING",
  );
});
after(async () => {
  await db.close();
});

test("l'espace client renvoie ce que le client suit", async () => {
  const shop = commerce(R);
  const before = await shop.customerAccountForCustomer(db, "c-reader");
  assert.deepEqual(before.follows, []);

  await followItem(db, R, "c-reader", {
    kind: "article",
    refId: "art-pain",
    label: "Comprendre le pain",
    progress: 40,
  });
  const after = await shop.customerAccountForCustomer(db, "c-reader");
  assert.equal(after.follows.length, 1);
  assert.equal(after.follows[0].kind, "article");
  assert.equal(after.follows[0].ref_id, "art-pain");
  assert.equal(after.follows[0].label, "Comprendre le pain");
  assert.equal(after.follows[0].progress, 40);
});

test("suivre deux fois met à jour la progression au lieu de dupliquer", async () => {
  await followItem(db, R, "c-reader", {
    kind: "article",
    refId: "art-pain",
    label: "Comprendre le pain",
    progress: 100,
  });
  const account = await commerce(R).customerAccountForCustomer(db, "c-reader");
  assert.equal(account.follows.length, 1);
  assert.equal(account.follows[0].progress, 100);
});

test("retirer un contenu le fait disparaître de l'espace client", async () => {
  await unfollowItem(db, "c-reader", "article", "art-pain");
  const account = await commerce(R).customerAccountForCustomer(db, "c-reader");
  assert.deepEqual(account.follows, []);
});

test("un client ne voit que ses propres suivis", async () => {
  await db.query(
    "INSERT INTO customers(id,restaurant_id,name,contact) VALUES('c-autre','bernay','Autre','autre@example.test') ON CONFLICT DO NOTHING",
  );
  await followItem(db, R, "c-reader", {
    kind: "course",
    refId: "form-1",
    label: "Cuisine du monde",
    progress: 10,
  });
  const mine = await commerce(R).customerAccountForCustomer(db, "c-reader");
  const other = await commerce("bernay").customerAccountForCustomer(db, "c-autre");
  assert.equal(mine.follows.length, 1);
  assert.equal(other.follows.length, 0);
  await unfollowItem(db, "c-reader", "course", "form-1");
});
