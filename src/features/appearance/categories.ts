import { classifyAudit } from "@/features/ops-security/classify";

export const activityCategories = {
  pilotage: { label: "Pilotage", color: "#52617c" },
  operations: { label: "Opérations", color: "#2563b8" },
  management: { label: "Gestion", color: "#087e83" },
  team: { label: "Équipe", color: "#7950b5" },
  finance: { label: "Finances", color: "#9a6418" },
  customers: { label: "Relation client", color: "#b73578" },
  configuration: { label: "Configuration et sécurité", color: "#526447" },
} as const;
export type ActivityCategory = keyof typeof activityCategories;
export const defaultCategoryColors = Object.fromEntries(
  Object.entries(activityCategories).map(([key, value]) => [key, value.color]),
) as Record<ActivityCategory, string>;
export function moduleCategory(module: string): ActivityCategory {
  if (["orders", "dining", "kitchen", "bar", "reservations"].includes(module) || module.startsWith("tool-"))
    return "operations";
  if (
    [
      "stock",
      "stocks",
      "inventory",
      "recipes",
      "purchases",
      "suppliers",
      "deliveries",
    ].includes(module)
  )
    return "management";
  if (["team", "attendance"].includes(module)) return "team";
  if (["finance", "expenses", "payments"].includes(module)) return "finance";
  if (["customers", "loyalty", "shop"].includes(module)) return "customers";
  if (
    [
      "settings",
      "security",
      "auth",
      "catalog",
      "menu",
      "site",
      "seo",
      "domains",
      "integrations",
      "reconciliation",
    ].includes(module)
  )
    return "configuration";
  return "pilotage";
}
const actionLabels: Record<string, string> = {
  clock: "Pointage de l’équipe",
  shift: "Planning mis à jour",
  deleteShift: "Créneau retiré du planning",
  purchase: "Achat enregistré",
  receive: "Livraison réceptionnée",
  supplier: "Fournisseur mis à jour",
  read: "Notifications marquées comme lues",
  order: "Commande enregistrée",
  confirmOrder: "Commande confirmée",
  table: "Table mise à jour",
  checkout: "Commande finalisée",
  item: "Préparation mise à jour",
  transition: "État de préparation modifié",
  stock: "Stock mis à jour",
  lot: "Lot de stock enregistré",
  ingredient: "Ingrédient enregistré",
  ingredientLifecycle: "Ingrédient mis à jour",
  recipe: "Recette mise à jour",
  recipeRemove: "Recette retirée",
  expense: "Dépense enregistrée",
  pay: "Paiement enregistré",
  payment: "Paiement enregistré",
  settle: "Règlement enregistré",
  reservation: "Réservation mise à jour",
  customer: "Fiche client mise à jour",
  loyalty: "Fidélité mise à jour",
  issuePromo: "Code promotionnel créé",
  cancelPromo: "Code promotionnel annulé",
  loyaltyReward: "Récompense mise à jour",
  archiveReward: "Récompense archivée",
  reviewModeration: "Avis modéré",
  review: "Avis enregistré",
  menu: "Carte mise à jour",
  product: "Produit mis à jour",
  createProduct: "Produit créé",
  productLifecycle: "Produit mis à jour",
  upload: "Média importé",
  restaurant: "Établissement mis à jour",
  addRestaurant: "Établissement ajouté",
  settings: "Réglages mis à jour",
  reset: "Démonstration réinitialisée",
  login: "Connexion à l’espace",
  security: "Action de sécurité",
};
/** Presentation only: stored audit messages and their security classification remain intact. */
export function activityPresentation(action: string) {
  const key = /^Action\s*:\s*(\w+)/i.exec(action)?.[1];
  const category =
    /\bSEO\b|référencement|média|site\s*:|sécurité|permission|connexion/i.test(
      action,
    )
      ? "configuration"
      : key?.startsWith("recipe")
        ? "management"
        : moduleCategory(classifyAudit(action).module);
  return {
    category: category as ActivityCategory,
    label: key ? actionLabels[key] || "Action enregistrée" : action,
  };
}
