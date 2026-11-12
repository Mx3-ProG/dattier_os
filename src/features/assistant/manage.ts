/* Compréhension des demandes de gestion (achats, fournisseurs, stocks, carte,
   clients, équipe, promotions, messages). Une phrase peut contenir plusieurs
   demandes : « aide-moi à gérer les stocks et à acheter des fraises » donne
   le réassort ET la commande de fraises. */
import { randomUUID } from "node:crypto";
import {
  clockStep,
  customerStep,
  expenseStep,
  findIngredient,
  findMenu,
  flashStep,
  loyaltyStep,
  menuEditStep,
  messageStep,
  productStep,
  purchaseStep,
  receiveStep,
  recipeStep,
  restockStep,
  shiftStep,
  wasteStep,
  type Step,
} from "./operations";
import { parseAmount, parseDay, parseEuros, parseHour, parseTimeRange } from "./parse";
import { reservationProposal } from "./proposals";
import { normalize, sameWord, similarity, words } from "@/domain/assistant/text";
import type { Answer, AssistantContext, Proposal } from "./types";

const filler = new Set([
  "achete", "acheter", "achetes", "achat", "achats", "commande", "commander", "commandes", "fournisseur",
  "besoin", "faut", "approvisionne", "approvisionner", "reapprovisionne", "reapprovisionner", "demain",
  "apres", "aujourd", "hui", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
  "livraison", "livre", "livrer", "pour", "aide", "moi", "aider", "gerer", "on", "nous", "j", "ai",
  "recu", "recues", "recus", "reception", "sont", "est", "vient", "viennent", "arriver", "arrives", "receptionne", "receptionner", "arrive", "arrivee", "arrivees",
  "dlc", "date", "limite", "peremption", "jusqu", "au", "le", "la", "les", "du", "des", "de", "d",
  "perte", "jete", "jeter", "poubelle", "abime", "abimes", "abimees", "perime", "perimes", "casse",
  "cassee", "a", "aussi", "encore", "plus", "kilo", "kilos", "kg", "g", "litre", "litres",
]);

const clean = (text: string) =>
  words(text)
    .filter((w) => !filler.has(w) && !/^\d/.test(w))
    .join(" ")
    .trim();

