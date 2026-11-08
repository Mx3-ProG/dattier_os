/* Orchestration de Cuisine IA : contexte, choix du moteur, débit des crédits.
   Le moteur réflexe répond dans la même transaction. L’IA générative tourne
   hors transaction (plusieurs secondes), puis le coût réel est débité. */
import { z } from "zod";
import { authenticated, rateLimit } from "@/features/platform/http";
import { snapshot } from "@/lib/snapshot";
import { can, type Permission } from "@/lib/permissions";
import type { DB } from "@/lib/database/db";
import type { Actor } from "@/lib/auth/session";
import { askLlm, llmEnabled, llmModel } from "./llm";
import {
  creditValueEur,
  llmCredits,
  lowBalance,
  minimumLlmCredits,
  packs,
  reflexCredits,
  welcomeCredits,
} from "./pricing";
import { reflex } from "./reflex";
import { assistantContext, type AssistantContext, type AssistantReply } from "./types";

const permissions: Permission[] = [
  "security", "website", "catalog", "payments", "orders", "kitchen", "bar", "stock",
  "purchases", "finance", "team", "customers", "settings", "audit", "reservations", "floor",
];
/** Écrans du poste et permission requise (même règle que components/workspace.tsx). */
const modules: [string, Permission | null][] = [
  ["overview", "finance"], ["activity", "audit"], ["dining", "orders"], ["orders", "orders"],
  ["kitchen", "kitchen"], ["bar", "bar"], ["reservations", "reservations"], ["stocks", "stock"],
  ["recipes", "stock"], ["suppliers", "purchases"], ["deliveries", "purchases"], ["team", "team"],
  ["attendance", null], ["finance", "finance"], ["accounting", "finance"], ["expenses", "finance"], ["customers", "customers"],
  ["menu", "catalog"], ["settings", "settings"],
];

export const askSchema = z.object({
  kind: z.literal("ask"),
  message: z.string().trim().max(800),
  voice: z.boolean().default(false),
  /** Phrase en attente que ce message complète (question posée par Cuisine IA). */
  followUp: z.string().trim().max(300).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(16)
    .default([]),
});
export const packSchema = z.object({
  kind: z.literal("pack"),
  pack: z.enum(packs.map((p) => p.id) as [string, ...string[]]),
});

async function wallet(db: DB, restaurant: string) {
  const { rows } = await db.query<{ balance: number; admin: boolean }>(
    "SELECT balance, admin FROM app.ai_wallet($1)",
    [restaurant],
  );
  if (!rows[0]) throw new Error("Accès non autorisé.");
  return rows[0];
}

async function consume(
  db: DB,
  restaurant: string,
  amount: number,
  engine: string,
  detail: string,
  costEur = 0,
  partial = false,
) {
  const { rows } = await db.query<{ balance: number }>(
    "SELECT app.ai_consume($1,$2,$3,$4,$5,$6) AS balance",
    [restaurant, amount, engine, detail.slice(0, 300), Math.round(costEur * 1_000_000), partial],
  );
  return rows[0].balance;
}

async function buildContext(db: DB, restaurant: string, user: Actor, balance: number) {
  const s = await snapshot(db, user, restaurant);
  const roles = s.user.roles ?? s.user.role;
  const allowed = (p: Permission) =>
    (s.plan >= 69 || !["finance", "customers", "website"].includes(p)) && can(roles, p);
  return assistantContext(
    s,
    modules.filter(([, p]) => !p || allowed(p)).map(([id]) => id),
    permissions.filter(allowed),
    balance,
  );
}

export async function assistantState(db: DB, restaurant: string) {
  const [w, history, pending] = await Promise.all([
    wallet(db, restaurant),
    db.query("SELECT * FROM app.ai_history($1,15)", [restaurant]),
    db.query("SELECT * FROM app.ai_pending_packs($1)", [restaurant]),
  ]);
  return {
    balance: w.balance,
    admin: w.admin,
    lowBalance,
    welcomeCredits,
    reflexCredits,
    llm: llmEnabled(),
    model: llmEnabled() ? llmModel() : null,
    creditValueEur,
    packs,
    history: history.rows,
    pending: pending.rows,
  };
}

