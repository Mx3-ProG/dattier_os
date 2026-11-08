/* IA générative de Cuisine IA (Claude, via le SDK officiel Anthropic).
   Le modèle voit un résumé du service limité aux droits de l’utilisateur et le
   guide complet. Il ne modifie jamais les données : ses outils fabriquent des
   propositions que l’utilisateur confirme dans le poste. */
import Anthropic from "@anthropic-ai/sdk";
import { guideDigest } from "./knowledge";
import { navigation } from "./reflex";
import { linkStep, supplierStep } from "./manage";
import {
  customerStep,
  expenseStep,
  findClient,
  findMenu,
  flashStep,
  loyaltyStep,
  menuEditStep,
  messageStep,
  productStep,
  purchaseStep,
  receiveStep,
  restockStep,
  shiftStep,
  wasteStep,
  type Step,
} from "./operations";
import type { BaseUnit } from "./parse";
import {
  itemStatusProposal,
  orderProposal,
  paymentProposal,
  reservationProposal,
  serveProposal,
  tableStatusProposal,
} from "./proposals";
import { providerCostEur, type TokenUsage } from "./pricing";
import type { Answer, AssistantContext, Proposal, Turn } from "./types";

export const llmEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export const llmModel = () => process.env.ATACUISINE_AI_MODEL || "claude-opus-5-5";

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic({ maxRetries: 1, timeout: 45_000 }));

