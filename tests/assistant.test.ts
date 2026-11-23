import { test } from "node:test";
import assert from "node:assert/strict";
import { reflex } from "../src/features/assistant/reflex";
import { searchGuide } from "../src/features/assistant/knowledge";
import {
  creditValueEur,
  llmCredits,
  maximumLlmCredits,
  minimumLlmCredits,
  packs,
  providerCostEur,
} from "../src/domain/assistant/pricing";
import type { AssistantContext } from "../src/features/assistant/types";

const now = "2026-11-07T19:30:00.000Z";
const ctx = (patch: Partial<AssistantContext> = {}): AssistantContext => ({
  restaurant: { id: "bernay", name: "Le Dattier" },
  user: { name: "Nadia Owner", roles: ["OWNER"] },
  plan: 99,
  now,
  modules: ["dining", "orders", "kitchen", "bar", "stocks", "reservations", "finance", "menu"],
  permissions: ["orders", "payments", "kitchen", "bar", "stock", "reservations", "finance", "purchases", "catalog", "customers", "team"],
  menu: [
    { id: "m1", name: "Couscous agneau", category: "Plats", price: 1800, enabled: true, portions: 20, station: "kitchen", description: "" },
    { id: "m2", name: "Couscous poulet", category: "Plats", price: 1600, enabled: true, portions: 20, station: "kitchen", description: "" },
    { id: "m3", name: "Thé au jasmin", category: "Boissons", price: 350, enabled: true, portions: 50, station: "bar", description: "" },
    { id: "m4", name: "Tajine kefta", category: "Plats", price: 1700, enabled: true, portions: 0, station: "kitchen", description: "" },
    { id: "m5", name: "Merguez grillées", category: "Plats", price: 1500, enabled: true, portions: 8, station: "kitchen", description: "" },
  ],
  tables: [
    { id: "t4", number: 4, capacity: 4, status: "free", zone: "Salle" },
    { id: "t2", number: 2, capacity: 2, status: "occupied", zone: "Salle" },
  ],
  orders: [
    {
      id: "o1",
      session: "s1",
      table: 2,
      channel: "staff",
      status: "active",
      customer: "",
      created_at: now,
      items: [
        { id: "i1", name: "Couscous poulet", quantity: 2, price: 1600, status: "served", station: "kitchen" },
        { id: "i2", name: "Thé au jasmin", quantity: 2, price: 350, status: "ready", station: "bar" },
      ],
    },
  ],
  ingredients: [
    { id: "g1", name: "Semoule", unit: "kg", available: 1, threshold: 5 },
    { id: "g2", name: "Agneau", unit: "g", available: 10000, threshold: 3000 },
    { id: "g3", name: "Tomates", unit: "g", available: 500, threshold: 2000 },
  ],
  reservations: [
    { id: "r1", name: "Martin Dubois", guests: 4, starts_at: "2026-11-07T19:00:00.000Z", status: "requested", table_id: null },
  ],
  suppliers: [
    { id: "s1", name: "Primeurs Martin", contact: "06 11 22 33 44", lead_days: 1, ingredients: ["g3"] },
    { id: "s2", name: "Boucherie Atlas", contact: "atlas@exemple.fr", lead_days: 2, ingredients: ["g2"] },
  ],
  purchases: [],
  lots: [
    { id: "l1", ingredient: "Agneau", unit: "g", quantity: 4000, reserved: 0, expires_on: "2026-11-09" },
    { id: "l2", ingredient: "Agneau", unit: "g", quantity: 6000, reserved: 0, expires_on: "2026-11-12" },
  ],
  employees: [
    { id: "p1", name: "Sarah Benali", role: "WAITER" },
    { id: "p2", name: "Karim Haddad", role: "CHEF" },
  ],
  clients: [{ id: "c1", name: "Jean Dupont", contact: "jean@exemple.fr", consent: true, points: 40 }],
  paidToday: 12400,
  paymentsToday: 4,
  sales: [],
  customers: 12,
  balance: 300,
  ...patch,
});

test("Cuisine IA : prend une commande dictée avec quantités en lettres", () => {
  const r = reflex("Crée une commande pour la table 4 de deux couscous agneau et un thé au jasmin", ctx());
  assert.ok(r);
  assert.equal(r.engine, "reflex");
  const [p] = r.proposals;
  assert.equal(p.title, "Commande table 4");
  const order = p.actions[0] as { action: string; data: { table: string; items: { menu: string; quantity: number }[]; key: string } };
  assert.equal(order.action, "order");
  assert.equal(order.data.table, "t4");
  assert.deepEqual(
    order.data.items.map((i) => [i.menu, i.quantity]),
    [["m1", 2], ["m3", 1]],
  );
  assert.ok(order.data.key.length >= 8);
  assert.ok(p.lines.at(-1)!.includes("39,50"));
});

