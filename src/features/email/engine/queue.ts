import { randomUUID } from "node:crypto";
import { rows, type DB } from "@/lib/database/db";
import { enqueue } from "@/features/platform/jobs";

/**
 * Mise en file, toujours dans la transaction de l'appelant : le message n'existe que si
 * l'opération qui le déclenche est validée. Aucun appel réseau ici (voir deliver.ts).
 */
export const EMAIL_JOB = "email_send";
/** Plafond quotidien par établissement, identique à app.email_trigger. */
export const DAILY_LIMIT = 1000;

const scalar = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 2000) : typeof value === "number" || typeof value === "boolean" ? String(value) : null;

/** Variables d'un modèle : chaînes courtes uniquement, jamais d'objet imbriqué. */
export function cleanVars(vars: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars).slice(0, 40)) {
    const text = scalar(value);
    if (/^[a-z][a-z0-9_]{0,40}$/.test(key) && text !== null) out[key] = text;
  }
  return out;
}

/** Déclenchement automatique depuis un autre module (ne lève jamais d'erreur SQL). */
export async function triggerEmail(
  db: DB,
  restaurant: string,
  trigger: string,
  recipient: string | null | undefined,
  vars: Record<string, unknown>,
  customerId?: string | null,
) {
  if (!recipient) return null;
  const [row] = await rows<{ id: string | null }>(
    db,
    "SELECT app.email_trigger($1,$2,$3,$4,$5::jsonb) AS id",
    [restaurant, trigger, recipient, customerId ?? null, JSON.stringify(cleanVars(vars))],
  );
  return row?.id ?? null;
}

/** Envoi manuel ou test, par un membre autorisé (RLS : add-on installé, établissement ouvert). */
export async function queueMessages(
  db: DB,
  restaurant: string,
  actor: string,
  origin: "manual" | "test",
  templateKey: string,
  recipients: readonly { email: string; customerId?: string | null; vars?: Record<string, unknown> }[],
  shared: Record<string, unknown>,
) {
  const [{ count }] = await rows<{ count: number }>(
    db,
    "SELECT count(*)::int AS count FROM email_messages WHERE restaurant_id=$1 AND created_at>now()-interval '1 day'",
    [restaurant],
  );
  if (count + recipients.length > DAILY_LIMIT)
    throw new Error(`Limite de ${DAILY_LIMIT} emails par jour atteinte pour cet établissement.`);
  const ids: string[] = [];
  for (const recipient of recipients) {
    const id = randomUUID();
    await db.query(
      `INSERT INTO email_messages(id,restaurant_id,origin,template_key,recipient,customer_id,vars,actor)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [id, restaurant, origin, templateKey, recipient.email.toLowerCase(), recipient.customerId ?? null,
        JSON.stringify({ ...cleanVars(shared), ...cleanVars(recipient.vars ?? {}), ...pickContent(shared) }), actor],
    );
    await enqueue(db, restaurant, EMAIL_JOB, id, { message: id });
    ids.push(id);
  }
  return ids;
}

/** Contenu modifié à la main pour un envoi : conservé tel quel sous `_content`. */
function pickContent(shared: Record<string, unknown>) {
  const content = shared._content;
  return content && typeof content === "object" ? { _content: content } : {};
}
