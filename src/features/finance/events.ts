import { on } from "@/features/events/bus";
import { processPayment } from "./books";

/**
 * Réactions du module Finance aux événements inter-modules.
 *
 * `payment.declared` : une déclaration de paiement a été créée par un autre
 * module (commandes, boutique). La finance la traite (écriture comptable)
 * de façon synchrone pour rester dans la transaction.
 */
on("payment.declared", async (db, business, payload) => {
  const declaration = payload.declaration;
  if (typeof declaration === "string" && declaration)
    await processPayment(db, String(business), declaration);
});
