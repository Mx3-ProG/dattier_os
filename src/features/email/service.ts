import { z } from "zod";
import { rows, type DB } from "@/lib/database/db";
import { scope, type Actor } from "@/lib/auth/session";
import { can, requirePermission } from "@/lib/permissions";
import { requirePaidAddon } from "@/features/platform/entitlements";
import { demoEnabled } from "@/lib/database/db";
import { asEmail } from "@/features/messaging/contact";
import { readBrandSettings, readTemplates, resetTemplate, saveBrandSettings, saveTemplate, setAutomation } from "./branding/service";
import { templateContentSchema } from "./branding/templates";
import { platformStatus, readTransport, saveTransport } from "./smtp/service";
import { DAILY_LIMIT, queueMessages } from "./engine/queue";
import { scheduleEmailDelivery } from "./index";

/**
 * Service applicatif de l'écran « Emails » : compose les trois briques pour un
 * membre de l'établissement. Les droits sont vérifiés ici (rôle) et en base (RLS).
 */
export const EMAIL_ADDON = "email-automation";

async function access(db: DB, user: Actor, restaurant: string) {
  const member = await scope(db, user, restaurant);
  const roles = member.roles ?? member.role;
  if (!can(roles, "customers") && !can(roles, "settings"))
    throw new Error("Accès réservé aux responsables de la relation client.");
  await requirePaidAddon(db, restaurant, EMAIL_ADDON);
  return { roles, canSend: can(roles, "customers"), canConfigure: can(roles, "settings") };
}

type Audience = { id: string; name: string; email: string; consent: boolean };
async function audience(db: DB, restaurant: string): Promise<Audience[]> {
  const list = await rows<{ id: string; name: string; contact: string | null; account_email: string | null; consent: boolean; marketing_consent: boolean | null }>(
    db,
    `SELECT c.id,c.name,c.contact,oc.email AS account_email,c.consent,oc.marketing_consent
     FROM customers c LEFT JOIN organization_customers oc ON oc.id=c.account_id
     WHERE c.restaurant_id=$1 ORDER BY c.name LIMIT 2000`,
    [restaurant],
  );
  return list.flatMap((row) => {
    const email = asEmail(row.contact) ?? asEmail(row.account_email);
    return email ? [{ id: row.id, name: row.name, email, consent: !!row.consent || !!row.marketing_consent }] : [];
  });
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

export async function emailState(db: DB, user: Actor, restaurant: string) {
  const rights = await access(db, user, restaurant);
  const [restaurantRow] = await rows<{ name: string }>(db, "SELECT name FROM restaurants WHERE id=$1", [restaurant]);
  const [stats] = await rows<{ sent: number; demo: number; failed: number; queued: number; today: number }>(
    db,
    `SELECT count(*) FILTER (WHERE status='sent' AND created_at>now()-interval '30 days')::int AS sent,
            count(*) FILTER (WHERE status='demo' AND created_at>now()-interval '30 days')::int AS demo,
            count(*) FILTER (WHERE status='error' AND created_at>now()-interval '30 days')::int AS failed,
            count(*) FILTER (WHERE status IN ('queued','sending'))::int AS queued,
            count(*) FILTER (WHERE created_at>now()-interval '1 day')::int AS today
     FROM email_messages WHERE restaurant_id=$1`,
    [restaurant],
  );
  return {
    restaurant: restaurantRow?.name ?? "",
    demo: demoEnabled(),
    rights: { canSend: rights.canSend, canConfigure: rights.canConfigure },
    dailyLimit: DAILY_LIMIT,
    stats,
    brand: await readBrandSettings(db, restaurant),
    templates: await readTemplates(db, restaurant),
    transport: await readTransport(db, restaurant),
    platform: platformStatus(),
    audience: rights.canSend ? await audience(db, restaurant) : [],
    messages: await rows<{ id: string; origin: string; template_key: string; recipient: string; subject: string | null; status: string; transport: string | null; error: string | null; created_at: string; sent_at: string | null }>(
      db,
      `SELECT id,origin,template_key,recipient,subject,status,transport,error,created_at,sent_at
       FROM email_messages WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 80`,
      [restaurant],
    ),
  };
}
export type EmailState = Awaited<ReturnType<typeof emailState>>;

const content = templateContentSchema.optional();
export const emailActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("brand"), brand: z.unknown() }),
  z.object({ action: z.literal("transport"), transport: z.unknown() }),
  z.object({ action: z.literal("template"), template: z.unknown() }),
  z.object({ action: z.literal("automation"), key: z.string().max(64), enabled: z.boolean() }),
  z.object({ action: z.literal("reset-template"), key: z.string().max(64) }),
  z.object({ action: z.literal("test"), email: z.email().max(254), templateKey: z.string().max(64), content }),
  z.object({
    action: z.literal("send"),
    templateKey: z.string().max(64),
    content,
    audience: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("customers"), ids: z.array(z.string().min(1).max(80)).min(1).max(500) }),
      z.object({ kind: z.literal("consenting") }),
    ]),
  }),
]);

