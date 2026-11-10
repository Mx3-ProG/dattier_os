import type { Section, SectionType, SiteConfig } from "./schema";

/**
 * Catalogue of section types maintained by Studio ATS. The editor builds its
 * property panels from it, and the server uses it to enforce what an
 * administrator may change. Pure: shared by server and client.
 */
export type FieldKind =
  | "text"
  | "textarea"
  | "link"
  | "image"
  | "images"
  | "list"
  | "faq"
  | "badges"
  | "boolean"
  | "number"
  | "select"
  | "video";
export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
};
export type SectionDef = {
  label: string;
  description: string;
  /** Can be added from the library on content and custom pages. */
  addable: boolean;
  fields: FieldDef[];
  /** Fields still editable when the section is partially locked (level 2). */
  partialFields: string[];
  /** Business data shown by the section, edited in another CRM module. */
  liveData?: { label: string; module: string };
  /** Add-on requis : la section n’est proposée et affichée que s’il est installé. */
  addon?: string;
  create?: () => Section["props"];
};
const kicker: FieldDef = { key: "kicker", label: "Surtitre", kind: "text" };
const title: FieldDef = {
  key: "title",
  label: "Titre",
  kind: "textarea",
  help: "Retour à la ligne : Entrée. Mot en rose : *entre astérisques*.",
};
export const registry: Record<SectionType, SectionDef> = {
  hero: {
    label: "Bannière d’accueil",
    description: "Grand titre, texte d’accroche, boutons et photo.",
    addable: true,
    fields: [
      kicker,
      title,
      { key: "lead", label: "Texte d’accroche", kind: "textarea" },
      { key: "primary", label: "Bouton principal", kind: "link" },
      { key: "secondary", label: "Lien secondaire", kind: "link" },
      { key: "badges", label: "Avantages affichés", kind: "badges" },
      { key: "image", label: "Photo", kind: "image" },
      {
        key: "sticker",
        label: "Afficher le badge « Good mood »",
        kind: "boolean",
      },
      { key: "floatingText", label: "Bulle flottante", kind: "textarea" },
    ],
    partialFields: ["kicker", "title", "lead", "image"],
    create: () => ({
      kicker: "NOUVEAUTÉ",
      title: "Un titre qui *donne envie*",
      lead: "Quelques mots pour présenter cette nouveauté.",
      primary: { label: "Commander", href: "/commander" },
      secondary: { label: "", href: "" },
      badges: [],
      image: { src: "/cms/restaurant.svg", alt: "Illustration de restaurant" },
      sticker: false,
      floatingText: "",
    }),
  },
  marquee: {
    label: "Bandeau défilant",
    description: "Une ligne de slogans qui défile.",
    addable: true,
    fields: [{ key: "items", label: "Slogans", kind: "list", max: 10 }],
    partialFields: ["items"],
    create: () => ({ items: ["DONUT WORRY, BE HAPPY"] }),
  },
  featuredProducts: {
    label: "Produits de la carte",
    description: "Les produits disponibles, avec prix et stocks à jour.",
    addable: true,
    fields: [
      kicker,
      title,
      { key: "aside", label: "Texte d’accompagnement", kind: "textarea" },
      { key: "note", label: "Mention", kind: "text" },
      {
        key: "limit",
        label: "Nombre de produits (0 = tous)",
        kind: "number",
        min: 0,
        max: 100,
      },
      { key: "allLink", label: "Lien vers toute la carte", kind: "link" },
    ],
    partialFields: ["kicker", "title", "aside", "note"],
    liveData: { label: "Produits, prix et disponibilités", module: "menu" },
    create: () => ({
      kicker: "LA CARTE DES ENVIES",
      title: "Nos incontournables",
      aside: "",
      note: "",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    }),
  },
  about: {
    label: "Présentation de l’établissement",
    description: "Image, titre et paragraphes de présentation.",
    addable: true,
    fields: [
      { key: "image", label: "Image", kind: "image" },
      { key: "artCaption", label: "Légende sur l’image", kind: "textarea" },
      kicker,
      title,
      { key: "paragraphs", label: "Paragraphes", kind: "list", max: 6 },
      { key: "cta", label: "Bouton", kind: "link" },
    ],
    partialFields: ["kicker", "title", "paragraphs", "image"],
    create: () => ({
      image: { src: "/cms/restaurant.svg", alt: "Logo" },
      artCaption: "",
      kicker: "BIENVENUE",
      title: "Notre *histoire*",
      paragraphs: ["Racontez votre établissement."],
      cta: { label: "", href: "" },
    }),
  },
  visit: {
    label: "Nous rendre visite",
    description: "Adresse, téléphone et horaires à jour.",
    addable: true,
    fields: [
      kicker,
      title,
      { key: "hoursTitle", label: "Titre des horaires", kind: "text" },
      { key: "hoursNote", label: "Mention sous les horaires", kind: "text" },
      { key: "cta", label: "Bouton", kind: "link" },
      {
        key: "burger",
        label: "Afficher l’animation du bagel",
        kind: "boolean",
      },
      { key: "burgerClosed", label: "Animation : texte fermé", kind: "text" },
      { key: "burgerOpen", label: "Animation : texte ouvert", kind: "text" },
      { key: "burgerHint", label: "Animation : indication", kind: "text" },
    ],
    partialFields: ["kicker", "title", "hoursTitle", "hoursNote"],
    liveData: {
      label: "Adresse, téléphone et horaires",
      module: "shop-settings",
    },
    create: () => ({
      kicker: "ON SE RETROUVE ?",
      title: "Venez nous *voir*",
      hoursTitle: "Nos horaires",
      hoursNote: "",
      cta: { label: "Commander", href: "/commander" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    }),
  },
  reviews: {
    label: "Avis clients",
    description: "Avis publiés et lien vers la fiche Google.",
    addable: true,
    fields: [
      kicker,
      title,
      { key: "text", label: "Texte", kind: "textarea" },
      { key: "rateLabel", label: "Bouton « noter »", kind: "text" },
      { key: "viewLabel", label: "Bouton « voir les avis »", kind: "text" },
      { key: "sheetLabel", label: "Lien vers la fiche", kind: "text" },
      { key: "cardCaption", label: "Mention de la carte Google", kind: "text" },
    ],
    partialFields: ["kicker", "title", "text"],
    liveData: { label: "Avis modérés", module: "reviews" },
    create: () => ({
      kicker: "VOTRE AVIS COMPTE",
      title: "Ils en *parlent*",
      text: "",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    }),
  },
  map: {
    label: "Carte de localisation",
    description: "Plan Google Maps, affiché après consentement du visiteur.",
    addable: true,
    fields: [
      kicker,
      title,
      { key: "buttonLabel", label: "Bouton itinéraire", kind: "text" },
    ],
    partialFields: ["kicker", "title", "buttonLabel"],
    liveData: { label: "Adresse", module: "shop-settings" },
    create: () => ({
      kicker: "NOUS TROUVER",
      title: "C’est par ici.",
      buttonLabel: "Ouvrir l’itinéraire",
    }),
  },
  gallery: {
    label: "Galerie",
    description: "Une grille de photos.",
    addable: true,
    fields: [
      kicker,
      title,
      { key: "intro", label: "Introduction", kind: "textarea" },
      { key: "images", label: "Photos", kind: "images", max: 24 },
    ],
    partialFields: ["kicker", "title", "intro", "images"],
    create: () => ({
      kicker: "",
      title: "Galerie",
      intro: "",
      pageTitle: false,
      images: [],
    }),
  },
  textBlock: {
    label: "Texte simple",
    description: "Un titre et quelques paragraphes.",
    addable: true,
    fields: [
      kicker,
      title,
      {
        key: "body",
        label: "Texte",
        kind: "textarea",
        help: "Ligne vide : nouveau paragraphe.",
      },
      {
        key: "align",
        label: "Alignement",
        kind: "select",
        options: [
          { value: "left", label: "À gauche" },
          { value: "center", label: "Centré" },
        ],
      },
    ],
    partialFields: ["kicker", "title", "body"],
    create: () => ({
      kicker: "",
      title: "Un titre",
      body: "Votre texte.",
      align: "left",
    }),
  },
  textImage: {
    label: "Texte et image",
    description: "Un texte à côté d’une photo.",
    addable: true,
    fields: [
      kicker,
      title,
      {
        key: "body",
        label: "Texte",
        kind: "textarea",
        help: "Ligne vide : nouveau paragraphe.",
      },
      { key: "image", label: "Photo", kind: "image" },
      {
        key: "imageSide",
        label: "Position de la photo",
        kind: "select",
        options: [
          { value: "left", label: "À gauche" },
          { value: "right", label: "À droite" },
        ],
      },
      { key: "cta", label: "Bouton", kind: "link" },
    ],
    partialFields: ["kicker", "title", "body", "image"],
    create: () => ({
      kicker: "",
      title: "Un titre",
      body: "Votre texte.",
      image: { src: "/cms/restaurant.svg", alt: "Illustration de restaurant" },
      imageSide: "right",
      cta: { label: "", href: "" },
    }),
  },
  video: {
    label: "Vidéo",
    description: "Une vidéo importée ou YouTube / Vimeo.",
    addable: true,
    fields: [
      kicker,
      title,
      { key: "caption", label: "Légende", kind: "text" },
      { key: "source", label: "Vidéo", kind: "video" },
    ],
    partialFields: ["kicker", "title", "caption", "source"],
    create: () => ({
      kicker: "",
      title: "En vidéo",
      caption: "",
      source: { kind: "file", src: "", poster: "" },
    }),
  },
  faq: {
    label: "Questions fréquentes",
    description: "Questions et réponses dépliables.",
    addable: true,
    fields: [kicker, title, { key: "items", label: "Questions", kind: "faq" }],
    partialFields: ["kicker", "title", "items"],
    create: () => ({
      kicker: "UNE QUESTION ?",
      title: "Questions fréquentes",
      items: [
        {
          question: "Peut-on commander à l’avance ?",
          answer: "Oui, choisissez votre créneau au moment de commander.",
        },
      ],
    }),
  },
  cta: {
    label: "Appel à l’action",
    description: "Un message court et un bouton.",
    addable: true,
    fields: [
      title,
      { key: "text", label: "Texte", kind: "textarea" },
      { key: "link", label: "Bouton", kind: "link" },
      {
        key: "tone",
        label: "Couleur",
        kind: "select",
        options: [
          { value: "pink", label: "Rose" },
          { value: "dark", label: "Foncé" },
          { value: "light", label: "Clair" },
        ],
      },
    ],
    partialFields: ["title", "text", "link"],
    create: () => ({
      title: "Une petite faim ?",
      text: "",
      link: { label: "Commander", href: "/commander" },
      tone: "pink",
    }),
  },
  promoBanner: {
    label: "Bannière promotionnelle",
    description: "Un message mis en avant sur toute la largeur.",
    addable: true,
    fields: [
      { key: "text", label: "Message", kind: "text" },
      { key: "link", label: "Lien", kind: "link" },
    ],
    partialFields: ["text", "link"],
    create: () => ({
      text: "Offre du moment : …",
      link: { label: "J’en profite", href: "/commander" },
    }),
  },
  categories: {
    label: "Catégories de produits",
    description: "Les catégories de la carte, à jour.",
    addable: true,
    fields: [kicker, title],
    partialFields: ["kicker", "title"],
    liveData: { label: "Catégories", module: "shop-settings" },
    create: () => ({ kicker: "LA CARTE", title: "Toutes nos *envies*" }),
  },
  hours: {
    label: "Horaires",
    description: "Les horaires d’ouverture, à jour.",
    addable: true,
    fields: [
      { key: "title", label: "Titre", kind: "text" },
      { key: "note", label: "Mention", kind: "text" },
    ],
    partialFields: ["title", "note"],
    liveData: { label: "Horaires", module: "shop-settings" },
    create: () => ({ title: "Nos horaires", note: "" }),
  },
  estimation: {
    label: "Simulateur d’estimation",
    description: "Invite vos visiteurs à estimer le prix de leur projet en ligne.",
    addable: true,
    addon: "estimation-studio",
    fields: [kicker, title, { key: "lead", label: "Texte", kind: "textarea" }, { key: "buttonLabel", label: "Texte du bouton", kind: "text" }],
    partialFields: ["kicker", "title", "lead", "buttonLabel"],
    liveData: { label: "Simulateur configuré dans l’add-on Estimation", module: "estimation" },
    create: () => ({ kicker: "DEVIS EN LIGNE", title: "Estimez votre *projet* en 1 minute", lead: "Choisissez ce qui vous intéresse et obtenez un prix indicatif immédiatement.", buttonLabel: "Lancer l’estimation" }),
  },
  loyalty: {
    label: "Programme de fidélité",
    description: "Présente vos avantages fidélité et invite à créer un compte.",
    addable: true,
    addon: "loyalty",
    fields: [kicker, title, { key: "lead", label: "Texte", kind: "textarea" }, { key: "perks", label: "Avantages", kind: "list", max: 6 }, { key: "buttonLabel", label: "Texte du bouton", kind: "text" }],
    partialFields: ["kicker", "title", "lead", "perks", "buttonLabel"],
    liveData: { label: "Points et récompenses", module: "customers" },
    create: () => ({ kicker: "PROGRAMME FIDÉLITÉ", title: "Chaque visite vous *rapporte*", lead: "Cumulez des points à chaque commande et profitez de récompenses réservées à nos habitués.", perks: ["Des points à chaque commande", "Des récompenses exclusives", "Une surprise pour votre anniversaire"], buttonLabel: "Rejoindre le programme" }),
  },
  reservation: {
    label: "Réservation de table",
    description: "Un appel à réserver qui mène au formulaire de réservation.",
    addable: true,
    addon: "booking",
    fields: [kicker, title, { key: "lead", label: "Texte", kind: "textarea" }, { key: "buttonLabel", label: "Texte du bouton", kind: "text" }],
    partialFields: ["kicker", "title", "lead", "buttonLabel"],
    liveData: { label: "Disponibilités de la salle", module: "reservations" },
    create: () => ({ kicker: "RÉSERVATION", title: "Votre table vous *attend*", lead: "Réservez en quelques secondes, nous confirmons rapidement votre demande.", buttonLabel: "Réserver une table" }),
  },
  allergens: {
    label: "Tableau des allergènes",
    description: "Les allergènes de chaque produit de la carte, toujours à jour.",
    addable: true,
    addon: "menu-allergens",
    fields: [kicker, title, { key: "lead", label: "Texte", kind: "textarea" }],
    partialFields: ["kicker", "title", "lead"],
    liveData: { label: "Allergènes de la carte", module: "trade-tools" },
    create: () => ({ kicker: "TRANSPARENCE", title: "Les *allergènes* de notre carte", lead: "Une question ? Notre équipe vous renseigne avec plaisir." }),
  },
  delivery: {
    label: "Zones de livraison",
    description: "Vos zones, frais et délais de livraison, avec un vérificateur de code postal.",
    addable: true,
    addon: "shipping-rules",
    fields: [kicker, title, { key: "lead", label: "Texte", kind: "textarea" }, { key: "checker", label: "Afficher le vérificateur de code postal", kind: "boolean" }],
    partialFields: ["kicker", "title", "lead"],
    liveData: { label: "Zones de livraison", module: "trade-tools" },
    create: () => ({ kicker: "LIVRAISON", title: "On vous *livre* ?", lead: "Vérifiez si votre adresse est couverte et découvrez nos frais de livraison.", checker: true }),
  },
  bundles: {
    label: "Formules et lots",
    description: "Vos lots actifs, leur contenu et l’économie réalisée.",
    addable: true,
    addon: "product-bundles",
    fields: [kicker, title, { key: "lead", label: "Texte", kind: "textarea" }],
    partialFields: ["kicker", "title", "lead"],
    liveData: { label: "Lots actifs", module: "trade-tools" },
    create: () => ({ kicker: "BONS PLANS", title: "Nos *formules*", lead: "Des associations gourmandes, à prix doux." }),
  },
  services: {
    label: "Nos prestations",
    description: "Le catalogue de vos prestations avec durée et prix.",
    addable: true,
    addon: "appointment-booking",
    fields: [kicker, title, { key: "lead", label: "Texte", kind: "textarea" }, { key: "buttonLabel", label: "Texte du bouton", kind: "text" }, { key: "buttonLink", label: "Lien du bouton (tél:, https:// ou /page)", kind: "text" }],
    partialFields: ["kicker", "title", "lead", "buttonLabel", "buttonLink"],
    liveData: { label: "Prestations de l’agenda", module: "trade-tools" },
    create: () => ({ kicker: "PRESTATIONS", title: "Nos *prestations*", lead: "Des soins pensés pour vous, réalisés par une équipe passionnée.", buttonLabel: "Prendre rendez-vous", buttonLink: "/contact" }),
  },
  offerServices: {
    label: "Nos services",
    description: "Les services créés dans Gestion › Services et marqués « Sur le site » : durée, prix et disponibilités.",
    addable: true,
    fields: [
      kicker, title,
      { key: "lead", label: "Texte", kind: "textarea" },
      { key: "category", label: "Catégorie affichée (vide = toutes)", kind: "text" },
      { key: "limit", label: "Nombre de services (0 = tous)", kind: "number", min: 0, max: 100 },
      { key: "buttonLabel", label: "Texte du bouton", kind: "text" },
      { key: "buttonLink", label: "Lien du bouton (tél:, https:// ou /page)", kind: "text" },
    ],
    partialFields: ["kicker", "title", "lead", "buttonLabel", "buttonLink"],
    liveData: { label: "Services, durées, prix et disponibilités", module: "services" },
    create: () => ({ kicker: "NOS SERVICES", title: "Ce que nous *faisons* pour vous", lead: "Des prestations claires, avec leur durée et leur prix.", category: "", limit: 0, buttonLabel: "Nous contacter", buttonLink: "/contact" }),
  },
  offerProducts: {
    label: "Nos produits",
    description: "Les produits créés dans Gestion › Produits et marqués « Sur le site » : photos, prix, délais et disponibilité.",
    addable: true,
    fields: [
      kicker, title,
      { key: "lead", label: "Texte", kind: "textarea" },
      { key: "category", label: "Catégorie affichée (vide = toutes)", kind: "text" },
      { key: "limit", label: "Nombre de produits (0 = tous)", kind: "number", min: 0, max: 100 },
      { key: "buttonLabel", label: "Texte du bouton", kind: "text" },
      { key: "buttonLink", label: "Lien du bouton (tél:, https:// ou /page)", kind: "text" },
    ],
    partialFields: ["kicker", "title", "lead", "buttonLabel", "buttonLink"],
    liveData: { label: "Produits, prix, délais et disponibilité", module: "products" },
    create: () => ({ kicker: "NOS PRODUITS", title: "À découvrir *en boutique*", lead: "Une sélection de produits, disponibles en retrait ou en livraison.", category: "", limit: 0, buttonLabel: "Nous contacter", buttonLink: "/contact" }),
  },
  legal: {
    label: "Compléments de la page légale",
    description: "Paragraphes ajoutés après le texte légal de base.",
    addable: false,
    fields: [
      {
        key: "extra",
        label: "Paragraphes complémentaires",
        kind: "list",
        max: 10,
      },
    ],
    partialFields: ["extra"],
  },
  system: {
    label: "Bloc fonctionnel protégé",
    description: "Commande, paiement, compte ou formulaire : non modifiable.",
    addable: false,
    fields: [],
    partialFields: [],
  },
};
export const systemBlockLabels = {
  orderStart: "Début de commande",
  tracking: "Suivi de commande",
  account: "Espace client",
  reviewForm: "Formulaire d’avis",
  reservationForm: "Formulaire de réservation",
} as const;

export const pageKindLabels = {
  content: "Personnalisable",
  partial: "Partiellement personnalisable",
  protected: "Protégée",
  legal: "Page légale",
  custom: "Page créée",
} as const;

/** Route of a page key ("home" is the root). */
export const pageRoute = (key: string) => (key === "home" ? "/" : `/${key}`);

export function sectionLabel(s: Section) {
  return s.type === "system"
    ? systemBlockLabels[s.props.block]
    : registry[s.type].label;
}
/** Types an administrator may add on a page of this kind. */
export function addableTypes(
  config: SiteConfig,
  kind: string,
  allowed: SectionType[],
) {
  void config;
  if (kind !== "content" && kind !== "custom") return [];
  return (Object.keys(registry) as SectionType[]).filter(
    (t) => registry[t].addable && allowed.includes(t),
  );
}
