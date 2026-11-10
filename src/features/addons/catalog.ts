export const addonMonthlyCents = 900;
export const monthlyAddonIds = ["invoices","attendance","client-invoices","payroll","offline-conflicts","connections","qr","loyalty","domain","prospect-scanner","pipeline-crm","customer-health"] as const;
export type MonthlyAddonId = (typeof monthlyAddonIds)[number];
export const pilotageAddonPrices = {
  "prospect-scanner": 6900,
  "pipeline-crm": 6900,
  "customer-health": 8900,
} as const;
export const addonPriceCents = (id: string) => pilotageAddonPrices[id as keyof typeof pilotageAddonPrices] ?? addonMonthlyCents;
export const addonCatalog = [
  {
    id: "floor",
    name: "Salle",
    description:
      "Disposez vos tables, organisez vos zones et suivez votre salle.",
    includedFrom: 39,
    usage: false,
  },
  {
    id: "booking",
    name: "Réservations",
    description: "Recevez les demandes et affectez les tables disponibles.",
    includedFrom: 39,
    usage: false,
  },
  {
    id: "loyalty",
    name: "Comptes clients gamifiés",
    description: "Points, badges, récompenses et avantages clients.",
    includedFrom: null,
    usage: false,
  },
  {
    id: "website",
    name: "Site internet",
    description: "Composez vos pages et publiez votre site personnalisé.",
    includedFrom: 39,
    usage: false,
  },
  {
    id: "invoices",
    name: "Factures fournisseurs",
    description: "Centralisez vos justificatifs et préparez leur validation.",
    includedFrom: null,
    usage: true,
  },
  { id: "attendance", name: "Présences, heures et absences", description: "Pointage, suivi des heures et absences.", includedFrom: null, usage: false },
  { id: "client-invoices", name: "Factures clients", description: "Émission et suivi des factures clients.", includedFrom: null, usage: false },
  { id: "payroll", name: "Paie", description: "Préparation et suivi des variables de paie.", includedFrom: null, usage: false },
  { id: "offline-conflicts", name: "Conflits hors ligne", description: "Résolution des conflits de synchronisation.", includedFrom: null, usage: false },
  { id: "connections", name: "Connexions", description: "Suivi des intégrations externes.", includedFrom: null, usage: false },
  { id: "qr", name: "QR codes", description: "Création et suivi de QR codes.", includedFrom: null, usage: false },
  { id: "domain", name: "Domaine personnalisé", description: "Publiez votre site sur votre propre nom de domaine.", includedFrom: null, usage: false },
  { id: "prospect-scanner", name: "Scanner de prospects", description: "Recherchez et qualifiez des entreprises avec un score et la provenance des données.", includedFrom: null, usage: false },
  { id: "pipeline-crm", name: "Pipeline CRM", description: "Suivez entreprises, opportunités, tâches et étapes de vente de A à Z.", includedFrom: null, usage: false },
  { id: "customer-health", name: "Customer Health", description: "Suivez engagement, fréquence d’achat et valeur vie client à partir des ventes réelles.", includedFrom: null, usage: false },
  {
    id: "online-orders",
    name: "Boutique en ligne",
    description: "Recevez des commandes avec panier et créneaux de retrait.",
    includedFrom: 39,
    usage: false,
  },
] as const;

export type AddonSubscription = {
  addon: string;
  status: string;
  valid_until: string | null;
  renewal_cancelled?: boolean | null;
};
/** Display classification only: purchases and permissions are checked by the server. */
export function addonCollections(
  plan: number,
  subscriptions: readonly AddonSubscription[],
  now = Date.now(),
  legacyGrants: readonly string[] = [],
) {
  const entries = addonCatalog.map((addon) => {
    const included = (addon.includedFrom !== null && plan >= addon.includedFrom) || legacyGrants.includes(addon.id);
    const subscription = subscriptions.find(
      (subscription) =>
        subscription.addon === addon.id &&
        subscription.status === "active" &&
        subscription.valid_until !== null &&
        Date.parse(subscription.valid_until) > now,
    );
    const active = subscription !== undefined;
    const pending =
      !active &&
      subscriptions.some(
        (subscription) =>
          subscription.addon === addon.id && subscription.status === "pending",
      );
    return {
      ...addon,
      included,
      active,
      pending,
      validUntil: subscription?.valid_until ?? null,
      renewalCancelled: subscription?.renewal_cancelled ?? null,
    };
  });
  return {
    owned: entries.filter((entry) => entry.included || entry.active),
    shop: entries.filter((entry) => !entry.included && !entry.active),
  };
}

export type AddonId = (typeof addonCatalog)[number]["id"];
export const addonDetails: Record<
  AddonId,
  {
    target: string;
    action: string;
    features: readonly string[];
    example: string;
  }
