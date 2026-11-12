
/**
 * Contenu pré-rempli pour chaque modèle : textes, images et vidéos qui font
 * vivre le template. Appliqué par `applySiteTemplate` en plus du thème et de
 * la composition. Les champs absents conservent le contenu par défaut.
 */
export type TemplateContent = {
  hero?: {
    kicker?: string;
    title?: string;
    lead?: string;
    badges?: { icon: string; label: string }[];
    image?: { src: string; alt: string };
    sticker?: boolean;
    floatingText?: string;
    primary?: { label: string; href: string };
    secondary?: { label: string; href: string };
  };
  about?: {
    image?: { src: string; alt: string };
    artCaption?: string;
    kicker?: string;
    title?: string;
    paragraphs?: string[];
    cta?: { label: string; href: string };
  };
  marquee?: { items: string[] };
  featuredProducts?: {
    kicker?: string;
    title?: string;
    aside?: string;
    note?: string;
    limit?: number;
    allLink?: { label: string; href: string };
  };
  reviews?: {
    kicker?: string;
    title?: string;
    text?: string;
    rateLabel?: string;
    viewLabel?: string;
    sheetLabel?: string;
    cardCaption?: string;
  };
  visit?: {
    kicker?: string;
    title?: string;
    hoursTitle?: string;
    hoursNote?: string;
    cta?: { label: string; href: string };
    burger?: boolean;
    burgerOpen?: string;
    burgerClosed?: string;
    burgerHint?: string;
  };
  map?: {
    kicker?: string;
    title?: string;
    buttonLabel?: string;
  };
  gallery?: {
    kicker?: string;
    title?: string;
    intro?: string;
    images?: { src: string; alt: string }[];
  };
  video?: {
    kicker?: string;
    title?: string;
    caption?: string;
    source?: { kind: "file"; src: string; poster: string };
  };
};

export const templateContent: Record<string, TemplateContent> = {
  bistrot: {
    hero: {
      kicker: "BIENVENUE AU BISTROT",
      title: "Le goût des *bons moments.*",
      lead: "Une table en bois, une carte du jour et le parfum du café : le bistrot comme on l’aime, sans chichi, avec du cœur.",
      badges: [
        { icon: "bag", label: "Sur place ou à emporter" },
        { icon: "clock", label: "Service continu" },
        { icon: "card", label: "Commande en ligne" },
        { icon: "wallet", label: "Paiement sur place" },
      ],
      image: { src: "/cms/bistrot/hero.jpg", alt: "Intérieur d’un bistrot chaleureux" },
      sticker: true,
      floatingText: "Encore\nun verre ?",
      primary: { label: "Découvrir la carte", href: "/carte" },
      secondary: { label: "Réserver une table", href: "/reservations" },
    },
    about: {
      image: { src: "/cms/bistrot/about.jpg", alt: "Plat du jour servi au comptoir" },
      artCaption: "VOTRE TABLE.\nVOTRE HISTOIRE.",
      kicker: "NOTRE MAISON",
      title: "Un petit lieu.\n*Une grande dose\nde bonne humeur.*",
      paragraphs: [
        "Ici, on cuisine comme à la maison : des produits de saison, des recettes de famille et le sourire en plus.",
        "Le midi, c’est le plat du jour et l’ambiance du comptoir. Le soir, on ralentit, on partage, on trinque.",
      ],
      cta: { label: "Ma prochaine pause", href: "/commander#start" },
    },
    marquee: {
      items: ["LE GOÛT DU PARTAGE", "CARTE DU JOUR", "ZINC ET CONVIVIALITÉ", "LE GOÛT DU PARTAGE"],
    },
    featuredProducts: {
      kicker: "LA CARTE DES ENVIES",
      title: "Nos incontournables.\n*Du jour.*",
      aside: "Petit creux ou grosse envie,\nil y a toujours un bon match.",
      note: "Carte, prix et illustrations de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "VOTRE AVIS COMPTE",
      title: "Ils en *parlent*",
      text: "Consultez les retours laissés sur la fiche officielle de votre bistrot et partagez votre propre expérience.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "ON SE RETROUVE ?",
      title: "Votre prochain\n*happy place.*",
      hoursTitle: "Le bon moment pour craquer",
      hoursNote: "Horaires de démonstration · à confirmer",
      cta: { label: "Choisir mon créneau", href: "/commander" },
      burger: true,
      burgerOpen: "Toutes les saveurs.",
      burgerClosed: "Découvrez la composition.",
      burgerHint: "Survolez pour découvrir chaque ingrédient",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "La gourmandise est juste ici.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Les couleurs du bistrot",
      intro: "La galerie officielle sera publiée ici après validation des photos par l’établissement.",
      images: [
        { src: "/cms/bistrot/gallery1.jpg", alt: "Salle du bistrot" },
        { src: "/cms/bistrot/gallery2.jpg", alt: "Plat du jour" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le bistrot en *mouvement*",
      caption: "Découvrez l’ambiance de la maison en quelques secondes.",
      source: { kind: "file", src: "/cms/bistrot/video.mp4", poster: "/cms/bistrot/hero.jpg" },
    },
  },
};
