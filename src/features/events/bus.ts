import type { DB } from "@/infrastructure/database/db";
import type { BusinessId } from "@/core/tenant/business";
import { enqueue } from "@/features/platform/jobs";

/**
 * Bus d'événements inter-modules.
 *
 * Un module émet un événement (`emit` ou `emitSync`) ; les modules qui s'y
 * intéressent s'y abonnent (`on`). L'émetteur ne connaît pas ses récepteurs :
 * c'est le seul couplage runtime toléré entre modules.
 *
 * Deux modes :
 *  - `emit`     : persiste l'événement dans l'outbox (transactionnel), dispatché
 *                 par le worker. À privilégier pour tout effet de bord non
 *                 critique (email, rebuild, analytics).
 *  - `emitSync` : exécute les handlers dans la transaction courante. À réserver
 *                 aux réactions qui doivent être atomiques avec l'action
 *                 (décrément de stock, écriture comptable).
 */

export type EventPayload = Record<string, unknown>;

export type EventHandler = (
  db: DB,
  business: BusinessId,
  payload: EventPayload,
) => Promise<void>;

const handlers = new Map<string, EventHandler[]>();

/** Abonnement d'un handler à un type d'événement. */
export function on(type: string, handler: EventHandler): void {
  const list = handlers.get(type) ?? [];
  list.push(handler);
  handlers.set(type, list);
}

/** Liste des types abonnés (utile pour le worker et les tests). */
export function registeredTypes(): string[] {
  return [...handlers.keys()];
}

/** Nombre de handlers pour un type (0 = personne n'écoute). */
export function handlerCount(type: string): number {
  return handlers.get(type)?.length ?? 0;
}

/** Exécution synchrone dans la transaction courante. */
/**
 * Les abonnements vivent dans `registry.ts`, chargé par le worker. Un
 * émetteur qui n'a pas chargé le registre ne déclencherait aucun
 * récepteur : on le charge donc au premier envoi.
 */
let registryLoaded = false;
async function ensureRegistry() {
  if (registryLoaded) return;
  registryLoaded = true;
  await import("./registry");
}

export async function emitSync(
  db: DB,
  business: BusinessId,
  type: string,
  payload: EventPayload = {},
  key?: string,
): Promise<void> {
  await ensureRegistry();
  const list = handlers.get(type) ?? [];
  for (const handler of list) {
    await handler(db, business, payload);
  }
}

/** Persistance transactionnelle : dispatché par le worker. */
export async function emit(
  db: DB,
  business: BusinessId,
  type: string,
  payload: EventPayload = {},
  key?: string,
): Promise<string> {
  const dedupKey = key ?? `${type}:${JSON.stringify(payload)}`.slice(0, 80);
  return enqueue(db, business, "event", dedupKey, { type, ...payload });
}

/** Dispatch d'un job `event` déjà réclamé par le worker. */
export async function dispatch(
  db: DB,
  business: BusinessId,
  payload: EventPayload,
): Promise<void> {
  const type = String(payload.type ?? "");
  const list = handlers.get(type) ?? [];
  for (const handler of list) {
    await handler(db, business, payload);
  }
}
