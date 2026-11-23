import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  accountSpaceGuestCopy,
  accountSpaceIds,
  accountTabs,
  followKindsBySpace,
  spaceByTemplate,
  spaceOf,
  type AccountSpaceId,
} from "../src/features/cms/account-space";
import { siteTemplates } from "../src/features/cms/templates";
import { applyMigrations } from "../src/infrastructure/database/migrate";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { AccountGuestHero } from "../src/components/cms-site/account/guest";
import { seed } from "../src/infrastructure/database/seed";

test("chaque modèle déclare un espace client connu", () => {
  for (const template of siteTemplates) {
    const space = spaceByTemplate[template.id];
    assert.ok(space, `${template.id}: aucun espace client`);
    assert.ok(accountSpaceIds.includes(space), `${template.id}: espace inconnu`);
  }
  // Un site sans modèle garde l'espace historique (commerce).
  assert.equal(spaceOf(undefined), "commerce");
  assert.equal(spaceOf("inconnu"), "commerce");
});

test("les espaces non commerciaux suivent un contenu, pas des points", () => {
  const commerce = siteTemplates.filter((t) => spaceOf(t.id) === "commerce");
  const reader = siteTemplates.filter((t) => spaceOf(t.id) === "reader");
  const learner = siteTemplates.filter((t) => spaceOf(t.id) === "learner");
  const services = siteTemplates.filter((t) => spaceOf(t.id) === "services");
  assert.ok(commerce.length > 0 && reader.length > 0);
  assert.ok(learner.length > 0 && services.length > 0);
  assert.equal(followKindsBySpace.commerce.length, 0);
  assert.equal(followKindsBySpace.reader[0].kind, "article");
  assert.equal(followKindsBySpace.learner[0].kind, "course");
  assert.equal(followKindsBySpace.services[0].kind, "service");
});

test("le suivi d'un contenu est isolé par établissement et par client", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/migrations/001_core.sql", "utf8"));
    await db.transaction(async (tx) => {
      await applyMigrations(tx);
    });
    await db.transaction(seed);
    await db.query(
      "INSERT INTO customers(id,restaurant_id,name,contact) VALUES('c1','bernay','Client','a@b.c'),('c2','atelier','Autre','d@e.f') ON CONFLICT DO NOTHING",
    );
    await db.query(
      "INSERT INTO customer_follows(id,restaurant_id,customer_id,kind,ref_id,label,progress) VALUES('f1','bernay','c1','article','art-1','Mon article',40) ON CONFLICT DO NOTHING",
    );
    const mine = await db.query<{ progress: number }>(
      "SELECT kind,ref_id,label,progress FROM customer_follows WHERE customer_id='c1'",
    );
    assert.equal(mine.rows.length, 1);
    assert.equal(Number(mine.rows[0].progress), 40);
    // Le client d'un autre établissement ne voit rien.
    const other = await db.query(
      "SELECT id FROM customer_follows WHERE customer_id='c2'",
    );
    assert.equal(other.rows.length, 0);
    // La progression reste dans 0..100.
    await assert.rejects(() =>
      db.query(
        "INSERT INTO customer_follows(id,restaurant_id,customer_id,kind,ref_id,progress) VALUES('f2','bernay','c1','article','art-2',180)",
      ),
    );
    // Un même contenu ne peut pas être suivi deux fois.
    await assert.rejects(() =>
      db.query(
        "INSERT INTO customer_follows(id,restaurant_id,customer_id,kind,ref_id) VALUES('f3','bernay','c1','article','art-1')",
      ),
    );
  } finally {
    await db.close();
  }
});

test("l'écran d'accueil change selon l'espace choisi", () => {
  // Le même composant produit un écran d'accueil différent selon le modèle.
  const htmlFor = (space: AccountSpaceId) =>
    renderToString(createElement(AccountGuestHero, { space }));
  const commerce = htmlFor("commerce");
  const reader = htmlFor("reader");
  const learner = htmlFor("learner");
  const services = htmlFor("services");
  assert.ok(commerce.includes("Votre fidélité, à votre nom."));
  assert.ok(reader.includes("Vos lectures, au même endroit."));
  assert.ok(learner.includes("Vos formations, votre progression."));
  assert.ok(services.includes("Vos rendez-vous, vos dossiers."));
  // Chaque espace a son propre sur-titre.
  assert.ok(commerce.includes("Espace client privé"));
  assert.ok(reader.includes("Espace lecteur"));
  assert.ok(learner.includes("Espace apprenant"));
  // Aucun écran ne montre les points de fidélité hors commerce.
  assert.ok(!reader.includes("Des points à chaque commande"));
  assert.ok(!learner.includes("Des points à chaque commande"));
  // Aucun écran ne parle de formation hors formation.
  assert.ok(!reader.includes("Votre progression"));
  assert.ok(!commerce.includes("Votre progression"));
});

test("chaque espace client a son propre accueil et ses propres onglets", () => {
  const spaces: AccountSpaceId[] = ["commerce", "reader", "learner", "services"];
  const labels = new Set<string>();
  for (const space of spaces) {
    assert.ok(followKindsBySpace[space] !== undefined, space);
    const tabs = accountTabs[space];
    assert.ok(tabs.length >= 2, space);
    // L'accueil est toujours présent, l'historique aussi.
    assert.ok(tabs.some((t) => t.id === "accueil"), space);
    assert.ok(tabs.some((t) => t.id === "historique"), space);
    // Les points et le parrainage n'existent que dans l'espace commerce.
    const loyalty = tabs.some((t) => t.id === "recompenses" || t.id === "parrainage");
    assert.equal(loyalty, space === "commerce", space);
    // Les autres espaces suivent un contenu.
    assert.equal(
      tabs.some((t) => t.id === "suivis"),
      space !== "commerce",
      space,
    );
    labels.add(tabs.map((t) => t.label).join("|"));
  }
  // Aucun espace ne partage la même navigation.
  assert.equal(labels.size, spaces.length);
  // L'accueil de chaque espace a son propre texte.
  const titles = new Set(
    spaces.map((space) => accountSpaceGuestCopy[space].title),
  );
  assert.equal(titles.size, spaces.length);
});
