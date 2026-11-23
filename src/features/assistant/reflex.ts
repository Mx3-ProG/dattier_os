/* Moteur réflexe de STUDIO VOICE : comprend les demandes courantes du service
   (prendre une commande, encaisser, servir, stocks, ventes, réservations,
   navigation, mode d’emploi) sans appel à un modèle. Il est instantané, coûte
   1 crédit et n’a presque aucun coût de fonctionnement. Ce qu’il ne comprend
   pas part à l’IA générative. */
import { searchGuide } from "./knowledge";
import { manage } from "./manage";
import { findIngredient, supplierFor } from "./operations";
import {
  orderProposal,
  paymentProposal,
  serveProposal,
  tableStatusProposal,
} from "./proposals";
import {
  euros,
  hour,
  normalize,
  numberWords,
  parisDay,
  similarity,
  stopwords,
  words,
} from "@/domain/shared/text";
import type { Answer, AssistantContext, Engine } from "./types";

export type ReflexResult = Answer & { engine: Extract<Engine, "reflex" | "free"> };

const answer = (
  reply: string,
  extra: Partial<Answer> = {},
  engine: ReflexResult["engine"] = "reflex",
): ReflexResult => ({
  reply,
  proposals: [],
  suggestions: [],
  links: [],
  ...extra,
  engine,
});

export const navigation: [RegExp, string, string][] = [
  [/\b(cuisine|kds)\b/, "kitchen", "la cuisine"],
  [/\bbar\b/, "bar", "le bar"],
  [/\b(plan de salle|salle|tables?)\b/, "dining", "le plan de salle"],
  [/\bcommandes?\b/, "orders", "les commandes"],
  [/\breservations?\b/, "reservations", "les réservations"],
  [/\b(stocks?|inventaire)\b/, "stocks", "les stocks"],
  [/\brecettes?\b/, "recipes", "les recettes"],
  [/\bfournisseurs?\b/, "suppliers", "les fournisseurs"],
  [/\blivraisons?\b/, "deliveries", "les livraisons"],
  [/\b(equipe|planning)\b/, "team", "l’équipe et le planning"],
  [/\b(presences?|pointage)\b/, "attendance", "les présences"],
  [/\b(finances?|rapports?)\b/, "finance", "les finances"],
  [/\bdepenses?\b/, "expenses", "les dépenses"],
  [/\b(versements?|virements?|retirer l argent)\b/, "payouts", "vos versements"],
  [/\b(factures? (de |des )?clients?|facturer|avoirs?)\b/, "billing", "les factures clients"],
  [/\bfactures?\b/, "invoices", "les factures fournisseurs"],
  [/\b(banque|rapprochement|releves?)\b/, "bank", "la banque"],
  [/\b(paie|variables de paie)\b/, "payroll", "la paie"],
  [/\b(absences?|conges?|heures sup\w*)\b/, "hr", "les heures et absences"],
  [/\b(operations? a verifier|comptabilite|ecritures?|tva)\b/, "accounting", "les opérations à vérifier"],
  [/\b(clients?|fidelite)\b/, "customers", "les clients"],
  [/\b(la carte|menu)\b/, "menu", "la carte"],
  [/\b(etablissements?|parametres?|reglages?)\b/, "settings", "les établissements"],
  [/\b(vue d ensemble|tableau de bord|accueil)\b/, "overview", "la vue d’ensemble"],
  [/\b(activite|flux)\b/, "activity", "l’activité"],
  [/\b(site (web|internet)|mon site)\b/, "site", "le site internet"],
  [/\b(addons?|modules?|extensions?)\b/, "settings", "les modules et add-ons"],
  [/\b(securite)\b/, "security", "la sécurité"],
  [/\b(qr|codes? qr)\b/, "qr", "les QR codes"],
  [/\b(audience|visiteurs|trafic)\b/, "audience", "l’audience"],
  [/\b(estimation)\b/, "estimation", "l’estimation"],
  [/\b(prospects?|scanner)\b/, "prospect-scanner", "le scanner de prospects"],
  [/\b(pipeline|crm)\b/, "pipeline-crm", "le pipeline CRM"],
  [/\b(customer health|sante client)\b/, "customer-health", "la santé client"],
];

function quantityOf(segment: string): [number, string] {
  const x = segment.match(/(?:^|\s)(?:x\s?(\d{1,2})|(\d{1,2})\s?x)(?=\s|$)/);
  if (x) return [Number(x[1] ?? x[2]), segment.replace(x[0], " ")];
  // Le dernier nombre placé avant le premier mot utile : « une commande de deux couscous » → 2.
  const tokens = segment.trim().split(/\s+/);
  let quantity = 1;
  for (const token of tokens) {
    if (/^\d{1,2}$/.test(token)) quantity = Number(token);
    else if (numberWords[token]) quantity = numberWords[token];
    else if (!stopwords.has(token)) break;
  }
  return [quantity, segment];
}

