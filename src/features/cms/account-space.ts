/**
 * Espace client contextuel.
 *
 * Un même site public peut proposer une boutique, un blog ou une école.
 * L'espace client ne peut pas être le même partout : les points de fidélité
 * n'ont aucun sens sur un blog, et un tableau de bord d'apprenant n'a aucun
 * sens dans une brasserie.
 *
 * Chaque modèle de site déclare son « flavour » : l'espace client s'adapte,
 * les onglets et les données affichées changent avec lui.
 */
export const accountSpaceIds = [
  /** Commerce : commandes, points, rewards, parrainage, réservations. */
  "commerce",
  /** Éditorial : articles suivis, historique de lecture, commentaires. */
  "reader",
  /** Formation : cours suivis, progression, prochaines sessions. */
  "learner",
  /** Services : rendez-vous, prestations suivies, dossiers. */
  "services",
] as const;
export type AccountSpaceId = (typeof accountSpaceIds)[number];

export const accountSpaceLabels: Record<AccountSpaceId, string> = {
  commerce: "Espace client",
  reader: "Espace lecteur",
  learner: "Espace apprenant",
  services: "Espace client",
};

/** Phrase d'accueil de l'écran « pas encore connecté », par flavour. */
export const accountSpaceGuestCopy: Record<
  AccountSpaceId,
  { kicker: string; title: string; text: string; perks: [string, string][] }
> = {
  commerce: {
    kicker: "Espace client privé",
    title: "Votre fidélité, à votre nom.",
    text: "Un compte gratuit pour commander en click & collect, réserver, cumuler des points et débloquer des cadeaux.",
    perks: [
      ["Des points à chaque commande", "échangeables contre des cadeaux"],
      ["Ventes flash", "réservées et bonus membres"],
      ["Parrainage", "vos amis reçoivent un cadeau, vous gagnez des points"],
      ["Badges et niveaux", "à débloquer au fil de vos visites"],
    ],
  },
  reader: {
    kicker: "Espace lecteur",
    title: "Vos lectures, au même endroit.",
    text: "Créez votre compte pour retrouver les articles que vous suivez, vos commentaires et votre historique de lecture.",
    perks: [
      ["Vos articles", "suivis et sauvegardés en un clic"],
      ["Votre historique", "ce que vous avez lu, quand"],
      ["Vos commentaires", "et vos réponses aux autres lecteurs"],
      ["La newsletter", "les nouveaux textes dans votre boîte"],
    ],
  },
  learner: {
    kicker: "Espace apprenant",
    title: "Vos formations, votre progression.",
    text: "Créez votre compte pour suivre vos cours, retrouver votre progression et voir les prochaines sessions.",
    perks: [
      ["Vos cours", "retrouvés en un clic"],
      ["Votre progression", "chapitre par chapitre"],
      ["Vos attestations", "à télécharger"],
      ["Les prochaines sessions", "et les rendez-vous"],
    ],
  },
  services: {
    kicker: "Espace client",
    title: "Vos rendez-vous, vos dossiers.",
    text: "Créez votre compte pour suivre vos prestations, retrouver vos rendez-vous et télécharger vos documents.",
    perks: [
      ["Vos rendez-vous", "confirmés et suivis"],
      ["Vos prestations", "et leur avancement"],
      ["Vos devis", "acceptés ou en attente"],
      ["Vos documents", "factures et rapports"],
    ],
  },
};

/** Ce que l'on peut suivre dans l'espace client, par flavour. */
export const followKindsBySpace: Record<
  AccountSpaceId,
  { kind: "article" | "course" | "service"; label: string }[]
> = {
  commerce: [],
  reader: [{ kind: "article", label: "Articles" }],
  learner: [{ kind: "course", label: "Formations" }],
  services: [{ kind: "service", label: "Prestations" }],
};

/**
 * Le flavour d'un modèle. Un site sans modèle (ou un modèle inconnu) reste
 * un commerce : c'est le comportement historique de l'espace client.
 */
export const spaceByTemplate: Record<string, AccountSpaceId> = {
  // Restauration et commerce
  bistrot: "commerce",
  jardin: "commerce",
  comptoir: "commerce",
  pause: "commerce",
  signature: "commerce",
  riviera: "commerce",
  atelier: "commerce",
  escale: "commerce",
  pizzeria: "commerce",
  patisserie: "commerce",
  brunch: "commerce",
  burger: "commerce",
  baravin: "commerce",
  streetfood: "commerce",
  // Éditorial
  manuscrit: "reader",
  // Formation
  ecole: "learner",
  // Services
  coiffeur: "services",
  chantier: "services",
  loft: "services",
  racing: "services",
  assurance: "services",
  compta: "services",
  // Cuisinera
  sushi: "commerce",
  gastronomique: "commerce",
};

export const spaceOf = (templateId: string | undefined): AccountSpaceId =>
  (templateId && spaceByTemplate[templateId]) || "commerce";

/** Les onglets de l'espace client, selon le modèle de site choisi. */
export type AccountTabId =
  | "accueil"
  | "recompenses"
  | "parrainage"
  | "historique"
  | "suivis";

export const accountTabs: Record<
  AccountSpaceId,
  { id: AccountTabId; label: string }[]
> = {
  commerce: [
    { id: "accueil", label: "Accueil" },
    { id: "recompenses", label: "Cadeaux" },
    { id: "parrainage", label: "Parrainage" },
    { id: "historique", label: "Historique" },
  ],
  reader: [
    { id: "accueil", label: "Accueil" },
    { id: "suivis", label: "Mes articles" },
    { id: "historique", label: "Historique" },
  ],
  learner: [
    { id: "accueil", label: "Accueil" },
    { id: "suivis", label: "Mes formations" },
    { id: "historique", label: "Historique" },
  ],
  services: [
    { id: "accueil", label: "Accueil" },
    { id: "suivis", label: "Mes prestations" },
    { id: "historique", label: "Historique" },
  ],
};
