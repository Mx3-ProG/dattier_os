import test from "node:test";
import assert from "node:assert/strict";
import { adaptText, adaptTexts, businessTerms } from "../src/core/tenant/vocabulary";
import { chapters } from "../src/features/guide/content";

test("restaurant texts stay untouched", () => {
  const text = "Ouvrez le plan de salle et choisissez une table.";
  assert.equal(adaptText(text, "restaurant"), text);
  assert.equal(adaptText(text, undefined), text);
});

test("texts follow the business vocabulary with agreed articles", () => {
  const cases: [string, string][] = [
    ["Ouvrez le plan de salle et choisissez une table.", "Ouvrez le plan de l’espace et choisissez une station."],
    ["La carte du restaurant se met à jour en cuisine et au bar.", "Le catalogue du salon se met à jour en préparation et au comptoir."],
    ["Une seule table, l’addition de la table.", "Une seule station, la note de la station."],
    ["Quelles tables sont libres ?", "Quelles stations sont libres ?"],
    ["Chaque carte indique l’état.", "Chaque carte indique l’état."],
    ["Toutes les tables occupées.", "Toutes les stations occupées."],
    ["Le premier couvert arrive, ce plat est prêt.", "Le premier client arrive, cet article est prêt."],
  ];
  for (const [input, expected] of cases) assert.equal(adaptText(input, "beauty"), expected);
  assert.equal(adaptText("Votre restaurant et le restaurant", "construction"), "Votre établissement et l’établissement");
});

test("idioms and other meanings are kept", () => {
  for (const text of [
    "Activez les add-ons à la carte.",
    "Payez par carte bancaire.",
    "Le poste interroge le serveur, sauf hors service.",
    "Ouvrez Cuisine IA.",
    "Un tableau de bord.",
  ])
    assert.equal(adaptText(text, "retail"), text);
});

test("tour chapters keep their technical fields", () => {
  const adapted = adaptTexts(chapters, "retail");
  assert.equal(adapted.length, chapters.length);
  for (const [index, chapter] of adapted.entries()) {
    assert.equal(chapter.id, chapters[index].id);
    for (const [i, step] of chapter.steps.entries()) {
      assert.equal(step.target, chapters[index].steps[i].target);
      assert.deepEqual(step.module, chapters[index].steps[i].module);
      assert.equal(step.link?.href, chapters[index].steps[i].link?.href);
    }
  }
  assert.ok(!JSON.stringify(adapted.map((c) => [c.title, c.summary])).match(/\brestaurant\b/i));
});

test("each business family gets its own welcome", () => {
  assert.match(businessTerms("beauty").welcome.title, /salon/);
  assert.match(businessTerms("retail").welcome.title, /commerce/);
  assert.equal(businessTerms("retail").navigation.dining, "Plan de l’espace");
  assert.deepEqual(businessTerms("restaurant").navigation, {});
});