test("Cuisine IA : signale un plat absent de la carte au lieu d’inventer", () => {
  const r = reflex("Commande table 4 un cassoulet", ctx());
  assert.ok(r);
  assert.equal(r.proposals.length, 0);
  assert.match(r.reply, /cassoulet/);
});

test("Cuisine IA : avertit d’une rupture dans la commande", () => {
  const r = reflex("table 4 : 1 tajine kefta", ctx());
  assert.match(r!.proposals[0].warning ?? "", /rupture/);
});

test("Cuisine IA : encaissement marque d’abord servis les produits prêts", () => {
  const r = reflex("Encaisse la table 2 en espèces", ctx());
  const actions = r!.proposals[0].actions;
  assert.deepEqual(actions[0], { action: "item", id: "i2", status: "served" });
  assert.deepEqual(actions.at(-1), { action: "pay", id: "o1", method: "cash" });
});

test("Cuisine IA : refuse l’encaissement si la cuisine n’a pas fini", () => {
  const busy = ctx();
  busy.orders[0].items[0].status = "preparing";
  const r = reflex("addition table 2", busy);
  assert.equal(r!.proposals.length, 0);
  assert.match(r!.reply, /pas encore/);
});

test("Cuisine IA : respecte les permissions du profil", () => {
  const r = reflex("Encaisse la table 2", ctx({ permissions: ["kitchen"] }));
  assert.equal(r!.proposals.length, 0);
  assert.match(r!.reply, /profil/);
});

test("Cuisine IA : informations du service", () => {
  assert.match(reflex("Qu’est-ce qui manque en stock ?", ctx())!.reply, /Semoule/);
  assert.match(reflex("Chiffre du jour", ctx())!.reply, /124,00/);
  assert.match(reflex("commandes en cours", ctx())!.reply, /Table 2/);
  assert.equal(reflex("ouvre la cuisine", ctx())!.navigate, "kitchen");
  assert.equal(reflex("mes crédits", ctx())!.engine, "free");
});

test("Cuisine IA : répond au mode d’emploi depuis le guide", () => {
  const answer = searchGuide("Comment déclarer un règlement ?");
  assert.ok(answer);
  assert.ok(answer.links.some((l) => l.href.startsWith("/guide#")));
});

test("Cuisine IA : passe la main à l’IA avancée quand il ne comprend pas", () => {
  assert.equal(reflex("Rédige un post Instagram pour notre soirée orientale de samedi", ctx()), null);
});

test("Crédits : l’IA générative rapporte au moins 5 € par euro de coût", () => {
  const usage = { input_tokens: 2500, output_tokens: 900, cache_read_input_tokens: 9000 };
  const cost = providerCostEur("claude-opus-5-5", [usage]);
  const credits = llmCredits(cost);
  assert.ok(credits >= minimumLlmCredits && credits <= maximumLlmCredits);
  const cheapest = Math.min(...packs.map((p) => p.priceCents / 100 / p.credits));
  // Chaque crédit vendu, même au pack le plus remisé, couvre plus de 5× son coût.
  if (credits < maximumLlmCredits) assert.ok((credits * cheapest) / cost >= 5);
  assert.equal(creditValueEur, 0.02);
  assert.equal(llmCredits(0), minimumLlmCredits);
  assert.equal(llmCredits(100), maximumLlmCredits);
});

test("Cuisine IA : une question « comment » donne des étapes, pas une définition", () => {
  const answer = searchGuide("Comment déclarer un règlement ?");
  assert.ok(answer);
  assert.ok(answer.links.some((l) => l.href.startsWith("/dashboard?tour=")));
});

test("Gestion : « aide-moi à gérer les stocks et à acheter des fraises » donne réassort + question", () => {
  const r = reflex("Aide-moi à gérer les stocks et à acheter des fraises", ctx());
  assert.ok(r);
  const restock = r.proposals.find((p) => p.title.startsWith("Réassort"));
  assert.ok(restock, "réassort proposé");
  assert.ok(restock.actions.some((a) => a.ingredient === "g3" && a.supplier === "s1"));
  assert.match(r.reply, /quantité de fraises/i);
  assert.ok(r.followUp?.includes("fraises"));
});

test("Gestion : la réponse à la question complète la commande en attente", () => {
  const first = reflex("achète des fraises", ctx())!;
  const second = reflex(`${first.followUp} 3 kilos`, ctx())!;
  const [p] = second.proposals;
  assert.ok(p, second.reply);
  // Fraises inconnues : l’ingrédient est créé, puis Primeurs Martin (spécialité) est retenu.
  assert.equal(p.actions[0].action, "ingredient");
  assert.equal(p.actions[0].unit, "g");
  const purchase = p.actions.at(-1)!;
  assert.deepEqual([purchase.action, purchase.ingredient, purchase.supplier, purchase.quantity], ["purchase", "$0", "s1", 3000]);
});