const object = (
  properties: Record<string, unknown>,
): Anthropic.Beta.BetaTool.InputSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const tableNumber = { type: "integer", description: "Numéro de table affiché en salle." };
const modules = navigation.map(([, id]) => id);

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "propose_order",
    description:
      "Prépare une commande en salle ou à emporter. Utilise uniquement des menu_id présents dans le contexte. table_number = 0 pour une vente à emporter.",
    strict: true,
    input_schema: object({
      table_number: tableNumber,
      customer_name: { type: "string", description: "Nom du client, vide si inconnu." },
      items: {
        type: "array",
        items: object({
          menu_id: { type: "string" },
          quantity: { type: "integer" },
          note: { type: "string", description: "Précision pour la cuisine, vide sinon." },
        }),
      },
    }),
  },
  {
    name: "propose_payment",
    description:
      "Prépare la déclaration du règlement d’une table (encaissé sur le terminal ou en espèces). Les produits prêts seront marqués servis.",
    strict: true,
    input_schema: object({
      table_number: tableNumber,
      method: { type: "string", enum: ["card", "cash", "other"] },
    }),
  },
  {
    name: "propose_serve",
    description: "Marque servis tous les produits prêts d’une table.",
    strict: true,
    input_schema: object({ table_number: tableNumber }),
  },
  {
    name: "propose_item_status",
    description:
      "Change l’étape de produits précis (ids du contexte) : preparing, ready, served ou cancelled.",
    strict: true,
    input_schema: object({
      item_ids: { type: "array", items: { type: "string" } },
      status: { type: "string", enum: ["preparing", "ready", "served", "cancelled"] },
    }),
  },
  {
    name: "propose_table_status",
    description: "Passe une table non occupée en libre, à débarrasser ou indisponible.",
    strict: true,
    input_schema: object({
      table_number: tableNumber,
      status: { type: "string", enum: ["free", "cleaning", "unavailable"] },
    }),
  },
  {
    name: "propose_reservation_status",
    description: "Confirme, refuse, annule ou pointe une réservation du contexte.",
    strict: true,
    input_schema: object({
      reservation_id: { type: "string" },
      status: {
        type: "string",
        enum: ["confirmed", "arrived", "declined", "cancelled", "no_show"],
      },
    }),
  },
  {
    name: "open_module",
    description: "Ouvre un écran du poste de travail pour l’utilisateur.",
    strict: true,
    input_schema: object({ module: { type: "string", enum: modules } }),
  },
  {
    name: "propose_purchase",
    description:
      "Prépare une commande fournisseur. Crée l’ingrédient ou le fournisseur s’ils n’existent pas. Laisse supplier_name vide pour laisser l’application trouver le fournisseur qui vend déjà ce produit (elle demandera sinon). quantity en unité indiquée.",
    strict: true,
    input_schema: object({
      ingredient_name: { type: "string" },
      quantity: { type: "number", description: "0 si l’utilisateur ne l’a pas dite." },
      unit: { type: "string", enum: ["g", "kg", "ml", "l", "unit"] },
      supplier_name: { type: "string", description: "Vide si non précisé." },
      supplier_contact: { type: "string", description: "Email ou téléphone, vide sinon." },
      due_date: { type: "string", description: "AAAA-MM-JJ, vide pour le délai habituel." },
    }),
  },
  {
    name: "propose_restock",
    description: "Prépare le réassort de tous les ingrédients sous leur seuil, chez leurs fournisseurs habituels.",
    strict: true,
    input_schema: object({}),
  },
  {
    name: "propose_receive",
    description: "Réceptionne une livraison attendue (commandes fournisseurs du contexte).",
    strict: true,
    input_schema: object({
      ingredient_name: { type: "string" },
      expires: { type: "string", description: "Date limite AAAA-MM-JJ, vide sinon." },
    }),
  },
  {
    name: "propose_waste",
    description: "Déclare une perte de stock (produit jeté, abîmé, périmé).",
    strict: true,
    input_schema: object({
      ingredient_name: { type: "string" },
      quantity: { type: "number" },
      unit: { type: "string", enum: ["g", "kg", "ml", "l", "unit"] },
      reason: { type: "string" },
    }),
  },
  {
    name: "propose_supplier",
    description: "Crée un fournisseur ou complète son catalogue (ce qu’il vend). Les ingrédients inconnus sont créés.",
    strict: true,
    input_schema: object({
      name: { type: "string" },
      contact: { type: "string", description: "Vide si inconnu." },
      sells: { type: "array", items: { type: "string" } },
    }),
  },
  {
    name: "propose_product",
    description:
      "Ajoute un produit à la carte avec sa recette (ingrédients par portion, créés s’ils manquent). Si le prix ou la recette manquent, utilise plutôt ask_user.",
    strict: true,
    input_schema: object({
      name: { type: "string" },
      price_cents: { type: "integer" },
      category: { type: "string" },
      ingredients: {
        type: "array",
        items: object({
          name: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", enum: ["g", "kg", "ml", "l", "unit"] },
        }),
      },
    }),
  },
  {
    name: "propose_menu_update",
    description: "Change le prix ou la disponibilité d’un produit de la carte. price_cents = -1 pour garder le prix.",
    strict: true,
    input_schema: object({
      menu_id: { type: "string" },
      price_cents: { type: "integer" },
      availability: { type: "string", enum: ["keep", "on", "off"] },
    }),
  },
  {
    name: "propose_customer",
    description: "Crée une fiche client.",
    strict: true,
    input_schema: object({
      name: { type: "string" },
      contact: { type: "string" },
      consent: { type: "boolean" },
    }),
  },
  {
    name: "propose_loyalty",
    description: "Ajoute (positif) ou retire (négatif) des points de fidélité à un client du contexte.",
    strict: true,
    input_schema: object({
      client_name: { type: "string" },
      points: { type: "integer" },
      reason: { type: "string" },
    }),
  },
  {
    name: "propose_expense",
    description: "Enregistre une dépense opérationnelle.",
    strict: true,
    input_schema: object({ label: { type: "string" }, amount_cents: { type: "integer" } }),
  },
  {
    name: "propose_shift",
    description: "Ajoute un créneau au planning d’un membre de l’équipe.",
    strict: true,
    input_schema: object({
      employee_name: { type: "string" },
      date: { type: "string", description: "AAAA-MM-JJ" },
      start: { type: "string", description: "HH:MM" },
      end: { type: "string", description: "HH:MM" },
    }),
  },
  {
    name: "propose_flash_promotion",
    description: "Lance une promotion flash en pourcentage sur un produit, pour quelques heures.",
    strict: true,
    input_schema: object({
      menu_id: { type: "string" },
      percent: { type: "integer" },
      hours: { type: "integer" },
    }),
  },
  {
    name: "propose_customer_message",
    description: "Prépare un email ou un SMS à un client (relance, offre, information). Rédige un message court et chaleureux.",
    strict: true,
    input_schema: object({
      client_name: { type: "string" },
      channel: { type: "string", enum: ["email", "sms"] },
      purpose: { type: "string", enum: ["relance", "offre", "information"] },
      body: { type: "string" },
    }),
  },
  {
    name: "ask_user",
    description:
      "Pose une question quand une information indispensable manque (prix, quantité, fournisseur, contact). pending_sentence est la demande complète à laquelle il ne manque que la réponse, ex. « Commande 3 kg de fraises chez ».",
    strict: true,
    input_schema: object({
      question: { type: "string" },
      pending_sentence: { type: "string" },
      options: { type: "array", items: { type: "string" } },
    }),
  },
  {
    name: "suggest_followups",
    description:
      "Propose une à trois prochaines demandes courtes, formulées comme l’utilisateur les dirait.",
    strict: true,
    input_schema: object({
      suggestions: { type: "array", items: { type: "string" } },
    }),
  },
];