/** Repère les produits de la carte cités dans une phrase. */
export function parseItems(text: string, ctx: AssistantContext) {
  const found: { menu: string; quantity: number; note?: string }[] = [];
  const unknown: string[] = [];
  const cleaned = text
    .replace(/\btable\s*(?:n|no|numero)?\s*\d{1,3}\b/g, " ")
    .replace(/\b(a|pour) emporter\b/g, " ")
    .replace(/\bau nom de \w+/g, " ");
  for (const raw of cleaned.split(/,|\+|\bet\b|\bplus\b|\bpuis\b|\bainsi que\b/)) {
    const note = raw.match(/\b(sans \w+(?: \w+)?|bien cuite?s?|saignante?s?|a point|tres chaude?s?)\b/);
    const [quantity, rest] = quantityOf(
      (note ? raw.replace(note[0], " ") : raw).trim(),
    );
    const query = words(rest);
    if (!query.length) continue;
    const ranked = ctx.menu
      .map((m) => ({ m, score: similarity(query, m.name) }))
      .sort((a, b) => b.score - a.score || a.m.name.length - b.m.name.length);
    const best = ranked[0];
    if (best && best.score > 0.5)
      found.push({ menu: best.m.id, quantity, note: note?.[0] });
    else if (query.join("").length >= 4) unknown.push(query.join(" "));
  }
  return { found, unknown };
}

const tableIn = (text: string) => {
  const m = text.match(/\btable\s*(?:n|no|numero)?\s*(\d{1,3})\b/);
  return m ? Number(m[1]) : null;
};

const methodIn = (text: string): "card" | "cash" | "other" | null =>
  /\b(especes?|cash|liquide|billets?)\b/.test(text)
    ? "cash"
    : /\b(carte|cb|sans contact|bancaire)\b/.test(text)
      ? "card"
      : /\b(cheque|ticket|titre restaurant|virement)\b/.test(text)
        ? "other"
        : null;

const statusLabel: Record<string, string> = {
  waiting: "en attente",
  preparing: "en préparation",
  ready: "prêt",
  served: "servi",
  cancelled: "annulé",
};

function capabilities(ctx: AssistantContext) {
  return answer(
    [
      `Bonjour ${ctx.user.name.split(" ")[0]}, je suis STUDIO VOICE. Parlez-moi comme à un second :`,
      "• « Commande table 4 : deux couscous agneau et un thé à la menthe »",
      "• « Encaisse la table 4 en espèces » · « Sers la table 2 »",
      "• « Aide-moi à gérer les stocks » · « Achète 3 kg de fraises chez Primeurs Martin »",
      "• « Ajoute le fournisseur Verger Bio qui vend des fraises » · « On a reçu les tomates »",
      "• « Passe le couscous à 19 € » · « Planifie Sarah demain de 18h à 23h »",
      "• « Qu’est-ce qui manque en stock ? » · « Chiffre du jour »",
      "• « Réservations de ce soir » · « Comment créer un code promo ? »",
      "Je prépare chaque action, vous confirmez d’un geste ou d’un « oui » en mode vocal.",
    ].join("\n"),
    {
      suggestions: ["Aide-moi à gérer les stocks", "Commandes en cours", "Livraisons attendues", "Chiffre du jour"],
    },
    "free",
  );
}