> = {
  floor: {
    target: "dining",
    action: "Ouvrir le plan de salle",
    features: [
      "Organiser les zones et le placement des tables.",
      "Consulter les capacités et les états de la salle.",
      "Adapter le plan selon les droits d’aménagement de votre profil.",
    ],
    example:
      "Préparer la disposition de la terrasse avant le début du service.",
  },
  booking: {
    target: "reservations",
    action: "Ouvrir les réservations",
    features: [
      "Consulter les demandes de réservation.",
      "Affecter une table selon les disponibilités.",
      "Suivre les arrivées et les changements de statut.",
    ],
    example:
      "Retrouver une réservation du soir et préparer l’accueil des clients.",
  },
  loyalty: {
    target: "customers",
    action: "Ouvrir les clients et la fidélité",
    features: [
      "Retrouver les fiches de vos clients.",
      "Suivre leurs points de fidélité.",
      "Gérer les récompenses et avantages disponibles.",
    ],
    example:
      "Consulter les points d’un habitué avant de lui proposer une récompense.",
  },
  website: {
    target: "site",
    action: "Ouvrir mon site web",
    features: [
      "Composer les pages et leurs sections.",
      "Personnaliser les contenus et l’apparence du site.",
      "Prévisualiser puis publier les modifications.",
    ],
    example:
      "Mettre à jour les informations de votre établissement avant de publier le site.",
  },
  invoices: {
    target: "invoices",
    action: "Ouvrir les factures fournisseurs",
    features: [
      "Centraliser vos justificatifs fournisseurs.",
      "Vérifier les informations extraites des documents.",
      "Préparer la validation des factures.",
    ],
    example:
      "Importer une facture fournisseur et vérifier les informations avant validation.",
  },
  "online-orders": {
    target: "orders",
    action: "Voir les commandes",
    features: [
      "Proposer un panier sur votre boutique en ligne.",
      "Permettre le choix d’un créneau de retrait.",
      "Retrouver les commandes reçues dans l’espace Commandes.",
    ],
    example:
      "Recevoir une commande à emporter pour le prochain créneau de retrait.",
  },
  attendance: { target: "attendance", action: "Ouvrir les présences", features: ["Pointer les arrivées et départs.", "Suivre les heures et absences."], example: "Vérifier les présences du jour." },
  "client-invoices": { target: "billing", action: "Ouvrir les factures clients", features: ["Émettre et suivre les factures clients."], example: "Préparer une facture après un service." },
  payroll: { target: "payroll", action: "Ouvrir la paie", features: ["Préparer les variables de paie."], example: "Vérifier les variables mensuelles." },
  "offline-conflicts": { target: "security", action: "Ouvrir les conflits", features: ["Repérer et résoudre les opérations en conflit."], example: "Réconcilier une vente hors ligne." },
  connections: { target: "settings", action: "Ouvrir les connexions", features: ["Suivre les intégrations externes."], example: "Vérifier une connexion de caisse." },
  domain: { target: "site", action: "Ouvrir mon site web", features: ["Relier votre propre nom de domaine au site.", "Vérifier le domaine par DNS.", "Choisir le domaine principal de votre site."], example: "Publier votre site sur www.votre-restaurant.fr." },
  qr: { target: "qr", action: "Ouvrir les QR codes", features: ["Créer et consulter les QR codes."], example: "Créer un QR code pour une table." },
  "prospect-scanner": { target: "prospect-scanner", action: "Ouvrir le scanner", features: ["Chercher des entreprises par activité, ville et rayon.", "Consulter les sources et les signaux du score.", "Qualifier les prospects puis les transférer au CRM."], example: "Repérer des entreprises proches d’un nouveau point de vente." },
  "pipeline-crm": { target: "pipeline-crm", action: "Ouvrir le pipeline", features: ["Suivre les entreprises et les opportunités.", "Déplacer chaque affaire dans ses étapes de vente.", "Planifier les relances et conserver les activités."], example: "Passer une proposition commerciale en négociation et programmer un rappel." },
  "customer-health": { target: "customer-health", action: "Ouvrir Customer Health", features: ["Voir l’activité et la valeur vie de chaque client.", "Comparer les périodes et repérer les clients inactifs.", "Visualiser les tendances sans inventer de données manquantes."], example: "Repérer les clients fidèles dont les achats ralentissent." },
};
/** UI shortcut only: both ownership and current workspace visibility are required. */
export function addonDestination(
  id: string,
  owned: boolean,
  accessibleModules: readonly string[],
): string | null {
  if (!owned || !Object.hasOwn(addonDetails, id)) return null;
  const target = addonDetails[id as AddonId].target;
  return accessibleModules.includes(target) ? target : null;
}