/** Exécute une action ; retourne l'identifiant d'un email de test à livrer immédiatement. */
export async function emailPerform(db: DB, user: Actor, restaurant: string, raw: unknown): Promise<{ testId?: string; queued?: number }> {
  try {
    return await perform(db, user, restaurant, raw);
  } catch (error) {
    // Message lisible du premier champ refusé, plutôt qu'un « Données invalides » générique.
    if (error instanceof z.ZodError) throw new Error(error.issues[0]?.message || "Données invalides.");
    throw error;
  }
}

async function perform(db: DB, user: Actor, restaurant: string, raw: unknown): Promise<{ testId?: string; queued?: number }> {
  const action = emailActionSchema.parse(raw);
  const rights = await access(db, user, restaurant);
  const need = (permission: "customers" | "settings") => requirePermission(rights.roles, permission);
  switch (action.action) {
    case "brand":
      need("settings");
      await saveBrandSettings(db, restaurant, user.id, action.brand);
      return {};
    case "transport":
      need("settings");
      await saveTransport(db, restaurant, user.id, action.transport);
      return {};
    case "template":
      need("customers");
      await saveTemplate(db, restaurant, user.id, action.template);
      return {};
    case "automation":
      need("customers");
      await setAutomation(db, restaurant, user.id, action.key, action.enabled);
      return {};
    case "reset-template":
      need("customers");
      await resetTemplate(db, restaurant, user.id, action.key);
      return {};
    case "test": {
      need("customers");
      const [id] = await queueMessages(db, restaurant, user.id, "test", await usableTemplate(db, restaurant, action.templateKey),
        [{ email: action.email }], { client: firstName(user.name ?? "") || "Camille", _content: action.content });
      return { testId: id };
    }
    case "send": {
      need("customers");
      const key = await usableTemplate(db, restaurant, action.templateKey);
      const template = (await readTemplates(db, restaurant)).find((entry) => entry.key === key)!;
      const people = await audience(db, restaurant);
      let selected = action.audience.kind === "consenting"
        ? people.filter((person) => person.consent)
        : people.filter((person) => (action.audience as { ids: string[] }).ids.includes(person.id));
      // Prospection : uniquement les clients qui ont donné leur accord (RGPD, CPCE L34-5).
      if (template.category === "marketing") selected = selected.filter((person) => person.consent);
      if (!selected.length)
        throw new Error(template.category === "marketing"
          ? "Aucun destinataire n'a accepté de recevoir vos offres."
          : "Aucun destinataire avec une adresse email valide.");
      if (selected.length > 500) throw new Error("500 destinataires au plus par envoi.");
      const ids = await queueMessages(db, restaurant, user.id, "manual", key,
        selected.map((person) => ({ email: person.email, customerId: person.id, vars: { client: firstName(person.name) } })),
        { _content: action.content });
      scheduleEmailDelivery(restaurant);
      return { queued: ids.length };
    }
  }
}

async function usableTemplate(db: DB, restaurant: string, key: string) {
  const templates = await readTemplates(db, restaurant);
  if (!templates.some((template) => template.key === key)) throw new Error("Modèle introuvable.");
  return key;
}