/** Fragment de la phrase d’origine (casse et accents conservés). */
function rawAfter(input: string, marker: RegExp, stop = /\s+(?:qui|pour|avec|contact|t[ée]l|e-?mail|au prix|à \d|a \d|livr|demain|après|apres|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b|[,;.!?]|$/i) {
  const m = input.match(marker);
  if (!m || m.index === undefined) return "";
  const rest = input.slice(m.index + m[0].length);
  const end = rest.search(stop);
  return (end >= 0 ? rest.slice(0, end) : rest).trim().replace(/^(le|la|les|l’|l')\s*/i, "");
}

const contactIn = (input: string) =>
  input.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ??
  input.match(/(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/)?.[0] ??
  "";

/** Lignes « 200 g de semoule et 2 œufs » → quantités en unité de base. */
function lines(text: string) {
  return text
    .split(/,|\bet\b|\bplus\b|\+/)
    .map((part) => {
      const a = parseAmount(part.trim());
      if (!a) return null;
      const item = clean(a.rest);
      return item ? { item, quantity: a.quantity, unit: a.unit } : null;
    })
    .filter((l): l is { item: string; quantity: number; unit: "g" | "ml" | "unit" | null } => !!l);
}

/** Entité dont le nom figure dans la phrase (prénom seul accepté s’il est unique). */
function named<T>(text: string, items: T[], label: (t: T) => string) {
  const tokens = words(text);
  const scored = items
    .map((item) => {
      const parts = words(label(item)).filter((w) => w.length >= 3);
      const hits = parts.filter((p) => tokens.some((t) => sameWord(t, p))).length;
      return { item, hits, full: parts.length > 0 && hits === parts.length };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => Number(b.full) - Number(a.full) || b.hits - a.hits);
  if (!scored.length) return undefined;
  if (scored.length > 1 && scored[0].hits === scored[1].hits && scored[0].full === scored[1].full) return undefined;
  return scored[0].item;
}

function merge(steps: Step[]): Answer & { followUp?: string } {
  const proposals = steps.flatMap((s) => (s.proposal ? [s.proposal] : [])) as Proposal[];
  const ask = steps.find((s) => s.ask)?.ask;
  return {
    reply: steps.map((s) => s.reply).join("\n\n"),
    proposals,
    suggestions: ask?.options ?? [],
    links: [],
    followUp: ask?.followUp,
  };
}

export function manage(input: string, ctx: AssistantContext): (Answer & { followUp?: string }) | null {
  const t = normalize(input);
  const steps: Step[] = [];
  const hasTable = /\btable\s*(?:n|no|numero)?\s*\d/.test(t);

  // Pointage
  if (/\b(je commence|je prends mon (poste|service)|debut de (mon )?service|pointe\w* (mon )?arrivee|j arrive)\b/.test(t))
    return merge([clockStep("start")]);
  if (/\b(je prends ma pause|je pars en pause|debut de pause)\b/.test(t)) return merge([clockStep("break")]);
  if (/\b(je reprends|fin de (ma )?pause|reprise)\b/.test(t)) return merge([clockStep("resume")]);
  if (/\b(je termine|fin de (mon )?service|je pars|je finis|pointe\w* (mon )?depart)\b/.test(t)) return merge([clockStep("end")]);

  // Fidélité
  const points = t.match(/\b(\d{1,5})\s*points?\b/);
  if (points && /\b(ajoute|donne|offre|credite|retire|enleve|debite|rajoute)\w*\b/.test(t)) {
    const sign = /\b(retire|enleve|debite)\w*/.test(t) ? -1 : 1;
    const client = named(t, ctx.clients, (c) => c.name);
    const name = client?.name ?? clean(t.replace(points[0], "").replace(/\b(ajoute|donne|offre|credite|retire|enleve|debite|rajoute)\w*\b/g, ""));
    return merge([loyaltyStep(ctx, name, sign * Number(points[1]), sign > 0 ? "Geste fidélité" : "Correction de points")]);
  }

  // Messages clients
  if (/\b(relance|envoie|envoyer|ecris|ecrire|message|sms|texto|mail|email)\b/.test(t) && !/\bfournisseur\b/.test(t)) {
    const client = named(t, ctx.clients, (c) => c.name);
    if (client) {
      const channel = /\b(sms|texto)\b/.test(t) ? "sms" : "email";
      const purpose = /\b(relance|manque|revoir)\b/.test(t) ? "relance" : /\b(offre|promo|cadeau|remise)\b/.test(t) ? "offre" : "information";
      return merge([messageStep(ctx, client.name, channel, purpose)]);
    }
  }

  // Promotion flash
  const percent = t.match(/(\d{1,2})\s*(?:%|pour ?cent)/);
  if (/\bpromo\w*\b/.test(t) && (percent || /\bflash\b/.test(t))) {
    const item = t.match(/\bsur\s+(?:le |la |les |l )?(.+?)(?:\s+(?:jusqu|pendant|de \d|a \d)|$)/)?.[1] ?? "";
    const hours = t.match(/\bpendant\s+(\d{1,2})\s*h/);
    return merge([flashStep(ctx, item, percent ? Number(percent[1]) : null, /\bjusqu/.test(t) ? parseHour(t.slice(t.indexOf("jusqu"))) : null, hours ? Number(hours[1]) : null)]);
  }

  // Dépenses
  if (/\bdepense\b/.test(t)) {
    const label = rawAfter(input, /\b(?:pour|libell[ée])\s+/i) || clean(t.replace(/\d+([.,]\d+)?\s*(euros?|eur|e)?/g, "").replace(/\b(ajoute|enregistre|note|une|depense)\b/g, ""));
    return merge([expenseStep(ctx, label, parseEuros(t), input.replace(/[.!?]+$/, ""))]);
  }

  // Clients
  if (/\b(ajoute|cree|creer|nouveau|nouvelle|enregistre|inscris)\w*\s+(?:un |une |le |la )?client(e)?\b/.test(t)) {
    const name = rawAfter(input, /client(?:e)?\s+/i, /\s+(?:qui|avec|contact|t[ée]l|e-?mail|au|[\w.+-]+@|\+33|0\d)|[,;.!?]|$/i);
    return merge([customerStep(ctx, name, contactIn(input), /\b(accepte|d accord|consent|ok pour|veut bien)\b/.test(t), input.replace(/[.!?]+$/, ""))]);
  }

  // Réservations nominatives
  const resa = t.match(/\b(confirme|valide|annule|refuse|decline)\w*\s+(?:la\s+)?reservation\s+(?:de|du|pour|au nom de)\s+(.+)/);
  const arrived = t.match(/^(.+?)\s+(?:est|sont)\s+arrive\w*/);
  const guest = resa || arrived ? named(resa ? resa[2] : arrived![1], ctx.reservations, (x) => x.name) : undefined;
  if (resa || guest) {
    const who = resa ? resa[2] : arrived![1];
    const r = guest;
    if (!r) return merge([{ reply: `Je ne trouve pas de réservation au nom de « ${who} ».` }]);
    const status = !resa ? "arrived" : /^(confirme|valide)/.test(resa[1]) ? "confirmed" : /^annule/.test(resa[1]) ? "cancelled" : "declined";
    const built = reservationProposal(ctx, r.id, status);
    return merge([built]);
  }

  // Planning
  const range = parseTimeRange(t);
  const employee = named(t, ctx.employees, (e) => e.name);
  if ((range || /\b(planifie|planning|programme)\b/.test(t)) && employee && !hasTable)
    return merge([shiftStep(ctx, employee.name, parseDay(t, ctx.now), range, input.replace(/[.!?]+$/, ""))]);

  // Fournisseurs : création et catalogue
  if (/\bfournisseur\b/.test(t) && /\b(ajoute|cree|creer|nouveau|enregistre)\w*\b/.test(t) && !/\bchez\b/.test(t)) {
    const name = rawAfter(input, /fournisseur\s+/i);
    const sells = t.match(/\b(?:qui vend\w*|vend\w*|qui livre\w*|specialise\w* en|pour les?)\s+(.+?)(?:\s+(?:contact|tel|email)|$)/)?.[1] ?? "";
    const products = sells.split(/,|\bet\b/).map(clean).filter(Boolean);
    if (!name)
      return merge([{ reply: "Quel est le nom du nouveau fournisseur ?", ask: { followUp: `${input.replace(/[.!?]+$/, "")} nommé`, options: [] } }]);
    return merge([supplierStep(ctx, name, contactIn(input), products)]);
  }
  const vend = t.match(/^(.+?)\s+(?:vend|vendent|livre|fournit)\s+(?:aussi\s+)?(?:des |du |de la |les |le |la )?(.+)$/);
  if (vend) {
    const supplier = named(vend[1], ctx.suppliers, (s) => s.name);
    if (supplier) return merge([linkStep(ctx, supplier.id, vend[2].split(/,|\bet\b/).map(clean).filter(Boolean))]);
  }

  // Carte : nouveau produit
  const productKind = t.match(/\b(?:ajoute|cree|creer|nouveau|nouvelle|mets?|rajoute)\w*\s+(?:un |une |le |la |au menu |a la carte )?(plat|produit|dessert|boisson|entree|cocktail)\b/);
  if (productKind || /\b(ajoute|rajoute|mets?)\w*\s+.+\s+a la carte\b/.test(t)) {
    const name = productKind
      ? rawAfter(input, new RegExp(`(?:${productKind[1]}|${productKind[1].replace("entree", "entrée")})\\s+`, "i"), /\s+(?:à|a)\s+\d|\s+avec\b|\s+au prix|\s+cat[ée]gorie|\s+à la carte|\s+a la carte|[,;.!?]|$/i)
      : rawAfter(input, /\b(?:ajoute|rajoute|mets?)\s+/i, /\s+(?:à|a) la carte|\s+(?:à|a)\s+\d|\s+avec\b|[,;.!?]|$/i);
    const category = rawAfter(input, /cat[ée]gorie\s+/i, /\s+(?:à|a)\s+\d|\s+avec\b|[,;.!?]|$/i);
    const recipe = t.includes(" avec ") ? lines(t.slice(t.indexOf(" avec ") + 6)) : [];
    return merge([productStep(ctx, { name: name.replace(/^(un|une|le|la)\s+/i, ""), price: parseEuros(t.split(" avec ")[0]), category, kind: productKind?.[1], lines: recipe, original: input.replace(/[.!?]+$/, "") })]);
  }

  // Carte : recette d’un produit existant
  const recipeMatch = t.match(/^(?:la recette (?:du |de la |des |de l )?)?(.+?)\s+(?:utilise|contient|demande|se fait avec|prend)\s+(.+)$/);
  if (recipeMatch && !hasTable && findMenu(ctx, recipeMatch[1]))
    return merge([recipeStep(ctx, recipeMatch[1], lines(recipeMatch[2]))]);

  // Carte : prix et disponibilité
  const menuItem = !hasTable ? findMenuIn(ctx, t) : undefined;
  if (menuItem) {
    if (/\b(prix|passe|change|modifie|augmente|baisse|mets?)\w*\b/.test(t) && parseEuros(t.replace(menuItem.query, " ")) !== null)
      return merge([menuEditStep(ctx, menuItem.name, { price: parseEuros(t.replace(menuItem.query, " ")) })]);
    if (/\b(desactive|retire|enleve|plus de|epuise|indisponible|arrete)\w*\b/.test(t))
      return merge([menuEditStep(ctx, menuItem.name, { enabled: false })]);
    if (/\b(reactive|remets?|active|remet en vente|disponible)\w*\b/.test(t))
      return merge([menuEditStep(ctx, menuItem.name, { enabled: true })]);
  }

  // Stocks : réassort, achats, réceptions, pertes (cumulables)
  if (/\b(reassort|reapprovisionn\w*|gere\w* (les |mes |le )?stocks?|aide\w* .*stocks?|remplir les stocks|refaire (le|les) stocks?|commandes? de reassort)\b/.test(t))
    steps.push(restockStep(ctx));

  const buy = t.match(/\b(achete\w*|acheter|achat|approvisionn\w*|il (?:me|nous) faut|besoin d\w*|command\w*)\b/);
  if (buy && !hasTable) {
    const segment = t.slice(buy.index!);
    const amount = parseAmount(segment);
    const supplier = rawAfter(input, /\bchez\s+/i, /\s+(?:pour|livr|le \d|demain|après|apres|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|contact|t[ée]l|e-?mail|au |et )|[,;.!?]|$/i);
    const base = (amount ? amount.rest : segment).replace(/\bchez\s+.*$/, "");
    const item = clean(base);
    const looksSupply =
      /\b(achete|acheter|achat|approvisionn|chez|fournisseur|il me faut|il nous faut|besoin)\b/.test(t) ||
      (amount?.unit && amount.unit !== "unit") ||
      (item && findIngredient(ctx, item) && !findMenu(ctx, item));
    if (looksSupply && (item || steps.length === 0))
      steps.push(
        purchaseStep(ctx, {
          item,
          quantity: amount?.quantity ?? null,
          unit: amount?.unit ?? null,
          supplier: supplier || undefined,
          contact: contactIn(input) || undefined,
          due: parseDay(t, ctx.now),
        }),
      );
  }

  if (/\b(on a recu\w*|j ai recu\w*|recu\w*|receptionn\w*|livraison (?:est )?arrive\w*|est arrive\w*|sont arrive\w*|vient d arriver|viennent d arriver)\b/.test(t)) {
    const item = clean(t.replace(/\b(dlc|date limite|peremption|jusqu au)\b.*$/, ""));
    const expires = /\b(dlc|date limite|peremption|jusqu)/.test(t) ? parseDay(t.slice(t.search(/\b(dlc|date limite|peremption|jusqu)/)), ctx.now) : null;
    steps.push(receiveStep(ctx, item, expires));
  }

  if (/\b(perte|jete\w*|jeter|poubelle|abime\w*|perime\w*|casse\w*|gaspill\w*)\b/.test(t)) {
    const amount = parseAmount(t);
    const reasonPart = t.match(/\b(?:car|parce que|parce qu|a cause)\s+(.+)$/)?.[1];
    const item = clean((amount ? amount.rest : t).replace(/\b(?:car|parce que|parce qu|a cause)\s+.+$/, ""));
    steps.push(
      wasteStep(ctx, item, amount?.quantity ?? null, amount?.unit ?? null, reasonPart ? reasonPart.slice(0, 120) : /perime/.test(t) ? "Produit périmé" : "Perte déclarée à STUDIO VOICE"),
    );
  }

  return steps.length ? merge(steps) : null;
}

/** Produit de la carte cité dans la phrase, avec le fragment qui le désigne. */
function findMenuIn(ctx: AssistantContext, t: string) {
  const tokens = words(t);
  let bestMatch: { name: string; query: string; score: number } | undefined;
  for (const m of ctx.menu) {
    const score = similarity(tokens, m.name);
    const parts = words(m.name);
    const covered = parts.every((p) => tokens.some((x) => sameWord(x, p)));
    if (covered && (!bestMatch || score > bestMatch.score))
      bestMatch = { name: m.name, query: normalize(m.name), score };
  }
  return bestMatch;
}

export function supplierStep(ctx: AssistantContext, name: string, contact: string, products: string[]): Step {
  if (!ctx.permissions.includes("purchases")) return { reply: "Votre profil ne permet pas de gérer les fournisseurs." };
  const existing = ctx.suppliers.find((s) => words(s.name).join(" ") === words(name).join(" "));
  if (existing) return products.length ? linkStep(ctx, existing.id, products) : { reply: `${existing.name} existe déjà.` };
  const actions: { action: string; [k: string]: unknown }[] = [];
  const ids: string[] = [];
  const lineText: string[] = [];
  for (const p of products) {
    const found = findIngredient(ctx, p);
    if (found) {
      ids.push(found.id);
      lineText.push(`Vend : ${found.name}`);
    } else {
      actions.push({ action: "ingredient", name: p.charAt(0).toUpperCase() + p.slice(1), unit: /\b(lait|creme|huile|vin|jus|sirop|eau)\b/.test(p) ? "ml" : "g", threshold: 0, cost: 0 });
      ids.push(`$${actions.length - 1}`);
      lineText.push(`Vend : ${p} (nouvel ingrédient)`);
    }
  }
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  actions.push({ action: "supplier", name: label.slice(0, 300), contact: (contact || "À compléter").slice(0, 300), ingredients: ids });
  return {
    reply: `Nouveau fournisseur prêt : ${label}.`,
    proposal: {
      id: randomUUID(),
      title: `Nouveau fournisseur · ${label}`,
      lines: [contact ? `Contact : ${contact}` : "Contact : à compléter", ...lineText],
      warning: contact ? undefined : "Ajoutez un email ou un téléphone pour pouvoir le joindre.",
      confirmLabel: "Créer le fournisseur",
      actions,
      next: products[0] ? [`Commande 2 kg de ${products[0]} chez ${label}`] : ["Fournisseurs"],
      open: "suppliers",
    },
  };
}

export function linkStep(ctx: AssistantContext, supplierId: string, products: string[]): Step {
  const supplier = ctx.suppliers.find((s) => s.id === supplierId)!;
  const actions: { action: string; [k: string]: unknown }[] = [];
  const text: string[] = [];
  for (const p of products) {
    const found = findIngredient(ctx, p);
    if (found) {
      if (supplier.ingredients.includes(found.id)) continue;
      actions.push({ action: "supplierIngredient", supplier: supplier.id, ingredient: found.id, linked: true });
      text.push(found.name);
    } else {
      actions.push({ action: "ingredient", name: p.charAt(0).toUpperCase() + p.slice(1), unit: "g", threshold: 0, cost: 0 });
      actions.push({ action: "supplierIngredient", supplier: supplier.id, ingredient: `$${actions.length - 1}`, linked: true });
      text.push(`${p} (nouvel ingrédient)`);
    }
  }
  if (!actions.length) return { reply: `${supplier.name} vend déjà ${products.join(", ")}.` };
  return {
    reply: `J’ajoute ${text.join(", ")} au catalogue de ${supplier.name}.`,
    proposal: {
      id: randomUUID(),
      title: `Catalogue · ${supplier.name}`,
      lines: text.map((x) => `Vend : ${x}`),
      confirmLabel: "Mettre à jour le catalogue",
      actions,
      next: [`Commande 2 kg de ${products[0]} chez ${supplier.name}`],
      open: "suppliers",
    },
  };
}
