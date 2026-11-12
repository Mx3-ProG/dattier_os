// Le secteur d’activité appartient au core (vocabulaire du commerce) ; réexporté ici par compatibilité.
import { industries, type Industry } from "@/core/tenant/business";
export { industries, type Industry };

export const industryLabels: Record<Industry, string> = {
  restaurant: "Restauration", beauty: "Coiffure et beauté", retail: "Commerce",
  construction: "BTP", services: "Services", other: "Autre activité",
};

export const trades: Record<Industry, readonly string[]> = {
  restaurant: ["Restaurant", "Brasserie", "Café", "Bar", "Boulangerie", "Pâtisserie", "Traiteur", "Restauration rapide", "Food truck"],
  beauty: ["Salon de coiffure", "Barbier", "Institut de beauté", "Onglerie", "Spa", "Maquillage", "Esthétique à domicile"],
  retail: ["Librairie", "Chaussures", "Vêtements", "Épicerie", "Fleuriste", "Décoration", "Électronique", "Articles de sport", "Commerce en ligne", "Autre commerce"],
  construction: ["Entreprise générale", "Maçonnerie", "Électricité", "Plomberie", "Peinture", "Menuiserie", "Couverture", "Paysagisme", "Architecture", "Autre métier du bâtiment"],
  services: ["Conseil", "Formation", "Réparation", "Entretien", "Transport", "Événementiel", "Services à domicile", "Autre service"],
  other: ["Autre activité"],
};

/**
 * Modules gratuits installés au choix du métier : les opérations (« ops-* ») et
 * les outils métier. Ils apparaissent dans OPÉRATIONS et se désactivent depuis
 * la boutique d'add-ons ; un changement de métier remplace ceux de l'ancien.
 */
export const freeTradeTools: Record<Industry, readonly string[]> = {
  restaurant: ["ops-orders", "ops-kitchen", "ops-bar", "kitchen-display", "recipe-cost", "menu-allergens", "service-pacing", "waste-tracker"],
  beauty: ["appointment-booking", "chair-occupancy", "client-style", "salon-stock"],
  retail: ["ops-orders", "product-variants", "abandoned-cart", "shipping-rules", "product-bundles"],
  construction: ["site-planning", "site-report", "quote-builder", "equipment-log"],
  services: ["appointment-booking", "quote-builder"],
  other: ["ops-orders", "appointment-booking", "quote-builder"],
};

export const discoverySources = ["salesperson", "social", "youtube", "search", "referral", "other"] as const;
export const discoveryLabels: Record<(typeof discoverySources)[number], string> = {
  salesperson: "Un vendeur", social: "Les réseaux sociaux", youtube: "YouTube",
  search: "Une recherche en ligne", referral: "Une recommandation", other: "Autre",
};

export const workflowChoices = ["sales", "appointments", "projects", "stock", "customers"] as const;
export const workflowLabels: Record<(typeof workflowChoices)[number], string> = {
  sales: "Ventes et commandes", appointments: "Rendez-vous", projects: "Chantiers ou projets",
  stock: "Stocks et achats", customers: "Suivi des clients",
};

export function relevantCapabilities(industry: Industry, workflows: readonly string[]) {
  const included = ["Espace d’équipe", "Site personnalisable", "Pilotage et finances"];
  if (industry === "restaurant") included.push("Salle, cuisine, commandes, stocks et recettes");
  if (industry === "beauty") included.push("Agenda, prestations et stocks salon");
  if (industry === "retail") included.push("Catalogue, variantes et livraison");
  if (industry === "construction") included.push("Chantiers, rapports, devis et matériel");
  if (industry === "services" || industry === "other") included.push("Organisation, équipe et suivi de l’activité");
  const optional = ["Factures clients", "Présences et absences"];
  if (industry !== "restaurant") optional.push("Commandes, catalogue, stocks, cuisine et plan de salle");
  if (workflows.includes("customers")) optional.push("Fidélité clients");
  if (workflows.includes("stock")) optional.push("Factures fournisseurs");
  return { included, optional };
}
