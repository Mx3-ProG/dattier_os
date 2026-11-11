import { after } from "next/server";
import { getDb, type DB } from "@/lib/database/db";
import { withDatabaseContext } from "@/lib/database/context";
import { asEmail } from "@/features/messaging/contact";
import { createEngine, type Run } from "./engine/deliver";
import { triggerEmail } from "./engine/queue";
import { renderMessage } from "./branding/compose";
import { resolveTransport } from "./smtp/transports";

/**
 * Contrat public du module « Emails automatiques ». Les autres modules n'importent que
 * ce fichier, jamais ses briques internes :
 *
 *   engine/   moteur d'envoi : file, réservation, livraison hors transaction ;
 *   branding/ personnalisation : identité visuelle, modèles, rendu ;
 *   smtp/     configuration SMTP : plateforme (Supabase) ou serveur de l'établissement.
 *
 * Ce fichier est le seul endroit qui branche les trois briques ensemble.
 */
export const emailEngine = createEngine({ render: renderMessage, transport: resolveTransport });

/** Exécuteur sans session utilisateur, limité à un établissement (worker, après réponse). */
export const tenantRun = (restaurant: string): Run => (fn) =>
  withDatabaseContext({ restaurantId: restaurant, public: true }, async () => (await getDb()).transaction(fn));

/** Vide la file d'un établissement. Ne lève jamais : un échec reste tracé sur le message. */
export async function drainEmails(restaurant: string, options: { only?: string; max?: number } = {}) {
  try {
    return await emailEngine.deliver(tenantRun(restaurant), restaurant, options);
  } catch (error) {
    console.error("Envoi des emails reporté", restaurant, (error as Error).message);
    return [];
  }
}

/**
 * Programme l'envoi juste après la réponse HTTP (transaction validée), sans attendre
 * le worker : indispensable sur un hébergement sans processus de fond. Hors requête
 * (worker, script), l'appel est ignoré : le job `email_send` prend le relais.
 */
export function scheduleEmailDelivery(restaurant: string) {
  try {
    after(() => drainEmails(restaurant).then(() => undefined));
  } catch {
    /* hors contexte de requête : le worker enverra le message */
  }
}

/**
 * Point d'entrée des autres modules : « tel événement vient de se produire ».
 * Sans add-on actif ou automatisation activée, rien n'est envoyé ni enregistré.
 * Ne fait jamais échouer l'opération métier appelante.
 */
export async function emitEmailEvent(
  db: DB,
  restaurant: string,
  event: string,
  recipient: string | null | undefined,
  vars: Record<string, unknown>,
  customerId?: string | null,
) {
  const address = asEmail(recipient);
  if (!address) return null;
  const id = await triggerEmail(db, restaurant, event, address, vars, customerId);
  if (id) scheduleEmailDelivery(restaurant);
  return id;
}
