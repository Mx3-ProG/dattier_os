/**
 * Étapes à valider par code PIN, côté interface. Miroir de `pinStep` (src/lib/actions.ts),
 * qui reste l’autorité : le serveur refuse toute étape sans PIN valide quand il est exigé.
 */
export function requiresPin(action: Record<string, unknown>) {
  switch (action.action) {
    case "order": {
      const data = action.data as { channel?: string } | undefined;
      return (data?.channel ?? "staff") === "staff";
    }
    case "pay":
    case "confirmOrder":
      return true;
    case "item":
      return action.status === "cancelled";
    default:
      return false;
  }
}

export const pinStepLabel = (action: Record<string, unknown>) =>
  action.action === "order"
    ? "Valider la prise de commande"
    : action.action === "pay"
      ? "Valider l’encaissement"
      : action.action === "item"
        ? "Valider l’annulation"
        : action.accept
          ? "Valider l’acceptation de la commande"
          : "Valider le refus de la commande";