export async function requestPack(db: DB, restaurant: string, pack: string) {
  const offer = packs.find((p) => p.id === pack)!;
  const w = await wallet(db, restaurant);
  if (!w.admin)
    throw new Error("Recharge réservée aux administrateurs de l’organisation.");
  const pending = await db.query("SELECT id FROM app.ai_pending_packs($1)", [restaurant]);
  if (pending.rows.length >= 3)
    throw new Error("Trois demandes de recharge sont déjà en attente.");
  await db.query("SELECT app.ai_request_pack($1,$2,$3,$4)", [
    restaurant,
    offer.id,
    offer.credits,
    offer.priceCents,
  ]);
  return assistantState(db, restaurant);
}

const refill = (balance: number) =>
  balance < lowBalance ? ["Recharger mes crédits"] : [];

export async function ask(
  restaurant: string,
  input: z.infer<typeof askSchema>,
): Promise<AssistantReply> {
  const first = await authenticated(restaurant, async (db, user) => {
    await rateLimit(db, `assistant:${user.id}`, 30);
    const w = await wallet(db, restaurant);
    const ctx = await buildContext(db, restaurant, user, w.balance);
    // Une réponse courte (« Primeurs Martin », « 3 kilos ») complète la question
    // en attente ; une nouvelle demande complète (« chiffre du jour ») passe avant.
    const alone = reflex(input.message, ctx);
    const local =
      input.followUp && (!alone || alone.engine === "free")
        ? (reflex(`${input.followUp} ${input.message}`, ctx) ?? alone)
        : alone;
    if (local) {
      if (local.engine === "free")
        return { done: { ...local, credits: 0, balance: w.balance } };
      if (w.balance < reflexCredits) throw new Error("Crédits Cuisine IA insuffisants.");
      const balance = await consume(db, restaurant, reflexCredits, "reflex", input.message);
      return {
        done: {
          ...local,
          suggestions: [...local.suggestions, ...refill(balance)].slice(0, 4),
          credits: reflexCredits,
          balance,
        },
      };
    }
    return { ctx, balance: w.balance };
  });
  if ("done" in first && first.done) return first.done as AssistantReply;
  const { ctx, balance } = first as { ctx: AssistantContext; balance: number };
  if (!llmEnabled())
    return {
      reply:
        "Je n’ai pas compris cette demande avec le moteur réflexe, et l’IA avancée n’est pas activée sur cette installation (clé ANTHROPIC_API_KEY absente). Essayez une formulation comme « Commande table 4 : deux couscous » ou « Stocks bas ». Aucun crédit n’a été utilisé.",
      proposals: [],
      suggestions: ["Que sais-tu faire ?", "Commandes en cours", "Chiffre du jour"],
      links: [{ label: "Guide d’utilisation", href: "/guide" }],
      engine: "none",
      credits: 0,
      balance,
    };
  if (balance < minimumLlmCredits)
    throw new Error("Crédits Cuisine IA insuffisants pour une analyse avancée.");
  const outcome = await askLlm(
    input.followUp ? `${input.message}\n(En réponse à ta question : « ${input.followUp} … »)` : input.message,
    input.history,
    ctx,
  );
  const credits = llmCredits(outcome.costEur);
  const after = await authenticated(restaurant, (db) =>
    consume(db, restaurant, credits, outcome.model, input.message, outcome.costEur, true),
  );
  return {
    reply: outcome.reply,
    proposals: outcome.proposals,
    suggestions: [...outcome.suggestions, ...refill(after)].slice(0, 4),
    links: outcome.links,
    navigate: outcome.navigate,
    followUp: outcome.followUp,
    engine: "llm",
    credits: Math.min(credits, balance),
    balance: after,
  };
}
