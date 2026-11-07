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
} from "../src/features/assistant/pricing";
import type { AssistantContext } from "../src/features/assistant/types";

const now = "2026-11-07T19:30:00.000Z";
const ctx = (patch: Partial<AssistantContext> = {}): AssistantContext => ({
  restaurant: { id: "bernay", name: "Le Dattier" },
  user: { name: "Nadia Owner", roles: ["OWNER"] },
  plan: 99,
  now,
  modules: ["dining", "orders", "kitchen", "bar", "stocks", "reservations", "finance", "menu"],
  permissions: ["orders", "payments", "kitchen", "bar", "stock", "reservations", "finance"],
  menu: [
    { id: "m1", name: "Couscous agneau", category: "Plats", price: 1800, enabled: true, portions: 20, station: "kitchen" },
    { id: "m2", name: "Couscous poulet", category: "Plats", price: 1600, enabled: true, portions: 20, station: "kitchen" },
    { id: "m3", name: "Thé au jasmin", category: "Boissons", price: 350, enabled: true, portions: 50, station: "bar" },
    { id: "m4", name: "Tajine kefta", category: "Plats", price: 1700, enabled: true, portions: 0, station: "kitchen" },
    { id: "m5", name: "Merguez grillées", category: "Plats", price: 1500, enabled: true, portions: 8, station: "kitchen" },
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
    { id: "g2", name: "Agneau", unit: "kg", available: 10, threshold: 3 },
  ],
  reservations: [],
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
