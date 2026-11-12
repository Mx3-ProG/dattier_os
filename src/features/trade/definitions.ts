import type { Permission } from "@/core/permissions";

/**
 * Outils métier : un moteur commun (fiches, validation, stockage, indicateurs)
 * et une définition par add-on. Partagé par l’API, l’interface et les tests.
 */
export const tradeKind = "business";
export type TradeFieldType =
  | "text"
  | "textarea"
  | "number"
  | "money"
  | "percent"
  | "date"
  | "datetime"
  | "select"
  | "multiselect"
  | "boolean"
  | "lines"
  | "ref";
/** Sources de choix calculées côté serveur à partir des données de l’établissement. */
export type TradeSource = "menu" | "ingredients" | "team" | "segments";
export type TradeField = {
  key: string;
  label: string;
  type: TradeFieldType;
  required?: boolean;
  options?: readonly string[];
  /** Fiche d’une autre entité du même outil (type « ref »). */
  ref?: string;
  /** Choix dynamiques (type « select » ou « multiselect »). */
  source?: TradeSource;
  min?: number;
  max?: number;
  placeholder?: string;
  /** Afficher la colonne dans la liste. */
  list?: boolean;
};
export type TradeEntity = {
  id: string;
  label: string;
  plural: string;
  title: string;
  fields: readonly TradeField[];
  /** Une seule fiche (réglages de l’outil). */
  singleton?: boolean;
};
export type TradeIndustry = "Restauration" | "BTP" | "Coiffure" | "Commerce" | "Tous métiers";
export type TradeTool = {
  id: string;
  name: string;
  industry: TradeIndustry;
  category: string;
  tagline: string;
  description: string;
  features: readonly string[];
  permission: Permission | null;
  /** Vue dédiée en plus des fiches et indicateurs. */
  view?: "kitchen-board" | "allergen-matrix" | "agenda" | "quote";
  entities: readonly TradeEntity[];
  /** Outil qui fournit ses données à celui-ci. */
  requires?: string;
};
export const tradeCategories = {
  Restauration: { id: "metier-restauration", position: 40, description: "Cuisine, carte, service et pertes : les outils du quotidien en restauration." },
  BTP: { id: "metier-btp", position: 41, description: "Chantiers, rapports, devis et matériel pour les entreprises du bâtiment." },
  Coiffure: { id: "metier-coiffure", position: 42, description: "Rendez-vous, fauteuils, fiches clients et produits du salon." },
  Commerce: { id: "metier-commerce", position: 43, description: "Variantes, lots, livraison et relance des paiements non finalisés." },
  "Tous métiers": { id: "metier-tous", position: 44, description: "Segments, campagnes et parcours de conversion, quel que soit votre métier." },
} as const satisfies Record<TradeIndustry, { id: string; position: number; description: string }>;

const status = (options: readonly string[], key = "status", label = "Statut"): TradeField => ({
  key, label, type: "select", options, required: true, list: true,
});
export const allergenList = [
  "Gluten", "Crustacés", "Œufs", "Poissons", "Arachides", "Soja", "Lait",
  "Fruits à coque", "Céleri", "Moutarde", "Sésame", "Sulfites", "Lupin", "Mollusques",
] as const;

