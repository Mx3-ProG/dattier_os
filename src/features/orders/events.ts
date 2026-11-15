import { on } from "@/features/events/bus";
import { notify } from "./service";
/**
 * Réactions du module Commandes à ses propres événements.
 *
 * Ici : la notification « nouvelle commande » n'est plus insérée directement
 * dans `createOrder` ; elle est émise comme événement `order.created` et
 * traitée de façon synchrone (emitSync) pour rester dans la transaction.
 */
on("order.created", async (db, business, payload) => {
  const message = payload.message;
  if (typeof message === "string" && message.trim())
    await notify(db, String(business), message);
});