test("Gestion : fournisseur nouveau créé dans la même carte que la commande", () => {
  const r = reflex("Commande 2 kg de tomates chez Ferme du Soleil, contact 06 12 34 56 78, pour demain", ctx())!;
  const [p] = r.proposals;
  assert.equal(p.actions[0].action, "supplier");
  assert.equal(p.actions[0].name, "Ferme du Soleil");
  assert.equal(p.actions[0].contact, "06 12 34 56 78");
  assert.deepEqual(p.actions[0].ingredients, ["g3"]);
  assert.deepEqual([p.actions[1].supplier, p.actions[1].ingredient, p.actions[1].due], ["$0", "g3", "2026-11-08"]);
});

test("Gestion : sans fournisseur connu, Cuisine IA demande chez qui commander", () => {
  const r = reflex("Achète 5 kg de farine", ctx())!;
  assert.equal(r.proposals.length, 0);
  assert.match(r.reply, /Chez qui/);
  assert.equal(r.followUp, "Commande 5 kg de farine chez");
  assert.ok(r.suggestions.some((x) => x.includes("Primeurs Martin")));
  const next = reflex(`${r.followUp} Boucherie Atlas`, ctx())!;
  assert.equal(next.proposals[0].actions.at(-1)!.supplier, "s2");
});

test("Gestion : créer un fournisseur avec ce qu’il vend, et qui vend quoi", () => {
  const r = reflex("Ajoute le fournisseur Verger Bio qui vend des fraises et des tomates", ctx())!;
  const actions = r.proposals[0].actions;
  assert.equal(actions[0].action, "ingredient");
  assert.deepEqual(actions.at(-1)!.ingredients, ["$0", "g3"]);
  assert.match(reflex("Qui vend des tomates ?", ctx())!.reply, /Primeurs Martin/);
  const link = reflex("Boucherie Atlas vend aussi des tomates", ctx())!;
  assert.deepEqual(link.proposals[0].actions[0], { action: "supplierIngredient", supplier: "s2", ingredient: "g3", linked: true });
});

test("Gestion : réception, perte, carte, clients, équipe", () => {
  const withDelivery = ctx({
    purchases: [{ id: "po1", supplier: "Primeurs Martin", ingredient_id: "g3", ingredient: "Tomates", unit: "g", quantity: 3000, received: 0, due_on: "2026-11-08", status: "confirmed" }],
  });
  const received = reflex("On a reçu les tomates, DLC le 12", withDelivery)!;
  assert.deepEqual(received.proposals[0].actions[0], { action: "receive", id: "po1", quantity: 3000, expires: "2026-11-12" });

  const waste = reflex("Perte de 5 kg d’agneau car abîmé", ctx())!;
  assert.deepEqual(waste.proposals[0].actions.map((a) => [a.id, a.quantity]), [["l1", 4000], ["l2", 1000]]);

  const price = reflex("Passe le couscous agneau à 19 euros 50", ctx())!;
  assert.equal(price.proposals[0].actions[0].price, 1950);
  assert.equal(reflex("Désactive le tajine kefta", ctx())!.proposals[0].actions[0].enabled, false);

  const product = reflex("Ajoute le plat Cassoulet à 18 euros", ctx())!;
  assert.match(product.reply, /ingrédients/);
  const full = reflex(`${product.followUp} 300 g de haricots et 150 g d’agneau`, ctx())!;
  const create = full.proposals[0].actions.at(-1)!;
  assert.equal(create.action, "createProduct");
  assert.equal(create.price, 1800);
  assert.deepEqual(create.ingredients, [{ id: "$0", quantity: 300 }, { id: "g2", quantity: 150 }]);

  assert.match(reflex("Ajoute le client Paul Martin", ctx())!.reply, /email ou le téléphone/);
  assert.equal(reflex("Ajoute 50 points à Jean Dupont", ctx())!.proposals[0].actions[0].points, 50);
  assert.equal(reflex("Ajoute une dépense de 45 euros pour le gaz", ctx())!.proposals[0].actions[0].amount, 4500);
  const shift = reflex("Planifie Sarah demain de 18h à 23h30", ctx())!.proposals[0].actions[0];
  assert.equal(shift.profile, "p1");
  assert.equal(shift.start, "2026-11-08T17:00:00.000Z");
  assert.equal(shift.end, "2026-11-08T22:30:00.000Z");
  assert.equal(reflex("Confirme la réservation de Martin Dubois", ctx())!.proposals[0].actions[0].status, "confirmed");
  assert.equal(reflex("Relance Jean Dupont par SMS", ctx())!.proposals[0].actions[0].channel, "sms");
});

test("Gestion : une commande en salle reste une commande en salle", () => {
  const r = reflex("Commande table 4 deux couscous agneau", ctx())!;
  assert.equal(r.proposals[0].actions[0].action, "order");
});