const instructions = `Tu es Cuisine IA, l’assistant du logiciel de restaurant atacuisine. Tu parles français, au vouvoiement, comme un second de cuisine efficace : phrases courtes, concrètes, sans jargon technique.

Ton rôle :
- Répondre aux questions sur le service en cours, la carte, les stocks, les ventes, les réservations, à partir du contexte JSON fourni avec chaque question. Ne jamais inventer un chiffre absent du contexte.
- Expliquer le fonctionnement d’atacuisine à partir du guide ci-dessous, en citant les étapes.
- Préparer les actions demandées avec les outils propose_* : ils affichent une carte que l’utilisateur confirme. Tu ne dis jamais qu’une action est faite : dis qu’elle est prête à confirmer.
- Enchaîner sur la suite naturelle du service (après une commande : suivi cuisine puis règlement ; après un règlement : libérer la table) avec suggest_followups.
- Gérer le restaurant de bout en bout : achats et fournisseurs, réassort, réceptions, pertes, carte et recettes, clients et fidélité, dépenses, planning, promotions flash, messages clients.
- Si un élément existe déjà (ingrédient, fournisseur, produit, client), l’utiliser. S’il manque et peut être créé, le créer dans la même proposition (les outils le font). S’il manque une information que seul l’utilisateur connaît, poser la question avec ask_user, une seule question à la fois.
- Une même phrase peut contenir plusieurs demandes : appelle un outil par demande.
- Si la demande dépasse les droits de l’utilisateur (permissions du contexte), le dire simplement.

Règles :
- Les prix du contexte sont en centimes : affiche-les en euros (1250 → 12,50 €).
- Pour une commande, choisis le menu_id le plus proche du nom demandé ; si un plat n’existe pas, propose les plus proches au lieu d’inventer.
- Texte simple, listes courtes avec « • », gras avec **…** pour l’essentiel. Pas de tableau, pas de titre.
- Réponse orale possible : reste sous 90 mots sauf demande d’analyse détaillée.

# Guide d’utilisation d’atacuisine
`;

let systemCache: Anthropic.Beta.BetaTextBlockParam[] | undefined;
const system = () =>
  (systemCache ??= [
    {
      type: "text",
      text: instructions + guideDigest(),
      cache_control: { type: "ephemeral" },
    },
  ]);

function contextJson(ctx: AssistantContext) {
  return JSON.stringify({
    maintenant: ctx.now,
    restaurant: ctx.restaurant.name,
    utilisateur: ctx.user,
    permissions: ctx.permissions,
    ecrans: ctx.modules,
    carte: ctx.menu.map((m) => [m.id, m.name, m.category, m.price, m.enabled ? m.portions : "désactivé"]),
    tables: ctx.tables.map((t) => [t.number, t.capacity, t.status, t.zone]),
    commandes: ctx.orders.map((o) => ({
      id: o.id,
      table: o.table,
      statut: o.status,
      canal: o.channel,
      client: o.customer || undefined,
      depuis: o.created_at,
      produits: o.items.map((i) => [i.id, i.quantity, i.name, i.price, i.status]),
    })),
    stocks_sous_seuil: ctx.ingredients
      .filter((i) => i.available <= i.threshold * 1.5)
      .map((i) => [i.name, Math.round(i.available * 10) / 10, i.unit, i.threshold]),
    reservations: ctx.reservations.map((r) => [r.id, r.starts_at, r.name, r.guests, r.status]),
    encaisse_aujourdhui: ctx.paidToday,
    reglements_aujourdhui: ctx.paymentsToday,
    encaissements_par_jour: ctx.sales,
    nombre_clients: ctx.customers,
    fournisseurs: ctx.suppliers.map((x) => ({
      nom: x.name,
      contact: x.contact,
      delai_jours: x.lead_days,
      vend: x.ingredients.map((id) => ctx.ingredients.find((i) => i.id === id)?.name).filter(Boolean),
    })),
    ingredients: ctx.ingredients.map((i) => [i.name, Math.round(i.available * 10) / 10, i.unit, i.threshold]),
    livraisons_attendues: ctx.purchases.map((p) => [p.ingredient, p.quantity - p.received, p.unit, p.supplier, p.due_on]),
    equipe: ctx.employees.map((e) => [e.name, e.role]),
    clients: ctx.clients.slice(0, 120).map((c) => [c.name, c.points, c.consent ? "consentant" : "sans consentement"]),
  });
}

