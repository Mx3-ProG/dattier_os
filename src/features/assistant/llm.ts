/* IA générative de Cuisine IA (Claude, via le SDK officiel Anthropic).
   Le modèle voit un résumé du service limité aux droits de l’utilisateur et le
   guide complet. Il ne modifie jamais les données : ses outils fabriquent des
   propositions que l’utilisateur confirme dans le poste. */
import Anthropic from "@anthropic-ai/sdk";
import { guideDigest } from "./knowledge";
import { navigation } from "./reflex";
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
    ventes_par_jour: ctx.sales,
    nombre_clients: ctx.customers,
  });
}

type Outcome = Answer & { usages: TokenUsage[]; model: string; costEur: number };

function runTool(
  ctx: AssistantContext,
  block: Anthropic.Beta.BetaToolUseBlock,
  out: { proposals: Proposal[]; suggestions: string[]; navigate?: string },
) {
  const input = block.input as Record<string, unknown>;
  const n = Number(input.table_number);
  const built = (() => {
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
  const out: { proposals: Proposal[]; suggestions: string[]; navigate?: string } = {
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
    // Si seules des suggestions ou une navigation restent, inutile de relancer.
    if (calls.every((c) => ["suggest_followups", "open_module"].includes(c.name)) && texts.length) break;
  }
  return {
    reply: texts.join("\n\n") || (out.proposals.length ? "Voici ce que je vous propose :" : "Je n’ai pas de réponse utile à cette question."),
    proposals: out.proposals,
    suggestions: out.suggestions,
    links: [],
    navigate: out.navigate,
    usages,
    model,
    costEur: providerCostEur(model, usages),
  };
}
