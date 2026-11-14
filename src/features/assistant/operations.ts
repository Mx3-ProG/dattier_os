/* Opérations de gestion de STUDIO VOICE : achats et fournisseurs, réassort,
   réceptions, pertes, carte et recettes, clients et fidélité, équipe,
   promotions flash, messages clients.

   Règle commune : si tout existe déjà, la carte d’action est prête ; s’il
   manque un élément créable (ingrédient, fournisseur), il est ajouté à la même
   carte, avant l’action qui en dépend (valeur « $N ») ; s’il manque une
   information que seul l’utilisateur connaît, STUDIO VOICE pose la question et
   garde la phrase en attente (followUp) pour la compléter avec la réponse. */
import { randomUUID } from "node:crypto";
import {
  addDays,
  frenchDay,
  parisDateTime,
  parisParts,
  type BaseUnit,
} from "./parse";
import { euros, similarity, words } from "@/domain/shared/text";
import type { ActionPayload, AssistantContext, Proposal } from "./types";

export type Step = {
  reply: string;
  proposal?: Proposal;
  ask?: { followUp: string; options: string[] };
};

const can = (ctx: AssistantContext, permission: string) =>
  ctx.permissions.includes(permission);
const today = (ctx: AssistantContext) => {
  const p = parisParts(ctx.now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

function best<T>(items: T[], label: (t: T) => string, query: string, min = 0.5) {
  const q = words(query);
  if (!q.length) return undefined;
  const ranked = items
    .map((item) => ({ item, score: similarity(q, label(item)) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0] && ranked[0].score > min ? ranked[0].item : undefined;
}

export const findIngredient = (ctx: AssistantContext, name: string) =>
  best(ctx.ingredients, (i) => i.name, name);
export const findSupplier = (ctx: AssistantContext, name: string) =>
  best(ctx.suppliers, (s) => s.name, name, 0.45);
export const findMenu = (ctx: AssistantContext, name: string) =>
  best(ctx.menu, (m) => m.name, name);
export const findEmployee = (ctx: AssistantContext, name: string) =>
  best(ctx.employees, (e) => e.name, name, 0.3);
export const findClient = (ctx: AssistantContext, name: string) =>
  best(ctx.clients, (c) => c.name, name, 0.3);

const fresh = /\b(fraise|framboise|tomate|salade|pomme|poire|orange|citron|banane|carotte|oignon|ail|courgette|aubergine|poivron|herbe|menthe|persil|coriandre|fruit|legume|champignon|pomme de terre|patate|melon|peche|abricot|raisin|cerise|myrtille|epinard|chou|concombre|radis|poireau|navet|betterave|avocat|mangue|ananas|kiwi)/;
const liquid = /\b(lait|creme|huile|vin|biere|jus|sirop|vinaigre|eau|sauce|bouillon|alcool|rhum|vodka|whisky|cafe liquide)/;

/** Unité de stock la plus probable pour un nouvel ingrédient. */
export function guessUnit(name: string, spoken: BaseUnit | null): BaseUnit {
  if (spoken) return spoken;
  const n = words(name).join(" ");
  if (liquid.test(n)) return "ml";
  if (/\b(oeuf|citron vert|bouteille|canette|pain|baguette)/.test(n)) return "unit";
  return "g";
}

const unitLabel = (quantity: number, unit: string) =>
  unit === "g"
    ? quantity >= 1000
      ? `${Math.round((quantity / 1000) * 100) / 100} kg`
      : `${Math.round(quantity)} g`
    : unit === "ml"
      ? quantity >= 1000
        ? `${Math.round((quantity / 1000) * 100) / 100} L`
        : `${Math.round(quantity)} ml`
      : `${Math.round(quantity * 100) / 100} pièce(s)`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Qui fournit cet ingrédient ? Catalogue, puis historique, puis spécialité. */
export function supplierFor(ctx: AssistantContext, ingredientId: string | null, name: string) {
  if (ingredientId) {
    const catalog = ctx.suppliers.filter((s) => s.ingredients.includes(ingredientId));
    if (catalog.length) return { suppliers: catalog, reason: "catalogue" as const };
    const history = ctx.purchases.find((p) => p.ingredient_id === ingredientId);
    const known = history && ctx.suppliers.find((s) => s.name === history.supplier);
    if (known) return { suppliers: [known], reason: "historique" as const };
  }
  if (fresh.test(words(name).join(" "))) {
    const greengrocer = ctx.suppliers.filter((s) =>
      /primeur|fruit|legume|maraich|marche|verger|potager|bio/.test(words(s.name).join(" ")),
    );
    if (greengrocer.length) return { suppliers: greengrocer, reason: "spécialité" as const };
  }
  return { suppliers: [], reason: null };
}

type Purchase = {
  item: string;
  quantity: number | null;
  unit: BaseUnit | null;
  supplier?: string;
  contact?: string;
  due?: string | null;
};

/** Achat d’un produit, avec création de l’ingrédient ou du fournisseur au besoin. */
export function purchaseStep(ctx: AssistantContext, p: Purchase): Step {
  if (!can(ctx, "purchases"))
    return { reply: "Votre profil ne permet pas de passer des commandes fournisseurs." };
  const item = p.item.trim();
  if (!item)
    return {
      reply: "Que voulez-vous commander, et en quelle quantité ?",
      ask: { followUp: "Commande fournisseur :", options: [] },
    };
  const ingredient = findIngredient(ctx, item);
  const name = ingredient?.name ?? capitalize(item);
  const unit = ingredient?.unit as BaseUnit | undefined ?? guessUnit(item, p.unit);
  if (!p.quantity) {
    const suggestion = ingredient ? Math.max(ingredient.threshold * 2 - ingredient.available, ingredient.threshold) : 0;
    return {
      reply: `Quelle quantité de ${name.toLowerCase()} voulez-vous commander ?${ingredient ? ` Il en reste ${unitLabel(Math.max(0, ingredient.available), ingredient.unit)} (seuil ${unitLabel(ingredient.threshold, ingredient.unit)}).` : ""}`,
      ask: {
        followUp: `Commande de ${item}${p.supplier ? ` chez ${p.supplier}` : ""} :`,
        options: suggestion > 0
          ? [`Commande ${unitLabel(suggestion, unit)} de ${item}${p.supplier ? ` chez ${p.supplier}` : ""}`]
          : [],
      },
    };
  }
  if (ingredient && p.unit && p.unit !== ingredient.unit)
    return {
      reply: `${ingredient.name} se gère en ${ingredient.unit === "g" ? "grammes ou kilos" : ingredient.unit === "ml" ? "millilitres ou litres" : "pièces"}. Pouvez-vous redire la quantité dans cette unité ?`,
      ask: { followUp: `Commande de ${item}${p.supplier ? ` chez ${p.supplier}` : ""} :`, options: [] },
    };

  // Fournisseur
  let supplier = p.supplier ? findSupplier(ctx, p.supplier) : undefined;
  let deduced = "";
  if (!p.supplier) {
    const found = supplierFor(ctx, ingredient?.id ?? null, item);
    if (found.suppliers.length === 1) {
      supplier = found.suppliers[0];
      deduced =
        found.reason === "catalogue"
          ? `${supplier.name} vend déjà ce produit.`
          : found.reason === "historique"
            ? `Dernière commande passée chez ${supplier.name}.`
            : `${supplier.name} semble être votre primeur : à vérifier.`;
    } else {
      const choices = found.suppliers.length ? found.suppliers : ctx.suppliers;
      const amount = unitLabel(p.quantity, unit);
      return {
        reply: found.suppliers.length
          ? `${found.suppliers.length} fournisseurs vendent ${name.toLowerCase()} : ${found.suppliers.map((s) => s.name).join(", ")}. Lequel choisissez-vous ?`
          : `Aucun de vos fournisseurs n’est encore associé à ${name.toLowerCase()}. Chez qui voulez-vous commander ? Dites le nom d’un fournisseur existant, ou un nouveau nom pour le créer.`,
        ask: {
          followUp: `Commande ${amount} de ${item} chez`,
          options: [
            ...choices.slice(0, 4).map((s) => `Commande ${amount} de ${item} chez ${s.name}`),
          ],
        },
      };
    }
  }
  const actions: ActionPayload[] = [];
  const lines: string[] = [];
  const warnings: string[] = [];
  let ingredientRef: string;
  if (ingredient) ingredientRef = ingredient.id;
  else {
    actions.push({ action: "ingredient", name, unit, threshold: 0, cost: 0 });
    ingredientRef = `$${actions.length - 1}`;
    lines.push(`Nouvel ingrédient : ${name} (en ${unit === "g" ? "grammes" : unit === "ml" ? "millilitres" : "pièces"})`);
    warnings.push("Pensez à fixer son seuil d’alerte et son coût dans les stocks.");
  }
  let supplierRef: string;
  if (supplier) {
    supplierRef = supplier.id;
    if (ingredient && !supplier.ingredients.includes(ingredient.id))
      lines.push(`${supplier.name} sera associé à ${name.toLowerCase()}.`);
  } else {
    const supplierName = capitalize(p.supplier!.trim());
    actions.push({
      action: "supplier",
      name: supplierName.slice(0, 300),
      contact: (p.contact || "À compléter").slice(0, 300),
      ingredients: ingredient ? [ingredient.id] : [],
    });
    supplierRef = `$${actions.length - 1}`;
    lines.push(`Nouveau fournisseur : ${supplierName}${p.contact ? ` · ${p.contact}` : ""}`);
    if (!p.contact) warnings.push("Contact du fournisseur à compléter.");
  }
  const lead = supplier?.lead_days ?? 2;
  const due = p.due && p.due >= today(ctx) ? p.due : addDays(today(ctx), Math.max(1, lead));
  actions.push({
    action: "purchase",
    supplier: supplierRef,
    ingredient: ingredientRef,
    quantity: Math.round(p.quantity * 1000) / 1000,
    due,
  });
  const supplierName = supplier?.name ?? capitalize(p.supplier!.trim());
  lines.push(
    `${unitLabel(p.quantity, unit)} de ${name.toLowerCase()} chez ${supplierName}`,
    `Livraison attendue : ${frenchDay(due)}`,
  );
  if (deduced) warnings.unshift(deduced);
  return {
    reply: `Commande fournisseur prête : ${unitLabel(p.quantity, unit)} de ${name.toLowerCase()} chez ${supplierName}, pour ${frenchDay(due)}.`,
    proposal: {
      id: randomUUID(),
      title: `Commande fournisseur · ${name}`,
      lines,
      warning: warnings.join(" ") || undefined,
      confirmLabel: actions.length > 1 ? "Tout créer et commander" : "Passer la commande",
      actions,
      next: [`On a reçu ${name.toLowerCase()}`, "Stocks bas", "Aide-moi à gérer les stocks"],
      open: "deliveries",
    },
  };
}

/** Réassort : une commande par ingrédient sous le seuil, chez son fournisseur. */
export function restockStep(ctx: AssistantContext): Step {
  if (!can(ctx, "purchases") && !can(ctx, "stock"))
    return { reply: "Votre profil n’a pas accès aux stocks ni aux achats." };
  const low = ctx.ingredients.filter((i) => i.available <= i.threshold && i.threshold > 0);
  if (!low.length)
    return { reply: "Tous les ingrédients sont au-dessus de leur seuil : aucun réassort nécessaire aujourd’hui." };
  const pending = new Set(ctx.purchases.map((p) => p.ingredient_id));
  const actions: ActionPayload[] = [];
  const lines: string[] = [];
  const orphans: string[] = [];
  const covered: string[] = [];
  for (const i of low) {
    if (pending.has(i.id)) {
      covered.push(i.name);
      continue;
    }
    const quantity = Math.max(i.threshold * 2 - Math.max(0, i.available), i.threshold);
    const { suppliers } = supplierFor(ctx, i.id, i.name);
    if (suppliers.length !== 1) {
      orphans.push(i.name);
      continue;
    }
    const s = suppliers[0];
    actions.push({
      action: "purchase",
      supplier: s.id,
      ingredient: i.id,
      quantity: Math.round(quantity * 1000) / 1000,
      due: addDays(today(ctx), Math.max(1, s.lead_days)),
    });
    lines.push(`${i.name} : ${unitLabel(quantity, i.unit)} chez ${s.name}`);
  }
  const notes = [
    covered.length ? `Déjà en commande : ${covered.join(", ")}.` : "",
    orphans.length ? `Sans fournisseur attitré : ${orphans.join(", ")}. Dites « commande … chez … » pour chacun.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (!actions.length)
    return {
      reply: `${low.length} ingrédient(s) sous le seuil. ${notes}`,
      ask: orphans.length
        ? { followUp: `Commande de ${orphans[0].toLowerCase()} :`, options: orphans.slice(0, 3).map((o) => `Commande de ${o.toLowerCase()}`) }
        : undefined,
    };
  return {
    reply: `Voici le réassort que je propose : ${actions.length} commande(s) pour remonter les stocks au double du seuil.`,
    proposal: {
      id: randomUUID(),
      title: `Réassort · ${actions.length} commande(s)`,
      lines,
      warning: notes || undefined,
      confirmLabel: "Passer les commandes",
      actions,
      next: ["Livraisons attendues", "Stocks bas"],
      open: "deliveries",
    },
  };
}

/** Réception d’une livraison attendue. */
export function receiveStep(ctx: AssistantContext, item: string, expires: string | null): Step {
  if (!can(ctx, "purchases"))
    return { reply: "Votre profil ne permet pas de réceptionner les livraisons." };
  const open = ctx.purchases.filter((p) => p.quantity > p.received);
  const ingredient = item ? findIngredient(ctx, item) : undefined;
  const matching = ingredient ? open.filter((p) => p.ingredient_id === ingredient.id) : open;
  if (!matching.length)
    return {
      reply: ingredient
        ? `Aucune livraison de ${ingredient.name.toLowerCase()} n’est attendue. Voulez-vous la commander ?`
        : "Aucune livraison n’est attendue pour l’instant.",
      ask: ingredient ? { followUp: `Commande de ${ingredient.name.toLowerCase()} :`, options: [] } : undefined,
    };
  if (matching.length > 1 && !ingredient)
    return {
      reply: `${matching.length} livraisons attendues. Laquelle avez-vous reçue ?`,
      ask: {
        followUp: "On a reçu",
        options: matching.slice(0, 4).map((p) => `On a reçu ${p.ingredient.toLowerCase()}`),
      },
    };
  const dlc = expires && expires >= today(ctx) ? expires : addDays(today(ctx), 3);
  const actions = matching.map((p) => ({
    action: "receive",
    id: p.id,
    quantity: Math.round((p.quantity - p.received) * 1000) / 1000,
    expires: dlc,
  }));
  return {
    reply: `Réception prête. Je mets les lots en stock avec une date limite au ${frenchDay(dlc)}.`,
    proposal: {
      id: randomUUID(),
      title: `Réception · ${matching[0].ingredient}`,
      lines: matching.map(
        (p) => `${unitLabel(p.quantity - p.received, p.unit)} de ${p.ingredient.toLowerCase()} · ${p.supplier}`,
      ),
      warning: expires ? undefined : "Date limite fixée à J+3 par défaut : dites « DLC le 15 » pour la changer.",
      confirmLabel: "Réceptionner",
      actions,
      next: ["Stocks bas", "Livraisons attendues"],
      open: "deliveries",
    },
  };
}

/** Perte : retire la quantité des lots, du plus ancien au plus récent. */
export function wasteStep(ctx: AssistantContext, item: string, quantity: number | null, unit: BaseUnit | null, reason: string): Step {
  if (!can(ctx, "stock")) return { reply: "Votre profil ne permet pas de déclarer une perte." };
  const ingredient = findIngredient(ctx, item);
  if (!ingredient) return { reply: `Je ne trouve pas l’ingrédient « ${item} » dans vos stocks.` };
  if (!quantity)
    return {
      reply: `Quelle quantité de ${ingredient.name.toLowerCase()} est perdue ?`,
      ask: { followUp: `Perte de ${ingredient.name.toLowerCase()} :`, options: [] },
    };
  if (unit && unit !== ingredient.unit)
    return { reply: `${ingredient.name} se compte en ${ingredient.unit}. Redites la quantité dans cette unité.` };
  const lots = ctx.lots
    .filter((l) => l.ingredient === ingredient.name && l.quantity - l.reserved > 0)
    .sort((a, b) => a.expires_on.localeCompare(b.expires_on));
  let left = quantity;
  const actions: ActionPayload[] = [];
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(left, lot.quantity - lot.reserved);
    actions.push({ action: "stock", id: lot.id, quantity: Math.round(take * 1000) / 1000, reason: reason.slice(0, 300), kind: "waste" });
    left -= take;
  }
  if (!actions.length) return { reply: `Aucun lot disponible de ${ingredient.name.toLowerCase()} à sortir.` };
  return {
    reply: `Perte prête à enregistrer : ${unitLabel(quantity - Math.max(0, left), ingredient.unit)} de ${ingredient.name.toLowerCase()}.`,
    proposal: {
      id: randomUUID(),
      title: `Perte · ${ingredient.name}`,
      lines: [`${unitLabel(quantity - Math.max(0, left), ingredient.unit)} sur ${actions.length} lot(s)`, `Motif : ${reason}`],
      warning: left > 0 ? `Seuls ${unitLabel(quantity - left, ingredient.unit)} étaient disponibles.` : undefined,
      confirmLabel: "Enregistrer la perte",
      actions,
      next: ["Stocks bas", `Commande de ${ingredient.name.toLowerCase()}`],
      open: "stocks",
    },
  };
}

type Line = { item: string; quantity: number; unit: BaseUnit | null };

/** Ingrédients d’une recette : existants ou à créer (références « $N »). */
function recipeLines(ctx: AssistantContext, lines: Line[], actions: ActionPayload[], text: string[]) {
  return lines.map((l) => {
    const found = findIngredient(ctx, l.item);
    if (found) {
      text.push(`${unitLabel(l.quantity, found.unit)} de ${found.name.toLowerCase()}`);
      return { id: found.id, quantity: l.quantity };
    }
    const unit = guessUnit(l.item, l.unit);
    actions.push({ action: "ingredient", name: capitalize(l.item), unit, threshold: 0, cost: 0 });
    text.push(`${unitLabel(l.quantity, unit)} de ${l.item} (nouvel ingrédient)`);
    return { id: `$${actions.length - 1}`, quantity: l.quantity };
  });
}

/** Nouveau produit à la carte. Prix et recette sont demandés s’ils manquent. */
export function productStep(
  ctx: AssistantContext,
  p: { name: string; price: number | null; category?: string; kind?: string; lines: Line[]; original: string },
): Step {
  if (!can(ctx, "catalog")) return { reply: "Votre profil ne permet pas de modifier la carte." };
  const name = capitalize(p.name.trim());
  if (!name) return { reply: "Quel est le nom du produit à ajouter ?", ask: { followUp: "Ajoute le plat", options: [] } };
  const existing = findMenu(ctx, name);
  if (existing && words(existing.name).join(" ") === words(name).join(" "))
    return { reply: `${existing.name} est déjà à la carte (${euros(existing.price)}). Voulez-vous changer son prix ?`, ask: { followUp: `Passe ${existing.name} à`, options: [] } };
  if (p.price === null)
    return { reply: `À quel prix vendez-vous ${name.toLowerCase()} ?`, ask: { followUp: `${p.original} à`, options: [] } };
  if (!p.lines.length)
    return {
      reply: `Quels ingrédients faut-il pour une portion de ${name.toLowerCase()} ? Par exemple « 300 g de haricots et 150 g de saucisse ». J’en ai besoin pour suivre le stock.`,
      ask: { followUp: `${p.original} avec`, options: [] },
    };
  const bar = /boisson|cocktail|bar/.test(p.kind ?? "") || /\b(jus|the|cafe|cocktail|biere|vin|limonade|sirop)\b/.test(words(name).join(" "));
  const wanted = p.category || (p.kind === "dessert" ? "Desserts" : p.kind === "entree" ? "Entrées" : bar ? "Boissons" : "Plats");
  const categories = [...new Set(ctx.menu.map((m) => m.category))];
  const category = best(categories, (c) => c, wanted, 0.4) ?? capitalize(wanted);
  const actions: ActionPayload[] = [];
  const text: string[] = [];
  const ingredients = recipeLines(ctx, p.lines, actions, text);
  actions.push({ action: "createProduct", name: name.slice(0, 150), category, price: p.price, station: bar ? "bar" : "kitchen", description: "", ingredients });
  return {
    reply: `${name} est prêt à rejoindre la carte à ${euros(p.price)}.`,
    proposal: {
      id: randomUUID(),
      title: `Nouveau produit · ${name}`,
      lines: [`${category} · ${euros(p.price)} · ${bar ? "bar" : "cuisine"}`, ...text.map((t) => `• ${t}`)],
      warning: actions.length > 1 ? "Les nouveaux ingrédients sont créés sans stock : commandez-les pour pouvoir servir ce produit." : undefined,
      confirmLabel: actions.length > 1 ? "Tout créer" : "Ajouter à la carte",
      actions,
      next: [`Commande de ${p.lines[0]?.item ?? "ingrédients"}`, "Montre la carte"],
      open: "menu",
    },
  };
}

/** Prix, disponibilité d’un produit existant. */
export function menuEditStep(ctx: AssistantContext, item: string, change: { price?: number | null; enabled?: boolean }): Step {
  if (!can(ctx, "catalog")) return { reply: "Votre profil ne permet pas de modifier la carte." };
  const m = findMenu(ctx, item);
  if (!m) return { reply: `Je ne trouve pas « ${item} » à la carte. Voulez-vous l’ajouter ?`, ask: { followUp: `Ajoute le plat ${item}`, options: [] } };
  const price = change.price ?? m.price;
  const enabled = change.enabled ?? m.enabled;
  if (price === m.price && enabled === m.enabled)
    return { reply: `${m.name} est déjà à ${euros(m.price)}${m.enabled ? "" : " et désactivé"}.` };
  return {
    reply: `Modification de ${m.name} prête.`,
    proposal: {
      id: randomUUID(),
      title: `Carte · ${m.name}`,
      lines: [
        price !== m.price ? `Prix : ${euros(m.price)} → ${euros(price)}` : "",
        enabled !== m.enabled ? (enabled ? "Remis en vente" : "Retiré de la vente") : "",
      ].filter(Boolean),
      confirmLabel: "Mettre à jour",
      actions: [{ action: "menu", id: m.id, name: m.name, price, enabled, description: m.description.slice(0, 500) }],
      next: ["Montre la carte"],
      open: "menu",
    },
  };
}

export function recipeStep(ctx: AssistantContext, item: string, lines: Line[]): Step {
  if (!can(ctx, "stock") && !can(ctx, "catalog")) return { reply: "Votre profil ne permet pas de modifier les recettes." };
  const m = findMenu(ctx, item);
  if (!m) return { reply: `Je ne trouve pas « ${item} » à la carte.` };
  if (!lines.length) return { reply: `Quels ingrédients pour ${m.name} ?`, ask: { followUp: `Recette de ${m.name} :`, options: [] } };
  const actions: ActionPayload[] = [];
  const text: string[] = [];
  const parts = recipeLines(ctx, lines, actions, text);
  for (const part of parts) actions.push({ action: "recipe", menu: m.id, ingredient: part.id, quantity: part.quantity });
  return {
    reply: `Recette de ${m.name} prête à enregistrer.`,
    proposal: {
      id: randomUUID(),
      title: `Recette · ${m.name}`,
      lines: text.map((t) => `• ${t} par portion`),
      confirmLabel: "Enregistrer la recette",
      actions,
      next: [`Prix de ${m.name}`, "Stocks bas"],
      open: "recipes",
    },
  };
}

export function customerStep(ctx: AssistantContext, name: string, contact: string, consent: boolean, original: string): Step {
  if (!can(ctx, "customers")) return { reply: "Votre profil ou votre forfait ne permet pas de gérer les clients." };
  if (!name.trim()) return { reply: "Quel est le nom du client ?", ask: { followUp: "Ajoute le client", options: [] } };
  const existing = findClient(ctx, name);
  if (existing && words(existing.name).join(" ") === words(name).join(" "))
    return { reply: `${existing.name} est déjà dans vos clients (${existing.points} points).` };
  if (!contact)
    return { reply: `Quel est l’email ou le téléphone de ${capitalize(name)} ?`, ask: { followUp: `${original} contact`, options: [] } };
  return {
    reply: `Fiche client prête pour ${capitalize(name)}.`,
    proposal: {
      id: randomUUID(),
      title: `Nouveau client · ${capitalize(name)}`,
      lines: [contact, consent ? "Accepte les offres de fidélité" : "Sans consentement marketing"],
      confirmLabel: "Créer la fiche",
      actions: [{ action: "customer", name: capitalize(name).slice(0, 300), contact: contact.slice(0, 300), consent }],
      next: [`Ajoute 20 points à ${capitalize(name)}`, "Clients"],
      open: "customers",
    },
  };
}

export function loyaltyStep(ctx: AssistantContext, name: string, points: number, reason: string): Step {
  if (!can(ctx, "customers")) return { reply: "Votre profil ou votre forfait ne permet pas de gérer la fidélité." };
  const c = findClient(ctx, name);
  if (!c) return { reply: `Je ne trouve pas le client « ${name} ». Voulez-vous le créer ?`, ask: { followUp: `Ajoute le client ${name}`, options: [] } };
  if (!c.consent) return { reply: `${c.name} n’a pas accepté le programme de fidélité.` };
  return {
    reply: `${points > 0 ? "Ajout" : "Retrait"} de ${Math.abs(points)} points pour ${c.name}.`,
    proposal: {
      id: randomUUID(),
      title: `Fidélité · ${c.name}`,
      lines: [`${c.points} → ${c.points + points} points`, `Motif : ${reason}`],
      confirmLabel: "Valider",
      actions: [{ action: "loyalty", id: c.id, points, reason: reason.slice(0, 300) }],
      next: ["Clients"],
      open: "customers",
    },
  };
}

export function expenseStep(ctx: AssistantContext, label: string, cents: number | null, original: string): Step {
  if (!can(ctx, "finance")) return { reply: "Votre profil ou votre forfait ne permet pas d’enregistrer des dépenses." };
  if (!cents) return { reply: "Quel est le montant de la dépense ?", ask: { followUp: `${original} de`, options: [] } };
  const text = capitalize(label.trim() || "Dépense");
  return {
    reply: `Dépense prête : ${text}, ${euros(cents)}.`,
    proposal: {
      id: randomUUID(),
      title: "Nouvelle dépense",
      lines: [text, euros(cents)],
      confirmLabel: "Enregistrer",
      actions: [{ action: "expense", label: text.slice(0, 300), amount: cents }],
      next: ["Chiffre du jour"],
      open: "expenses",
    },
  };
}

export function shiftStep(
  ctx: AssistantContext,
  name: string,
  day: string | null,
  range: { start: readonly [number, number]; end: readonly [number, number] } | null,
  original: string,
): Step {
  if (!can(ctx, "team")) return { reply: "Votre profil ne permet pas de faire le planning." };
  const e = findEmployee(ctx, name);
  if (!e)
    return {
      reply: `Je ne trouve pas « ${name} » dans l’équipe. Membres : ${ctx.employees.map((x) => x.name).join(", ")}.`,
      ask: { followUp: original.replace(name, "").trim(), options: ctx.employees.slice(0, 4).map((x) => `${original.replace(name, x.name.split(" ")[0])}`) },
    };
  if (!range) return { reply: `De quelle heure à quelle heure travaille ${e.name} ?`, ask: { followUp: `${original} de`, options: [] } };
  const date = day ?? addDays(today(ctx), 1);
  const start = parisDateTime(date, range.start[0], range.start[1]);
  let end = parisDateTime(date, range.end[0], range.end[1]);
  if (end <= start) end = parisDateTime(addDays(date, 1), range.end[0], range.end[1]);
  const hh = (t: readonly [number, number]) => `${t[0]}h${t[1] ? String(t[1]).padStart(2, "0") : ""}`;
  return {
    reply: `Créneau prêt pour ${e.name}.`,
    proposal: {
      id: randomUUID(),
      title: `Planning · ${e.name}`,
      lines: [`${capitalize(frenchDay(date))}`, `${hh(range.start)} → ${hh(range.end)}`],
      warning: day ? undefined : "Jour non précisé : demain par défaut.",
      confirmLabel: "Ajouter au planning",
      actions: [{ action: "shift", profile: e.id, start, end }],
      next: ["Montre le planning"],
      open: "team",
    },
  };
}

export function clockStep(event: "start" | "break" | "resume" | "end"): Step {
  const label = { start: "Début de service", break: "Début de pause", resume: "Reprise", end: "Fin de service" }[event];
  return {
    reply: `${label} : je pointe ?`,
    proposal: {
      id: randomUUID(),
      title: `Pointage · ${label}`,
      lines: [new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })],
      confirmLabel: "Pointer",
      actions: [{ action: "clock", event }],
      next: event === "start" ? ["Commandes en cours", "Réservations de ce soir"] : [],
      open: "attendance",
    },
  };
}

export function flashStep(ctx: AssistantContext, item: string, percent: number | null, until: readonly [number, number] | null, hours: number | null): Step {
  if (!can(ctx, "catalog") || ctx.plan < 39) return { reply: "Les promotions flash demandent le droit carte et l’abonnement Studio." };
  const m = findMenu(ctx, item);
  if (!m) return { reply: `Je ne trouve pas « ${item} » à la carte.` };
  if (!percent) return { reply: `Quelle remise pour ${m.name} ?`, ask: { followUp: `Promo flash sur ${m.name} de`, options: [`Promo flash -10% sur ${m.name}`, `Promo flash -20% sur ${m.name}`] } };
  const start = new Date(ctx.now);
  const end = until
    ? new Date(parisDateTime(today(ctx), until[0], until[1]))
    : new Date(start.getTime() + (hours ?? 2) * 3600000);
  if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
  return {
    reply: `Promo flash prête sur ${m.name}.`,
    proposal: {
      id: randomUUID(),
      title: `Promo flash · ${m.name}`,
      lines: [`-${percent} % : ${euros(m.price)} → ${euros(Math.round(m.price * (1 - percent / 100)))}`, `Jusqu’à ${end.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })}`],
      confirmLabel: "Lancer la promo",
      actions: [{ action: "flashPromotion", menu: m.id, kind: "percent", value: Math.min(90, percent), starts_at: start.toISOString(), ends_at: end.toISOString(), member_bonus_points: 0 }],
      next: ["Montre la carte"],
      open: "menu",
    },
  };
}

export function messageStep(ctx: AssistantContext, name: string, channel: "email" | "sms", purpose: "relance" | "offre" | "information", body?: string): Step {
  if (!can(ctx, "customers")) return { reply: "Votre profil ou votre forfait ne permet pas de contacter les clients." };
  const c = findClient(ctx, name);
  if (!c) return { reply: `Je ne trouve pas le client « ${name} ».` };
  const first = c.name.split(" ")[0];
  const text =
    body ??
    (purpose === "relance"
      ? `Bonjour ${first}, cela fait un moment ! Toute l’équipe de ${ctx.restaurant.name} serait ravie de vous revoir bientôt. À très vite.`
      : purpose === "offre"
        ? `Bonjour ${first}, une attention pour vous : présentez ce message lors de votre prochaine visite chez ${ctx.restaurant.name} pour profiter d’une surprise de la maison.`
        : `Bonjour ${first}, une information de la part de ${ctx.restaurant.name}.`);
  return {
    reply: `Message ${channel === "sms" ? "SMS" : "email"} prêt pour ${c.name}. Relisez-le avant l’envoi.`,
    proposal: {
      id: randomUUID(),
      title: `${channel === "sms" ? "SMS" : "Email"} · ${c.name}`,
      lines: [text],
      warning: c.consent ? undefined : "Ce client n’a pas donné son accord marketing : seul un message d’information est permis.",
      confirmLabel: "Envoyer",
      actions: [{ action: "messageCustomer", id: c.id, channel, purpose, ...(channel === "email" ? { subject: purpose === "relance" ? "Vous nous manquez" : `Des nouvelles de ${ctx.restaurant.name}` } : {}), body: text.slice(0, channel === "sms" ? 640 : 5000) }],
      next: ["Clients"],
      open: "customers",
    },
  };
}