type Outcome = Answer & { usages: TokenUsage[]; model: string; costEur: number };

type Out = {
  proposals: Proposal[];
  suggestions: string[];
  navigate?: string;
  followUp?: string;
  question?: string;
};

function runTool(
  ctx: AssistantContext,
  block: Anthropic.Beta.BetaToolUseBlock,
  out: Out,
) {
  const input = block.input as Record<string, unknown>;
  const n = Number(input.table_number);
  const str = (k: string) => String(input[k] ?? "").trim();
  const amount = (k: string) => {
    const unit = str("unit");
    const q = Number(input[k]) || 0;
    return {
      quantity: q > 0 ? q * (unit === "kg" || unit === "l" ? 1000 : 1) : null,
      unit: (unit === "kg" ? "g" : unit === "l" ? "ml" : unit || null) as BaseUnit | null,
    };
  };
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const built: Step = (() => {
    switch (block.name) {
      case "propose_order":
        return orderProposal(
          ctx,
          n > 0 ? n : null,
          ((input.items as { menu_id: string; quantity: number; note: string }[]) ?? []).map(
            (i) => ({ menu: String(i.menu_id), quantity: Number(i.quantity), note: String(i.note ?? "") }),
          ),
          String(input.customer_name ?? ""),
        );
      case "propose_payment":
        return paymentProposal(ctx, n, input.method as "card" | "cash" | "other");
      case "propose_serve":
        return serveProposal(ctx, n);
      case "propose_item_status":
        return itemStatusProposal(
          ctx,
          (input.item_ids as string[]) ?? [],
          input.status as "preparing" | "ready" | "served" | "cancelled",
        );
      case "propose_table_status":
        return tableStatusProposal(ctx, n, input.status as "free" | "cleaning" | "unavailable");
      case "propose_reservation_status":
        return reservationProposal(
          ctx,
          String(input.reservation_id),
          input.status as "confirmed" | "arrived" | "declined" | "cancelled" | "no_show",
        );
      case "open_module": {
        const target = String(input.module);
        if (!ctx.modules.includes(target)) return { reply: "Écran non accessible à ce profil." };
        out.navigate = target;
        return { reply: `Écran ${target} ouvert.` };
      }
      case "propose_purchase": {
        const a = amount("quantity");
        return purchaseStep(ctx, {
          item: str("ingredient_name"),
          quantity: a.quantity,
          unit: a.unit,
          supplier: str("supplier_name") || undefined,
          contact: str("supplier_contact") || undefined,
          due: date(str("due_date")),
        });
      }
      case "propose_restock":
        return restockStep(ctx);
      case "propose_receive":
        return receiveStep(ctx, str("ingredient_name"), date(str("expires")));
      case "propose_waste": {
        const a = amount("quantity");
        return wasteStep(ctx, str("ingredient_name"), a.quantity, a.unit, str("reason") || "Perte déclarée à Cuisine IA");
      }
      case "propose_supplier": {
        const sells = ((input.sells as string[]) ?? []).map((x) => String(x).trim()).filter(Boolean);
        const existing = ctx.suppliers.find((x) => x.name.toLowerCase() === str("name").toLowerCase());
        return existing ? linkStep(ctx, existing.id, sells) : supplierStep(ctx, str("name"), str("contact"), sells);
      }
      case "propose_product": {
        const lines = ((input.ingredients as { name: string; quantity: number; unit: string }[]) ?? []).map((i) => ({
          item: String(i.name),
          quantity: Number(i.quantity) * (i.unit === "kg" || i.unit === "l" ? 1000 : 1),
          unit: (i.unit === "kg" ? "g" : i.unit === "l" ? "ml" : i.unit) as BaseUnit,
        }));
        const price = Number(input.price_cents);
        return productStep(ctx, { name: str("name"), price: price > 0 ? price : null, category: str("category"), lines, original: `Ajoute le plat ${str("name")}` });
      }
      case "propose_menu_update": {
        const m = ctx.menu.find((x) => x.id === str("menu_id")) ?? findMenu(ctx, str("menu_id"));
        if (!m) return { reply: "Produit introuvable." };
        const price = Number(input.price_cents);
        const availability = str("availability");
        return menuEditStep(ctx, m.name, {
          price: price >= 0 ? price : undefined,
          enabled: availability === "on" ? true : availability === "off" ? false : undefined,
        });
      }
      case "propose_customer":
        return customerStep(ctx, str("name"), str("contact"), input.consent === true, `Ajoute le client ${str("name")}`);
      case "propose_loyalty":
        return loyaltyStep(ctx, str("client_name"), Math.trunc(Number(input.points)) || 0, str("reason") || "Geste fidélité");
      case "propose_expense":
        return expenseStep(ctx, str("label"), Number(input.amount_cents) > 0 ? Math.round(Number(input.amount_cents)) : null, "Ajoute une dépense");
      case "propose_shift": {
        const t = (v: string) => {
          const m = v.match(/^(\d{1,2}):(\d{2})$/);
          return m ? ([Number(m[1]), Number(m[2])] as const) : null;
        };
        const start = t(str("start")), end = t(str("end"));
        return shiftStep(ctx, str("employee_name"), date(str("date")), start && end ? { start, end } : null, `Planifie ${str("employee_name")}`);
      }
      case "propose_flash_promotion": {
        const m = ctx.menu.find((x) => x.id === str("menu_id"));
        return flashStep(ctx, m?.name ?? str("menu_id"), Number(input.percent) || null, null, Number(input.hours) || 2);
      }
      case "propose_customer_message": {
        const c = findClient(ctx, str("client_name"));
        return messageStep(ctx, c?.name ?? str("client_name"), str("channel") === "sms" ? "sms" : "email", (["relance", "offre", "information"].includes(str("purpose")) ? str("purpose") : "information") as "relance" | "offre" | "information", str("body") || undefined);
      }
      case "ask_user":
        out.followUp = str("pending_sentence") || undefined;
        out.suggestions = ((input.options as string[]) ?? []).slice(0, 4).map((x) => String(x).slice(0, 80));
        out.question = str("question");
        return { reply: "Question posée à l’utilisateur. Arrête-toi là et attends sa réponse." };
      case "suggest_followups":
        out.suggestions = ((input.suggestions as string[]) ?? []).slice(0, 3).map((s) => String(s).slice(0, 80));
        return { reply: "Suggestions affichées." };
      default:
        return { reply: "Outil inconnu." };
    }
  })();
  if ("proposal" in built && built.proposal) {
    out.proposals.push(built.proposal);
    return {
      content: `Carte « ${built.proposal.title} » affichée à l’utilisateur, en attente de sa confirmation. ${built.reply}`,
      error: false,
    };
  }
  if (built.ask) {
    out.followUp = built.ask.followUp;
    out.suggestions = built.ask.options;
    out.question = built.reply;
    return { content: `Question posée à l’utilisateur : « ${built.reply} ». Attends sa réponse.`, error: false };
  }
  const failed = block.name.startsWith("propose_");
  return { content: built.reply, error: failed };
}