export const tradeTools = [
  // ——— Restauration ———
  {
    id: "kitchen-display", name: "Écran cuisine", industry: "Restauration", category: tradeCategories.Restauration.id,
    tagline: "Les bons en temps réel", permission: "kitchen", view: "kitchen-board",
    description: "Un écran plein format pour la brigade : chaque commande en ticket, triée par ancienneté, avec chrono et alertes de retard.",
    features: ["Tickets triés par ancienneté avec chronomètre", "Couleur d’alerte au-delà du délai cible", "Lancer et terminer une préparation d’un geste", "Mode plein écran pour tablette murale"],
    entities: [{ id: "settings", label: "Réglages", plural: "Réglages", title: "target", singleton: true, fields: [
      { key: "target", label: "Délai cible (minutes)", type: "number", min: 3, max: 90, required: true },
      { key: "station", label: "Poste affiché", type: "select", options: ["Cuisine", "Bar", "Tous"], required: true },
    ] }],
  },
  {
    id: "recipe-cost", name: "Coût des recettes", industry: "Restauration", category: tradeCategories.Restauration.id,
    tagline: "Votre marge, plat par plat", permission: "catalog",
    description: "Calcule le coût matière de chaque plat à partir de vos fiches recettes et le compare au prix de vente.",
    features: ["Coût matière et ratio par produit", "Alerte au-delà du ratio cible", "Prix conseillé pour atteindre votre objectif", "Simulations de prix enregistrées"],
    entities: [
      { id: "settings", label: "Objectif", plural: "Objectif", title: "target", singleton: true, fields: [
        { key: "target", label: "Ratio matière cible (%)", type: "percent", min: 5, max: 80, required: true },
      ] },
      { id: "simulation", label: "Simulation", plural: "Simulations", title: "product", fields: [
        { key: "product", label: "Produit", type: "select", source: "menu", required: true, list: true },
        { key: "price", label: "Prix de vente testé", type: "money", required: true, list: true },
        { key: "note", label: "Note", type: "text" },
      ] },
    ],
  },
  {
    id: "menu-allergens", name: "Allergènes avancés", industry: "Restauration", category: tradeCategories.Restauration.id,
    tagline: "Les 14 allergènes, sans erreur", permission: "catalog", view: "allergen-matrix",
    description: "Une grille des 14 allergènes réglementaires pour toute la carte, publiée directement sur votre boutique en ligne.",
    features: ["Grille des 14 allergènes réglementaires", "Présence ou traces, produit par produit", "Publication immédiate sur la boutique en ligne", "Tableau imprimable pour la salle"],
    entities: [],
  },
  {
    id: "service-pacing", name: "Cadence du service", industry: "Restauration", category: tradeCategories.Restauration.id,
    tagline: "Voir le coup de feu venir", permission: "orders",
    description: "Visualise la charge du service par poste et par heure, repère les préparations en retard et l’activité de la journée.",
    features: ["Préparations en attente par poste", "Retards au-delà du délai cible", "Commandes par heure sur la journée", "Plats les plus demandés du service"],
    entities: [{ id: "settings", label: "Réglages", plural: "Réglages", title: "target", singleton: true, fields: [
      { key: "target", label: "Délai cible (minutes)", type: "number", min: 3, max: 90, required: true },
    ] }],
  },
  {
    id: "waste-tracker", name: "Suivi des pertes", industry: "Restauration", category: tradeCategories.Restauration.id,
    tagline: "Chaque perte a une cause", permission: "stock",
    description: "Enregistre les pertes en quelques secondes, chiffre leur coût et révèle les causes qui coûtent le plus.",
    features: ["Saisie rapide par ingrédient", "Coût calculé avec le prix d’achat", "Répartition par cause", "Ingrédients les plus gaspillés"],
    entities: [{ id: "waste", label: "Perte", plural: "Pertes", title: "ingredient", fields: [
      { key: "ingredient", label: "Ingrédient", type: "select", source: "ingredients", required: true, list: true },
      { key: "quantity", label: "Quantité", type: "number", min: 0, max: 100000, required: true, list: true },
      { key: "reason", label: "Cause", type: "select", options: ["Péremption", "Préparation ratée", "Retour client", "Surproduction", "Casse", "Autre"], required: true, list: true },
      { key: "date", label: "Date", type: "date", required: true, list: true },
      { key: "note", label: "Note", type: "text" },
    ] }],
  },
  // ——— BTP ———
  {
    id: "site-planning", name: "Planning de chantier", industry: "BTP", category: tradeCategories.BTP.id,
    tagline: "Chaque étape à sa place", permission: null,
    description: "Planifie les chantiers et leurs étapes, affecte les équipes et suit l’avancement et les retards.",
    features: ["Chantiers avec client, adresse et dates", "Étapes affectées à une équipe", "Frise des étapes et retards", "Avancement par chantier"],
    entities: [
      { id: "site", label: "Chantier", plural: "Chantiers", title: "name", fields: [
        { key: "name", label: "Nom du chantier", type: "text", required: true, list: true },
        { key: "client", label: "Client", type: "text", list: true },
        { key: "address", label: "Adresse", type: "text" },
        { key: "start", label: "Début", type: "date", list: true },
        { key: "end", label: "Fin prévue", type: "date", list: true },
        status(["Préparation", "En cours", "En pause", "Terminé"]),
      ] },
      { id: "task", label: "Étape", plural: "Étapes", title: "title", fields: [
        { key: "site", label: "Chantier", type: "ref", ref: "site", required: true, list: true },
        { key: "title", label: "Étape", type: "text", required: true, list: true },
        { key: "team", label: "Équipe", type: "select", source: "team", list: true },
        { key: "start", label: "Début", type: "date", required: true, list: true },
        { key: "end", label: "Fin", type: "date", required: true, list: true },
        status(["À faire", "En cours", "Terminée"]),
      ] },
    ],
  },
  {
    id: "site-report", name: "Rapport de chantier", industry: "BTP", category: tradeCategories.BTP.id,
    tagline: "Le journal de chantier, au propre", permission: null,
    description: "Un rapport par visite : avancement, effectif, météo, observations et réserves à lever, avec l’historique par chantier.",
    features: ["Rapport daté avec avancement en %", "Effectif, météo et observations", "Réserves ouvertes à lever", "Dernier état de chaque chantier"],
    entities: [{ id: "report", label: "Rapport", plural: "Rapports", title: "site", fields: [
      { key: "site", label: "Chantier", type: "text", required: true, list: true, placeholder: "Nom du chantier" },
      { key: "date", label: "Date", type: "date", required: true, list: true },
      { key: "progress", label: "Avancement (%)", type: "percent", min: 0, max: 100, required: true, list: true },
      { key: "workforce", label: "Effectif présent", type: "number", min: 0, max: 500 },
      { key: "weather", label: "Météo", type: "select", options: ["Beau", "Nuageux", "Pluie", "Neige", "Vent fort"] },
      { key: "notes", label: "Observations", type: "textarea" },
      { key: "reserves", label: "Réserves à lever", type: "textarea" },
      { key: "reservesOpen", label: "Réserves encore ouvertes", type: "boolean", list: true },
      { key: "photo", label: "Lien photo", type: "text", placeholder: "https://…" },
    ] }],
  },
  {
    id: "quote-builder", name: "Devis travaux", industry: "BTP", category: tradeCategories.BTP.id,
    tagline: "Des devis clairs en 5 minutes", permission: "finance", view: "quote",
    description: "Compose un devis poste par poste avec quantités, prix et TVA, calcule les totaux et l’imprime au propre.",
    features: ["Postes avec quantité, unité, prix et TVA", "Totaux HT, TVA et TTC automatiques", "Suivi brouillon, envoyé, accepté, refusé", "Version imprimable pour le client"],
    entities: [{ id: "quote", label: "Devis", plural: "Devis", title: "title", fields: [
      { key: "number", label: "Numéro", type: "text", required: true, list: true, placeholder: "D-2026-001" },
      { key: "title", label: "Objet", type: "text", required: true, list: true },
      { key: "client", label: "Client", type: "text", required: true, list: true },
      { key: "address", label: "Adresse du chantier", type: "text" },
      { key: "validity", label: "Valable jusqu’au", type: "date" },
      { key: "lines", label: "Postes", type: "lines", required: true },
      status(["Brouillon", "Envoyé", "Accepté", "Refusé"]),
    ] }],
  },
  {
    id: "equipment-log", name: "Suivi du matériel", industry: "BTP", category: tradeCategories.BTP.id,
    tagline: "Qui a quoi, et quand l’entretenir", permission: null,
    description: "Inventaire du matériel, affectations aux équipes et carnet d’entretien avec alertes avant échéance.",
    features: ["Inventaire avec numéro de série", "Affectation à un chantier ou une équipe", "Carnet d’entretien et pannes", "Alerte d’entretien à 14 jours"],
    entities: [
      { id: "equipment", label: "Matériel", plural: "Matériel", title: "name", fields: [
        { key: "name", label: "Désignation", type: "text", required: true, list: true },
        { key: "kind", label: "Catégorie", type: "select", options: ["Outillage", "Engin", "Véhicule", "Échafaudage", "Mesure", "Sécurité"], list: true },
        { key: "serial", label: "N° de série", type: "text" },
        status(["Disponible", "Affecté", "En entretien", "Hors service"]),
        { key: "assignedTo", label: "Affecté à", type: "text", list: true },
        { key: "nextService", label: "Prochain entretien", type: "date", list: true },
      ] },
      { id: "event", label: "Intervention", plural: "Carnet", title: "type", fields: [
        { key: "equipment", label: "Matériel", type: "ref", ref: "equipment", required: true, list: true },
        { key: "type", label: "Type", type: "select", options: ["Affectation", "Retour", "Entretien", "Panne", "Réparation"], required: true, list: true },
        { key: "date", label: "Date", type: "date", required: true, list: true },
        { key: "cost", label: "Coût", type: "money", list: true },
        { key: "note", label: "Note", type: "text" },
      ] },
    ],
  },
  // ——— Coiffure ———
  {
    id: "appointment-booking", name: "Agenda de rendez-vous", industry: "Coiffure", category: tradeCategories.Coiffure.id,
    tagline: "Le salon plein, sans chevauchement", permission: "reservations", view: "agenda",
    description: "Un agenda par collaborateur avec vos prestations, leur durée et leur prix, et la détection des chevauchements.",
    features: ["Catalogue de prestations avec durée et prix", "Agenda du jour par collaborateur", "Alerte de chevauchement", "Chiffre d’affaires prévu de la journée"],
    entities: [
      { id: "service", label: "Prestation", plural: "Prestations", title: "name", fields: [
        { key: "name", label: "Prestation", type: "text", required: true, list: true },
        { key: "duration", label: "Durée (minutes)", type: "number", min: 5, max: 600, required: true, list: true },
        { key: "price", label: "Prix", type: "money", required: true, list: true },
      ] },
      { id: "appointment", label: "Rendez-vous", plural: "Rendez-vous", title: "client", fields: [
        { key: "client", label: "Client", type: "text", required: true, list: true },
        { key: "phone", label: "Téléphone", type: "text" },
        { key: "service", label: "Prestation", type: "ref", ref: "service", required: true, list: true },
        { key: "staff", label: "Collaborateur", type: "select", source: "team", list: true },
        { key: "chair", label: "Fauteuil", type: "number", min: 1, max: 50 },
        { key: "start", label: "Début", type: "datetime", required: true, list: true },
        status(["Confirmé", "Arrivé", "Terminé", "Absent", "Annulé"]),
      ] },
    ],
  },
  {
    id: "chair-occupancy", name: "Occupation des fauteuils", industry: "Coiffure", category: tradeCategories.Coiffure.id,
    tagline: "Remplir les creux de la journée", permission: "reservations", requires: "appointment-booking",
    description: "Mesure le taux d’occupation des fauteuils heure par heure à partir de l’agenda, pour repérer les creux à remplir.",
    features: ["Taux d’occupation du jour et de la semaine", "Charge heure par heure", "Créneaux creux à proposer", "Réglage des fauteuils et des horaires"],
    entities: [{ id: "settings", label: "Salon", plural: "Salon", title: "chairs", singleton: true, fields: [
      { key: "chairs", label: "Nombre de fauteuils", type: "number", min: 1, max: 50, required: true },
      { key: "open", label: "Ouverture (heure)", type: "number", min: 0, max: 23, required: true },
      { key: "close", label: "Fermeture (heure)", type: "number", min: 1, max: 24, required: true },
    ] }],
  },
  {
    id: "client-style", name: "Fiches prestations", industry: "Coiffure", category: tradeCategories.Coiffure.id,
    tagline: "Chaque client, sa formule", permission: "customers",
    description: "La fiche technique de chaque client : nature de cheveux, formules de couleur, préférences, et l’historique de ses visites.",
    features: ["Fiche technique et formule couleur", "Allergies et préférences", "Historique des visites et montants", "Clients à relancer après 60 jours"],
    entities: [
      { id: "sheet", label: "Fiche client", plural: "Fiches clients", title: "client", fields: [
        { key: "client", label: "Client", type: "text", required: true, list: true },
        { key: "phone", label: "Téléphone", type: "text", list: true },
        { key: "hair", label: "Nature de cheveux", type: "select", options: ["Fins", "Normaux", "Épais", "Bouclés", "Crépus", "Colorés"], list: true },
        { key: "formula", label: "Formule couleur", type: "text" },
        { key: "allergies", label: "Allergies / sensibilités", type: "text" },
        { key: "preferences", label: "Préférences", type: "textarea" },
      ] },
      { id: "visit", label: "Visite", plural: "Visites", title: "service", fields: [
        { key: "sheet", label: "Client", type: "ref", ref: "sheet", required: true, list: true },
        { key: "date", label: "Date", type: "date", required: true, list: true },
        { key: "service", label: "Prestation", type: "text", required: true, list: true },
        { key: "formula", label: "Formule utilisée", type: "text" },
        { key: "amount", label: "Montant", type: "money", list: true },
        { key: "note", label: "Note", type: "text" },
      ] },
    ],
  },
  {
    id: "salon-stock", name: "Stocks salon", industry: "Coiffure", category: tradeCategories.Coiffure.id,
    tagline: "Ne plus jamais manquer de couleur", permission: "stock",
    description: "Suit les produits techniques et de revente, leurs mouvements et alerte avant la rupture.",
    features: ["Produits techniques et de revente", "Entrées, utilisations et ventes", "Alerte sous le seuil", "Marge sur la revente"],
    entities: [
      { id: "product", label: "Produit", plural: "Produits", title: "name", fields: [
        { key: "name", label: "Produit", type: "text", required: true, list: true },
        { key: "brand", label: "Marque", type: "text", list: true },
        { key: "usage", label: "Usage", type: "select", options: ["Technique", "Revente"], required: true, list: true },
        { key: "initial", label: "Stock initial", type: "number", min: 0, max: 100000, required: true },
        { key: "threshold", label: "Seuil d’alerte", type: "number", min: 0, max: 100000, required: true, list: true },
        { key: "cost", label: "Prix d’achat", type: "money" },
        { key: "price", label: "Prix de vente", type: "money" },
      ] },
      { id: "movement", label: "Mouvement", plural: "Mouvements", title: "type", fields: [
        { key: "product", label: "Produit", type: "ref", ref: "product", required: true, list: true },
        { key: "type", label: "Type", type: "select", options: ["Entrée", "Utilisation", "Vente"], required: true, list: true },
        { key: "quantity", label: "Quantité", type: "number", min: 0, max: 100000, required: true, list: true },
        { key: "date", label: "Date", type: "date", required: true, list: true },
      ] },
    ],
  },
  // ——— Commerce ———
  {
    id: "product-variants", name: "Variantes produit", industry: "Commerce", category: tradeCategories.Commerce.id,
    tagline: "Une fiche, toutes les déclinaisons", permission: "catalog",
    description: "Décline vos articles par taille, couleur ou finition, avec référence, supplément de prix et stock par variante.",
    features: ["Déclinaisons par option et valeur", "Référence et supplément de prix", "Stock par variante et ruptures", "Prix final calculé"],
    entities: [{ id: "variant", label: "Variante", plural: "Variantes", title: "value", fields: [
      { key: "product", label: "Produit", type: "select", source: "menu", required: true, list: true },
      { key: "option", label: "Option", type: "select", options: ["Taille", "Couleur", "Finition", "Contenance", "Modèle"], required: true, list: true },
      { key: "value", label: "Valeur", type: "text", required: true, list: true },
      { key: "sku", label: "Référence", type: "text", list: true },
      { key: "delta", label: "Supplément", type: "money" },
      { key: "stock", label: "Stock", type: "number", min: 0, max: 1000000, required: true, list: true },
    ] }],
  },
  {
    id: "abandoned-cart", name: "Paniers abandonnés", industry: "Commerce", category: tradeCategories.Commerce.id,
    tagline: "Récupérer les ventes perdues", permission: "orders",
    description: "Repère les commandes en ligne dont le paiement n’a pas été finalisé, chiffre le manque à gagner et suit vos relances.",
    features: ["Paiements en ligne non finalisés", "Montant en jeu sur 30 jours", "Contact du client pour relancer", "Suivi des relances et récupérations"],
    entities: [{ id: "followup", label: "Relance", plural: "Relances", title: "order", fields: [
      { key: "order", label: "Commande n°", type: "text", required: true, list: true },
      { key: "channel", label: "Canal", type: "select", options: ["Email", "SMS", "Téléphone"], required: true, list: true },
      { key: "date", label: "Date", type: "date", required: true, list: true },
      status(["Relancé", "Récupéré", "Perdu"], "outcome", "Résultat"),
    ] }],
  },
  {
    id: "shipping-rules", name: "Livraison", industry: "Commerce", category: tradeCategories.Commerce.id,
    tagline: "Des frais justes, zone par zone", permission: "catalog",
    description: "Définit vos zones de livraison par code postal, leurs frais, délais et seuil de gratuité, avec un simulateur de frais.",
    features: ["Zones par préfixe de code postal", "Frais, délai et franco de port", "Simulateur pour un client donné", "Modes : livraison, coursier, retrait"],
    entities: [{ id: "zone", label: "Zone", plural: "Zones", title: "name", fields: [
      { key: "name", label: "Zone", type: "text", required: true, list: true },
      { key: "postcodes", label: "Codes postaux (préfixes, séparés par des virgules)", type: "text", required: true, list: true, placeholder: "75, 92, 93" },
      { key: "mode", label: "Mode", type: "select", options: ["Livraison", "Coursier", "Retrait"], required: true, list: true },
      { key: "fee", label: "Frais", type: "money", required: true, list: true },
      { key: "freeAbove", label: "Gratuit dès", type: "money" },
      { key: "delay", label: "Délai (jours)", type: "number", min: 0, max: 60, list: true },
    ] }],
  },
  {
    id: "product-bundles", name: "Lots de produits", industry: "Commerce", category: tradeCategories.Commerce.id,
    tagline: "Vendre plus par panier", permission: "catalog",
    description: "Compose des lots à partir de votre catalogue et vérifie la remise accordée et la marge restante.",
    features: ["Lots composés de vos produits", "Prix du lot et remise affichée", "Marge calculée avec vos coûts", "Lots actifs ou en pause"],
    entities: [{ id: "bundle", label: "Lot", plural: "Lots", title: "name", fields: [
      { key: "name", label: "Nom du lot", type: "text", required: true, list: true },
      { key: "items", label: "Produits", type: "multiselect", source: "menu", required: true },
      { key: "price", label: "Prix du lot", type: "money", required: true, list: true },
      status(["Actif", "En pause"]),
    ] }],
  },
  // ——— Tous métiers ———
  {
    id: "customer-segments", name: "Segments clients", industry: "Tous métiers", category: tradeCategories["Tous métiers"].id,
    tagline: "Parler à chacun de vos clients", permission: "customers",
    description: "Regroupe automatiquement vos clients (fidèles, nouveaux, à risque, inactifs) et vos propres segments sur mesure.",
    features: ["Segments automatiques prêts à l’emploi", "Segments sur mesure par règles", "Liste des clients de chaque segment", "Export CSV"],
    entities: [{ id: "segment", label: "Segment", plural: "Segments sur mesure", title: "name", fields: [
      { key: "name", label: "Nom du segment", type: "text", required: true, list: true },
      { key: "minOrders", label: "Commandes minimum", type: "number", min: 0, max: 10000, list: true },
      { key: "minSpend", label: "Dépense minimum", type: "money", list: true },
      { key: "inactiveDays", label: "Sans commande depuis (jours)", type: "number", min: 0, max: 3650, list: true },
      { key: "minPoints", label: "Points de fidélité minimum", type: "number", min: 0, max: 1000000 },
    ] }],
  },
  {
    id: "loyalty-campaigns", name: "Campagnes de fidélité", industry: "Tous métiers", category: tradeCategories["Tous métiers"].id,
    tagline: "La bonne offre au bon client", permission: "customers",
    description: "Planifie des campagnes ciblées sur un segment, avec offre, période et canal, et mesure leur portée.",
    features: ["Campagne ciblée sur un segment", "Offre, période et canal", "Portée calculée en direct", "Campagnes en cours et à venir"],
    entities: [{ id: "campaign", label: "Campagne", plural: "Campagnes", title: "name", fields: [
      { key: "name", label: "Nom", type: "text", required: true, list: true },
      { key: "segment", label: "Segment ciblé", type: "select", source: "segments", required: true, list: true },
      { key: "offer", label: "Offre", type: "select", options: ["Remise %", "Remise €", "Points doublés", "Cadeau"], required: true, list: true },
      { key: "value", label: "Valeur de l’offre", type: "number", min: 0, max: 100000 },
      { key: "channel", label: "Canal", type: "select", options: ["Email", "SMS", "En caisse"], required: true, list: true },
      { key: "start", label: "Début", type: "date", required: true, list: true },
      { key: "end", label: "Fin", type: "date", required: true, list: true },
      { key: "message", label: "Message", type: "textarea" },
    ] }],
  },
  {
    id: "conversion-insights", name: "Parcours de conversion", industry: "Tous métiers", category: tradeCategories["Tous métiers"].id,
    tagline: "De la visite à la vente", permission: "analytics",
    description: "Relie les visites de votre site aux commandes et réservations pour mesurer chaque étape du parcours.",
    features: ["Entonnoir visites → commandes et réservations", "Taux de conversion sur 30 jours", "Pages les plus vues", "Tendance jour par jour"],
    entities: [],
  },
] as const satisfies readonly TradeTool[];

export type TradeToolId = (typeof tradeTools)[number]["id"];
export const tradeToolIds = tradeTools.map((tool) => tool.id) as TradeToolId[];
export const isTradeTool = (value: unknown): value is TradeToolId =>
  typeof value === "string" && tradeToolIds.includes(value as TradeToolId);
export const tradeTool = (id: string): TradeTool | undefined =>
  (tradeTools as readonly TradeTool[]).find((tool) => tool.id === id);
export const tradeNavigationLicense = "trade-tools";