export function reflex(input: string, ctx: AssistantContext): ReflexResult | null {
  const text = normalize(input);
  if (!text) return capabilities(ctx);

  if (/\b(credits?|tokens?|solde|jetons?)\b/.test(text) && !/\bclient/.test(text))
    return answer(
      `Il vous reste **${ctx.balance} crédits** STUDIO VOICE. Une réponse réflexe coûte 1 crédit, une analyse IA avancée quelques crédits selon sa longueur.`,
      { suggestions: ["Recharger mes crédits"] },
      "free",
    );

  if (
    /^(bonjour|salut|hello|coucou|bonsoir|hey)\b/.test(text) && text.split(" ").length <= 3 ||
    (/\b(que sais tu faire|qu est ce que tu sais|tu sers a quoi)\b/.test(text) || /^(aide moi|aide|help)$/.test(text))
  )
    return capabilities(ctx);

  const table = tableIn(text);

  // Règlement
  if (table && /\b(encaiss\w*|regl\w*|addition|paie\w*|paye\w*|payer|cloture\w*)\b/.test(text)) {
    const method = methodIn(text) ?? "card";
    const built = paymentProposal(ctx, table, method);
    return answer(built.reply, {
      proposals: built.proposal ? [built.proposal] : [],
      suggestions: built.proposal
        ? method === "card"
          ? [`Encaisse la table ${table} en espèces`]
          : [`Encaisse la table ${table} par carte`]
        : [`Où en est la table ${table} ?`],
      navigate: built.proposal ? undefined : "dining",
    });
  }

  // Libérer / débarrasser une table
  if (table && /\b(libere\w*|debarrass\w*|nettoy\w*|indisponible|bloque\w*)\b/.test(text)) {
    const status = /\b(debarrass|nettoy)/.test(text)
      ? "cleaning"
      : /\b(indisponible|bloque)/.test(text)
        ? "unavailable"
        : "free";
    const built = tableStatusProposal(ctx, table, status);
    return answer(built.reply, { proposals: built.proposal ? [built.proposal] : [] });
  }

  // Suivi d’une table
  if (table && /\b(ou en est|statut|etat|avance|en est|voir|montre)\b/.test(text)) {
    const orders = ctx.orders.filter((o) => o.table === table && o.status === "active");
    if (!orders.length)
      return answer(`Aucune commande en cours à la table ${table}.`, {
        suggestions: [`Commande table ${table} : …`],
      });
    const items = orders.flatMap((o) => o.items).filter((i) => i.status !== "cancelled");
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const allServed = items.every((i) => i.status === "served");
    return answer(
      [
        `**Table ${table}** · ${euros(total)}`,
        ...items.map((i) => `• ${i.quantity} × ${i.name} — ${statusLabel[i.status] ?? i.status}`),
      ].join("\n"),
      {
        suggestions: allServed
          ? [`Encaisse la table ${table} par carte`, `Encaisse la table ${table} en espèces`]
          : items.some((i) => i.status === "ready")
            ? [`Sers la table ${table}`]
            : ["Ouvre la cuisine"],
      },
    );
  }

  // Service des produits prêts
  if (table && /\b(sers|servi\w*|servir|apporte\w*)\b/.test(text) && !parseItems(text, ctx).found.length) {
    const built = serveProposal(ctx, table);
    return answer(built.reply, { proposals: built.proposal ? [built.proposal] : [] });
  }

  // Questions sur les commandes en cours
  if (/\bcommandes?\b/.test(text) && /\b(en cours|en attente|actives?|ouvertes?|liste|combien|quelles?|toutes)\b/.test(text)) {
    const active = ctx.orders.filter((o) => o.status === "active");
    const pending = ctx.orders.filter((o) => o.status === "pending");
    if (!active.length && !pending.length)
      return answer("Aucune commande en cours. Le service est calme.", {
        suggestions: ["Réservations à venir", "Chiffre du jour"],
      });
    const lines = active.slice(0, 12).map((o) => {
      const left = o.items.filter((i) => !["served", "cancelled"].includes(i.status));
      return `• ${o.table ? `Table ${o.table}` : o.customer || "À emporter"} — ${left.length ? `${left.length} produit(s) à servir` : "tout servi, à encaisser"} · depuis ${hour(o.created_at)}`;
    });
    return answer(
      [
        `**${active.length} commande(s) en cours**${pending.length ? ` · ${pending.length} à valider (QR ou en ligne)` : ""}`,
        ...lines,
      ].join("\n"),
      {
        navigate: "orders",
        suggestions: active
          .filter((o) => o.table && o.items.every((i) => ["served", "cancelled"].includes(i.status)))
          .slice(0, 2)
          .map((o) => `Encaisse la table ${o.table} par carte`),
      },
    );
  }

  // Qui vend quoi ?
  const sells = text.match(/\b(?:qui vend|quel(?:s)? fournisseurs? (?:vend\w*|a|ont|livre\w*)|ou acheter|chez qui (?:acheter|commander))\s+(?:des |du |de la |de l |les |le |la )?(.+?)\s*$/);
  if (sells && !/\b(ajoute|cree|creer|nouveau|enregistre)\w*\b/.test(text)) {
    const item = sells[1];
    const ingredient = findIngredient(ctx, item);
    const found = supplierFor(ctx, ingredient?.id ?? null, item);
    return answer(
      found.suppliers.length
        ? `**${found.suppliers.map((s) => s.name).join(", ")}**${found.reason === "spécialité" ? " (déduit de leur spécialité)" : ""} pour ${ingredient?.name.toLowerCase() ?? item}.`
        : `Aucun fournisseur n’est associé à ${ingredient?.name.toLowerCase() ?? item}. Dites « ${ctx.suppliers[0]?.name ?? "Primeurs Martin"} vend des ${item} » pour l’ajouter à son catalogue, ou « ajoute le fournisseur … qui vend des ${item} ».`,
      {
        suggestions: found.suppliers.slice(0, 2).map((s) => `Commande 2 kg de ${item} chez ${s.name}`),
        navigate: "suppliers",
      },
    );
  }

  // Livraisons attendues
  if (/\b(livraisons?|commandes? fournisseurs?|achats?)\b/.test(text) && /\b(attendues?|en cours|prevues?|quand|liste|arrivent)\b/.test(text)) {
    if (!ctx.purchases.length)
      return answer("Aucune livraison attendue.", { suggestions: ["Aide-moi à gérer les stocks"], navigate: "deliveries" });
    return answer(
      [
        `**${ctx.purchases.length} livraison(s) attendue(s)**`,
        ...ctx.purchases.slice(0, 10).map(
          (p) => `• ${new Date(`${p.due_on}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} — ${p.ingredient} · ${p.quantity - p.received} ${p.unit} · ${p.supplier}`,
        ),
      ].join("\n"),
      { navigate: "deliveries", suggestions: ctx.purchases.slice(0, 2).map((p) => `On a reçu ${p.ingredient.toLowerCase()}`) },
    );
  }

  // Gestion : achats, fournisseurs, stocks, carte, clients, équipe, promos
  const managed = manage(input, ctx);
  if (managed) return { ...managed, engine: "reflex" };

  // Prise de commande
  const orderVerb = /\b(commande\w*|ajoute\w*|rajoute\w*|mets?|note\w*|prends?|envoie\w*|lance\w*|sers?|veut|voudrai\w*|pour la table)\b/.test(text);
  if (orderVerb || table || /\b(a|pour) emporter\b/.test(text)) {
    const { found, unknown } = parseItems(text, ctx);
    if (found.length) {
      const name = input.match(/au nom de\s+([\p{L}-]{2,40})/u)?.[1] ?? "";
      // Heure de retrait pour les commandes à emporter (« pour 18h », « à 18h30 »).
      const hourMatch = input.match(/\b(?:pour|a|à)\s+(\d{1,2})\s*h(?:\s*(\d{2}))?/i);
      const pickupHour = hourMatch
        ? `${hourMatch[1].padStart(2, "0")}:${(hourMatch[2] ?? "00").padStart(2, "0")}`
        : null;
      if (pickupHour && !table)
        for (const f of found) f.note = (f.note ? `${f.note}, ` : "") + `retrait ${pickupHour}`;
      const built = orderProposal(ctx, table, found, name);
      const missing = unknown.length
        ? ` Je n’ai pas trouvé à la carte : ${unknown.map((u) => `« ${u} »`).join(", ")}.`
        : "";
      return answer(built.reply + missing, {
        proposals: built.proposal ? [built.proposal] : [],
        suggestions: unknown.length ? ["Montre la carte"] : [],
      });
    }
    if (orderVerb && unknown.length && (table || /\bcommande/.test(text))) {
      const closest = ctx.menu
        .filter((m) => m.enabled)
        .map((m) => ({ m, score: similarity(words(unknown.join(" ")), `${m.name} ${m.category}`) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => x.m.name);
      return answer(
        `Je ne trouve pas ${unknown.map((u) => `« ${u} »`).join(", ")} à la carte de ${ctx.restaurant.name}.${closest.length ? ` Vous pensiez peut-être à : ${closest.join(", ")} ?` : ""}`,
        {
          suggestions: closest.map((c) => `Commande${table ? ` table ${table}` : ""} : 1 ${c}`),
        },
      );
    }
  }

  // Stocks
  if (/\b(stocks?|rupture|manque\w*|reappro\w*|inventaire|bientot fini)\b/.test(text)) {
    const low = ctx.ingredients
      .filter((i) => i.available <= i.threshold)
      .sort((a, b) => a.available / (a.threshold || 1) - b.available / (b.threshold || 1));
    const out = ctx.menu.filter((m) => m.enabled && m.portions === 0);
    if (!ctx.permissions.includes("stock") && !low.length)
      return answer("Votre profil n’a pas accès aux stocks.");
    return answer(
      low.length || out.length
        ? [
            low.length ? `**${low.length} ingrédient(s) sous le seuil**` : "",
            ...low.slice(0, 10).map((i) => `• ${i.name} : ${Math.max(0, Math.round(i.available * 10) / 10)} ${i.unit} (seuil ${i.threshold})`),
            out.length ? `**En rupture à la carte** : ${out.map((m) => m.name).join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "Tous les stocks sont au-dessus de leur seuil. Rien à commander pour l’instant.",
      {
        navigate: "stocks",
        suggestions: low.length ? ["Comment passer une commande fournisseur ?"] : [],
      },
    );
  }

  // Ventes
  if (/\b(ventes?|chiffre|ca|recette du jour|encaisse aujourd hui|combien on a fait|bilan)\b/.test(text)) {
    const today = parisDay(ctx.now);
    const week = ctx.sales.slice(-7);
    const weekTotal = week.reduce((s, d) => s + d.total, 0);
    const average = ctx.paymentsToday ? Math.round(ctx.paidToday / ctx.paymentsToday) : 0;
    return answer(
      [
        `**Aujourd’hui** : ${euros(ctx.paidToday)} encaissés en ${ctx.paymentsToday} règlement(s)${average ? ` · ticket moyen ${euros(average)}` : ""}.`,
        week.length ? `**7 derniers jours** : ${euros(weekTotal)} (${week.filter((d) => d.day !== today).length} jours clôturés).` : "",
        ctx.orders.some((o) => o.status === "active")
          ? `Encore ${ctx.orders.filter((o) => o.status === "active").length} table(s) ou commande(s) à encaisser.`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      { navigate: ctx.modules.includes("finance") ? "finance" : undefined, suggestions: ["Commandes en cours"] },
    );
  }

  // Réservations
  if (/\breserv\w*/.test(text) && !/\bcomment\b/.test(text)) {
    const tonight = /\b(ce soir|soir|aujourd hui|ce midi|midi)\b/.test(text);
    const upcoming = ctx.reservations
      .filter((r) => ["requested", "confirmed", "pending"].includes(r.status) || r.status === "arrived")
      .filter((r) => !tonight || parisDay(r.starts_at) === parisDay(ctx.now))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return answer(
      upcoming.length
        ? [
            `**${upcoming.length} réservation(s)**${tonight ? " aujourd’hui" : " à venir"} · ${upcoming.reduce((s, r) => s + r.guests, 0)} couverts`,
            ...upcoming.slice(0, 10).map((r) => `• ${hour(r.starts_at)}${parisDay(r.starts_at) !== parisDay(ctx.now) ? ` (${new Date(r.starts_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" })})` : ""} — ${r.name}, ${r.guests} pers. · ${r.status === "confirmed" ? "confirmée" : r.status === "arrived" ? "arrivée" : "à confirmer"}`),
          ].join("\n")
        : "Aucune réservation à venir.",
      { navigate: "reservations", suggestions: ["Tables libres"] },
    );
  }

  // Tables libres
  if (/\btables?\b/.test(text) && /\b(libres?|dispo\w*|vides?|occupees?)\b/.test(text)) {
    const free = ctx.tables.filter((t) => t.status === "free");
    const busy = ctx.tables.filter((t) => t.status === "occupied");
    return answer(
      `**${free.length} table(s) libre(s)** : ${free.map((t) => `${t.number} (${t.capacity} pl.)`).join(", ") || "aucune"}.\n${busy.length} occupée(s)${ctx.tables.some((t) => t.status === "cleaning") ? `, ${ctx.tables.filter((t) => t.status === "cleaning").length} à débarrasser` : ""}.`,
      { navigate: "dining" },
    );
  }

  // Prix d’un plat
  if (/\b(prix|combien coute|coute combien|tarif)\b/.test(text)) {
    const query = words(text.replace(/\b(prix|combien|coute|tarif)\b/g, " "));
    const ranked = ctx.menu
      .map((m) => ({ m, score: similarity(query, m.name) }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0]?.score >= 0.5)
      return answer(
        `**${ranked[0].m.name}** : ${euros(ranked[0].m.price)}${ranked[0].m.enabled ? "" : " (désactivé)"} · ${ranked[0].m.portions} portion(s) disponibles.`,
      );
  }

  // Navigation
  if (/\b(ouvre|ouvrir|va|aller|affiche|montre|emmene|direction|passe)\b/.test(text)) {
    const target = navigation.find(([re]) => re.test(text));
    if (target && ctx.modules.includes(target[1]))
      return answer(`J’ouvre ${target[2]}.`, { navigate: target[1] }, "free");
  }

  // Mode d’emploi
  const guide = searchGuide(input);
  if (guide && /\b(comment|ou|pourquoi|c est quoi|qu est ce|expliqu\w*|aide|faire|fonctionne|marche|peut on|puis je|creer|configurer|parametrer)\b/.test(text))
    return { ...guide, engine: "reflex" };

  return null;
}