export async function askLlm(
  question: string,
  history: Turn[],
  ctx: AssistantContext,
): Promise<Outcome> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-8).map((t) => ({ role: t.role, content: t.content.slice(0, 1500) })),
    {
      role: "user",
      content: `<contexte>${contextJson(ctx)}</contexte>\n\n${question}`,
    },
  ];
  if (messages[0]?.role !== "user") messages.shift();
  const out: Out = {
    proposals: [],
    suggestions: [],
  };
  const usages: TokenUsage[] = [];
  const texts: string[] = [];
  let model = llmModel();
  for (let round = 0; round < 4; round++) {
    const response = await anthropic().beta.messages.create({
      model: llmModel(),
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: system(),
      tools,
      messages,
    });
    model = response.model;
    usages.push(response.usage);
    if (response.stop_reason === "refusal") {
      texts.push("Je ne peux pas répondre à cette demande.");
      break;
    }
    for (const block of response.content)
      if (block.type === "text" && block.text.trim()) texts.push(block.text.trim());
    const calls = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || !calls.length) break;
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: calls.map((call) => {
        const result = runTool(ctx, call, out);
        return {
          type: "tool_result" as const,
          tool_use_id: call.id,
          content: result.content,
          is_error: result.error,
        };
      }),
    });
    // Question posée : on attend l’utilisateur, inutile de relancer le modèle.
    if (out.question) {
      if (!texts.some((t) => t.includes(out.question!))) texts.push(out.question);
      break;
    }
    // Si seules des suggestions ou une navigation restent, inutile de relancer.
    if (calls.every((c) => ["suggest_followups", "open_module"].includes(c.name)) && texts.length) break;
  }
  return {
    reply: texts.join("\n\n") || (out.proposals.length ? "Voici ce que je vous propose :" : "Je n’ai pas de réponse utile à cette question."),
    proposals: out.proposals,
    suggestions: out.suggestions,
    links: [],
    navigate: out.navigate,
    followUp: out.followUp,
    usages,
    model,
    costEur: providerCostEur(model, usages),
  };
}
