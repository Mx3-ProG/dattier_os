
/**
 * Contenu pré-rempli pour chaque modèle : textes, images et vidéos qui font
 * vivre le template. Appliqué par `applySiteTemplate` en plus du thème et de
 * la composition. Les champs absents conservent le contenu par défaut.
 *
 * Photos et vidéos : Pexels License (usage commercial libre).
 * Sources listées dans `public/cms/assets-credits.json`.
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
  blogList?: {
    kicker?: string;
    title?: string;
    intro?: string;
    articles?: {
      title: string;
      excerpt: string;
      image: { src: string; alt: string };
      date: string;
      href: string;
    }[];
  };
};

export const templateContent: Record<string, TemplateContent> = {
  /* ── Restauration ─────────────────────────────────────────────────────── */
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
      image: { src: "/cms/bistrot/hero.jpg", alt: "Serveur dressant une assiette dans une salle de bistrot" },
      sticker: true,
      floatingText: "Encore\nun verre ?",
      primary: { label: "Voir la carte du jour", href: "/carte" },
      secondary: { label: "Réserver une table", href: "/reservations" },
    },
    about: {
      image: { src: "/cms/bistrot/about.jpg", alt: "Assiette du jour au bistrot" },
      artCaption: "LE ZINC.\nLA CARTE DU JOUR.",
      kicker: "NOTRE MAISON",
      title: "Un petit lieu.\n*Une grande dose\nde bonne humeur.*",
      paragraphs: [
        "Ici, on cuisine comme à la maison : des produits de saison, des recettes de famille et le sourire en plus.",
        "Le midi, c’est le plat du jour et l’ambiance du comptoir. Le soir, on ralentit, on partage, on trinque.",
      ],
      cta: { label: "Réserver ma place", href: "/reservations" },
    },
    marquee: {
      items: ["LE GOÛT DU PARTAGE", "CARTE DU JOUR", "ZINC ET CONVIVIALITÉ", "LE GOÛT DU PARTAGE"],
    },
    featuredProducts: {
      kicker: "LA CARTE DU JOUR",
      title: "Ce qu’on prépare\n*aujourd’hui.*",
      aside: "Chaque plat est écrit au crayon,\nchaque matin, selon l’arrivage.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "ILS REVIENNENT",
      title: "Les habitués\n*en parlent.*",
      text: "Repérez la fiche officielle de votre bistrot pour laisser un avis ou lire ceux des autres.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "ON SE RETROUVE ?",
      title: "Votre prochain\n*happy place.*",
      hoursTitle: "Ouvert tous les jours",
      hoursNote: "Service midi et soir · à confirmer",
      cta: { label: "Choisir mon créneau", href: "/reservations" },
      burger: true,
      burgerOpen: "Toutes les saveurs.",
      burgerClosed: "Découvrez la composition.",
      burgerHint: "Survolez pour découvrir chaque ingrédient",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au coin de la rue, c’est là.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Les couleurs du bistrot",
      intro: "Quelques images de la maison pour donner envie avant même de pousser la porte.",
      images: [
        { src: "/cms/bistrot/gallery1.jpg", alt: "Salle et comptoir du bistrot" },
        { src: "/cms/bistrot/gallery2.jpg", alt: "Table dressée au bistrot" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le bistrot *en mouvement*",
      caption: "Quelques secondes pour sentir l’ambiance avant votre première venue.",
      source: { kind: "file", src: "/cms/bistrot/video.mp4", poster: "/cms/bistrot/hero.jpg" },
    },
  },

  jardin: {
    hero: {
      kicker: "CUISINE VÉGÉTALE",
      title: "Une cuisine *pleine de vie.*",
      lead: "Des légumes de saison, des assaisonnements maison et des assiettes colorées qui donnent envie de recommencer.",
      badges: [
        { icon: "sparkles", label: "Produits de saison" },
        { icon: "bag", label: "Sur place ou à emporter" },
        { icon: "wallet", label: "Menu déjeuner à 15 €" },
      ],
      image: { src: "/cms/jardin/hero.jpg", alt: "Légumes frais de saison en cuisine végétale" },
      sticker: false,
      floatingText: "100 %\nvégétal",
      primary: { label: "Voir le menu du jour", href: "/carte" },
      secondary: { label: "Notre histoire", href: "/histoire" },
    },
    about: {
      image: { src: "/cms/jardin/about.jpg", alt: "Assiette végétarienne colorée" },
      artCaption: "DU JARDIN\nÀ L’ASSIETTE.",
      kicker: "NOTRE APPROCHE",
      title: "Le végétal,\n*sans compromis.*",
      paragraphs: [
        "Nous choisissons chez des maraîchers de la région, en circuit court, et cuisine tout sur place, chaque jour.",
        "La carte suit les saisons : des assiettes colorées, généreuses, et toujours une option végétale pour tout le monde.",
      ],
      cta: { label: "Découvrir la carte", href: "/carte" },
    },
    marquee: {
      items: ["LE VÉGÉTAL EST DE SAISON", "CIRCUIT COURT", "Cuisine du marché", "LE VÉGÉTAL EST DE SAISON"],
    },
    featuredProducts: {
      kicker: "LA CARTE VÉGÉTALE",
      title: "Ce qu’on cueille\n*et cuisine.*",
      aside: "Des assiettes complètes, végétales ou non,\nservies avec du pain maison.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "VOS MOTS DOUCES",
      title: "La table *approuve.*",
      text: "Votre retour nous aide à ajuster les assiettes, les assaisonnements et les suggestions.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "PASSEZ VOUS",
      title: "Un jardin,\n*au cœur de la ville.*",
      hoursTitle: "Du mardi au samedi",
      hoursNote: "Déjeuner 12h–14h · dîner 19h–22h",
      cta: { label: "Réserver une table", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Derrière la grande vitre verte.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Les couleurs du jardin",
      intro: "Herbes, légumes et lumière : l’année de la saison en images.",
      images: [
        { src: "/cms/jardin/gallery1.jpg", alt: "Étal de légumes frais" },
        { src: "/cms/jardin/gallery2.jpg", alt: "Feuillage du jardin" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le jardin *en mouvement*",
      caption: "De la planche au marché à l’assiette, sans détour.",
      source: { kind: "file", src: "/cms/jardin/video.mp4", poster: "/cms/jardin/hero.jpg" },
    },
  },

  comptoir: {
    hero: {
      kicker: "STREET FOOD · À EMPORTER",
      title: "Une faim. *Une vraie envie.*",
      lead: "Commande en deux minutes, paiement au comptoir, et une cuisine qui ne traîne pas : la street food comme on l’aime.",
      badges: [
        { icon: "bag", label: "Commande en ligne" },
        { icon: "clock", label: "Prêt en 10 minutes" },
        { icon: "card", label: "Paiement sans contact" },
      ],
      image: { src: "/cms/comptoir/hero.jpg", alt: "Comptoir de street food en service" },
      sticker: true,
      floatingText: "C’EST\nFAIM.",
      primary: { label: "Commander maintenant", href: "/commander" },
      secondary: { label: "Voir la carte", href: "/carte" },
    },
    about: {
      image: { src: "/cms/comptoir/about.jpg", alt: "Street food préparée au comptoir" },
      artCaption: "LA STREET.\nÀ LA COUPE.",
      kicker: "LA FAÇON COMTOIR",
      title: "Rapide, franc,\n*sans détour.*",
      paragraphs: [
        "On prépare à la minute, devant vous. Pas de serveur, pas d’attente : vous commandez, vous récupérez, vous mangez.",
        "Les classiques sont invariants, les suggestions changent chaque semaine selon l’humeur du comptoir.",
      ],
      cta: { label: "Je commande", href: "/commander#start" },
    },
    marquee: {
      items: ["COMMANDE EN 2 MINUTES", "PRÊT EN 10 MINUTES", "SANS ATTENTE", "COMMANDE EN 2 MINUTES"],
    },
    featuredProducts: {
      kicker: "LES INCONTOURNABLES",
      title: "Ce que tout le monde\n*commande.*",
      aside: "Les plats les plus commandés,\nprêts en quelques minutes.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir la carte complète", href: "/carte" },
    },
    reviews: {
      kicker: "ILS ONT COMMANDÉ",
      title: "La preuve\n*en bouche.*",
      text: "Vos avis nous servent à ajuster les assaisonnements et à faire remonter les plats du comptoir.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "RETROUVEZ-NOUS",
      title: "Le comptoir\n*vous attend.*",
      hoursTitle: "Ouvert 7j/7",
      hoursNote: "Service continu de 11h à 23h",
      cta: { label: "Commander à emporter", href: "/commander" },
      burger: true,
      burgerOpen: "Toutes les saveurs.",
      burgerClosed: "Découvrez la composition.",
      burgerHint: "Survolez pour découvrir chaque ingrédient",
    },
    map: {
      kicker: "OÙ NOUS TROUVER",
      title: "Au comptoir, c’est simple.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Le comptoir en action",
      intro: "La cuisine, la file, les assiettes : l’envie avant la première bouchée.",
      images: [
        { src: "/cms/comptoir/gallery1.jpg", alt: "Service au comptoir" },
        { src: "/cms/comptoir/gallery2.jpg", alt: "Préparation d’un plat" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Derrière le *comptoir*",
      caption: "L’assemblage en 30 secondes, comme un chef-d’œuvre éphémère.",
      source: { kind: "file", src: "/cms/comptoir/video.mp4", poster: "/cms/comptoir/hero.jpg" },
    },
  },

  pause: {
    hero: {
      kicker: "CAFÉ · PÂTISSERIE",
      title: "Votre pause *préférée.*",
      lead: "Un café bien fait, une viennoiserie tout juste sortie du four, et un coin où l’on peut rester plus longtemps que prévu.",
      badges: [
        { icon: "clock", label: "Ouvert dès 7h30" },
        { icon: "sparkles", label: "Viennoiseries du matin" },
        { icon: "wallet", label: "Wifi et prises" },
      ],
      image: { src: "/cms/pause/hero.jpg", alt: "Café et pâtisserie sur un comptoir en bois" },
      sticker: true,
      floatingText: "Encore\nun café ?",
      primary: { label: "Voir la vitrine", href: "/carte" },
      secondary: { label: "Trouver le café", href: "/contact" },
    },
    about: {
      image: { src: "/cms/pause/about.jpg", alt: "Pâtisserie maison au café" },
      artCaption: "LE CAFÉ.\nLA VITRINE.",
      kicker: "LE CÔTÉ DOUX",
      title: "Douceur, calme,\n*et du goût.*",
      paragraphs: [
        "Le café est torréfié pour nous, la viennoiserie est façonnée chaque matin, et rien n’est pressé dans la salle.",
        "Un espace de travail le matin, une pause l’après-midi, un goûter en famille le week-end.",
      ],
      cta: { label: "Réserver une table", href: "/reservations" },
    },
    marquee: {
      items: ["CAFÉ FRAIS DU MATIN", "VIENNOISERIE CHAQUE JOUR", "ESPACE DE TRAVAIL", "CAFÉ FRAIS DU MATIN"],
    },
    featuredProducts: {
      kicker: "LA VITRINE DU JOUR",
      title: "Douceurs\n*du matin.*",
      aside: "Pâtisseries, viennoiseries et sandwichs\npréparés chaque jour.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir la vitrine", href: "/carte" },
    },
    reviews: {
      kicker: "VOS PRÉFÉRENCES",
      title: "Vos lugares\n*préférés.*",
      text: "Dites-nous ce que vous préférez : on ajustera la vitrine et les suggestions de la semaine.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "REJOIGNEZ-NOUS",
      title: "On est là,\n*du matin au soir.*",
      hoursTitle: "Ouvert tous les jours",
      hoursNote: "De 7h30 à 19h · week-end jusqu’à 18h",
      cta: { label: "Réserver une table", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au coin de la rue, sous l’enseigne.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "L’intérieur du café",
      intro: "La salle, la vitrine, la lumière d’après-midi.",
      images: [
        { src: "/cms/pause/gallery1.jpg", alt: "Salle du café" },
        { src: "/cms/pause/gallery2.jpg", alt: "Vitrine de pâtisseries" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "La vitrine *en mouvement*",
      caption: "Le four ouvert, les viennoiseries qui dorent, la salle qui se réveille.",
      source: { kind: "file", src: "/cms/pause/video.mp4", poster: "/cms/pause/hero.jpg" },
    },
  },

  signature: {
    hero: {
      kicker: "RESTAURANT GASTRONOMIQUE",
      title: "L’émotion *à votre table.*",
      lead: "Une carte courte, des produits d’exception et le temps qu’il faut : ici, on dîne, on ne se presse pas.",
      badges: [
        { icon: "star", label: "Menu dégustation" },
        { icon: "clock", label: "Réservation conseillée" },
        { icon: "sparkles", label: "Sommellerie" },
      ],
      image: { src: "/cms/signature/hero.jpg", alt: "Table dressée d’une table gastronomique" },
      sticker: false,
      floatingText: "Entrée\nen matière.",
      primary: { label: "Réserver une table", href: "/reservations" },
      secondary: { label: "Découvrir la carte", href: "/carte" },
    },
    about: {
      image: { src: "/cms/signature/about.jpg", alt: "Assiette gastronomique dressée" },
      artCaption: "LE GESTE.\nLE PRODUIT.",
      kicker: "NOTRE DEMARCHE",
      title: "Peu d’ingrédients.\n*Beaucoup de justesse.*",
      paragraphs: [
        "Nous choisissons trois ou quatre producteurs et nous laissé conter le reste. Chaque assiette est un équilibre, pas un empilement.",
        "Le dressage vient d’ici, le produit vient de là, et l’on ne retient que ce qui compte vraiment.",
      ],
      cta: { label: "Réserver une table", href: "/reservations" },
    },
    marquee: {
      items: ["CARTE COURTE", "PRODUITS D’EXCEPTION", "SOMMELLERIE", "CARTE COURTE"],
    },
    featuredProducts: {
      kicker: "LA CARTE DU MOMENT",
      title: "Ce que la cuisine\n*propose ce soir.*",
      aside: "Une carte qui suit le marché\net l’inspiration du chef.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LA CRITIQUE",
      title: "Ils ont écrit\n*sur nous.*",
      text: "Les critiques et les avis de nos clients, tous réunis, pour se faire une idée avant de venir.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "NOUS TROUVEZ",
      title: "Au calme,\n*au centre.*",
      hoursTitle: "Du mardi au samedi",
      hoursNote: "Service à partir de 19h · à confirmer",
      cta: { label: "Choisir mon créneau", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Une adresse à connaître.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "La maison en images",
      intro: "La salle, le dressage, les produits : l’univers de la maison.",
      images: [
        { src: "/cms/signature/gallery1.jpg", alt: "Dressage d’une assiette" },
        { src: "/cms/signature/gallery2.jpg", alt: "Salle du restaurant" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "La cuisine *en mouvement*",
      caption: "Le geste du chef, filmé au plus près de la passe.",
      source: { kind: "file", src: "/cms/signature/video.mp4", poster: "/cms/signature/hero.jpg" },
    },
  },

  riviera: {
    hero: {
      kicker: "CUISINE MÉDITERRANÉENNE",
      title: "Le soleil *se partage.*",
      lead: "Poissons du jour, légumes grillés et tables qui débordent : la Méditerranée comme on la vit, à l’heure du déjeuner.",
      badges: [
        { icon: "pin", label: "Face au port" },
        { icon: "bag", label: "À emporter aussi" },
        { icon: "card", label: "Réservation en ligne" },
      ],
      image: { src: "/cms/riviera/hero.jpg", alt: "Table en terrasse au bord de l’eau" },
      sticker: false,
      floatingText: "Ouzaki,\nniçoise,\npêche du jour.",
      primary: { label: "Réserver en terrasse", href: "/reservations" },
      secondary: { label: "Voir la carte", href: "/carte" },
    },
    about: {
      image: { src: "/cms/riviera/about.jpg", alt: "Poisson grillé et légumes du marché" },
      artCaption: "LE LARGE.\nLE SOLEIL.",
      kicker: "DE LA PÊCHE À L’ASSIETTE",
      title: "Le produit du matin,\n*le midi même.*",
      paragraphs: [
        "Le poisson arrive au port le matin et part en cuisine le jour même. Les légumes viennent du marché de la place.",
        "La cuisine est simple, l-oilive et les herbes font le reste, comme sur les tables que nous aimons.",
      ],
      cta: { label: "Réserver en terrasse", href: "/reservations" },
    },
    marquee: {
      items: ["PÊCHE DU JOUR", "LÉGUMES GRILLÉS", "FACE AU PORT", "PÊCHE DU JOUR"],
    },
    featuredProducts: {
      kicker: "LA CARTE DU PORT",
      title: "Ce que la mer\n*et le marché.*",
      aside: "Les arrivages du jour,\nles légumes de la place.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "VOS VACANCES",
      title: "Vos-plus beaux\n*vacances.*",
      text: "Les avis de nos clients sur la table, la vue et l’accueil : tout ce qu’il faut avant de réserver.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LA TERRASSE",
      title: "Face au port,\n*on vous attend.*",
      hoursTitle: "Ouvert tous les jours",
      hoursNote: "Déjeuner 12h–14h30 · dîner 19h–22h",
      cta: { label: "Choisir mon créneau", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "À deux pas du quai.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "L’escapade en images",
      intro: "La terrasse, les assiettes, la lumière de fin de journée.",
      images: [
        { src: "/cms/riviera/gallery1.jpg", alt: "Terrasse face au port" },
        { src: "/cms/riviera/gallery2.jpg", alt: "Assiette méditerranéenne" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "La table *en mouvement*",
      caption: "Le service en terrasse, le temps d’une saison.",
      source: { kind: "file", src: "/cms/riviera/video.mp4", poster: "/cms/riviera/hero.jpg" },
    },
  },

  atelier: {
    hero: {
      kicker: "TABLE CRÉATIVE",
      title: "Le goût *du détail.*",
      lead: "Une cuisine nette, une salle épurée et des assiettes qui commencent par la matière. Tout est calculé, rien n’est en trop.",
      badges: [
        { icon: "sparkles", label: "Cuisine de saison" },
        { icon: "clock", label: "Réservation en ligne" },
        { icon: "wallet", label: "Menu unique" },
      ],
      image: { src: "/cms/atelier/hero.jpg", alt: "Salle contemporaine d’une table créative" },
      sticker: false,
      floatingText: "Chaque détail\ncompte.",
      primary: { label: "Réserver une place", href: "/reservations" },
      secondary: { label: "Découvrir la carte", href: "/carte" },
    },
    about: {
      image: { src: "/cms/atelier/about.jpg", alt: "Assiette créative au dressage épuré" },
      artCaption: "LA MATIÈRE.\nLA LIGNE.",
      kicker: "NOTRE FAÇON DE FAIRE",
      title: "La technique\n*à nu.*",
      paragraphs: [
        "Pas de.jeton, pas de décor superflu : ce qui est dans l’assiette doit avoir une raison d’être.",
        "On travaille le produit brut, la cuisson précise et l’assaisonnement juste. Le reste, c’est de la retenue.",
      ],
      cta: { label: "Réserver une place", href: "/reservations" },
    },
    marquee: {
      items: ["PRODUIT BRUT", "CUISSON PRÉCISE", "SANS DÉCOR SUPERFLU", "PRODUIT BRUT"],
    },
    featuredProducts: {
      kicker: "LE MENU DU JOUR",
      title: "Trois assiettes,\n*une seule idée.*",
      aside: "Un menu unique, changé selon\nl’inspiration et le marché.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir le menu", href: "/carte" },
    },
    reviews: {
      kicker: "CE QU’ON EN DIT",
      title: "La précision\n*remarquée.*",
      text: "Les avis de nos clients sur la cuisine, la salle et l’expérience : la meilleure façon de nous connaître.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LA SALLE",
      title: "Une adresse,\n*un calme.*",
      hoursTitle: "Du mardi au samedi",
      hoursNote: "Service à partir de 19h · à confirmer",
      cta: { label: "Choisir mon créneau", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Une porte discrète, un bon repère.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "L’atelier en images",
      intro: "Le travail du produit, la ligne de l’assiette, la lumière de la salle.",
      images: [
        { src: "/cms/atelier/gallery1.jpg", alt: "Détail du dressage" },
        { src: "/cms/atelier/gallery2.jpg", alt: "Salle de l’atelier" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "La technique *en mouvement*",
      caption: "Le geste du métier, filmé sans emphase.",
      source: { kind: "file", src: "/cms/atelier/video.mp4", poster: "/cms/atelier/hero.jpg" },
    },
  },

  escale: {
    hero: {
      kicker: "CUISINES DU MONDE",
      title: "Le voyage *commence ici.*",
      lead: "Une carte qui change de continent chaque mois : des recettes d’ici, d’ailleurs, et les produits qui vont avec.",
      badges: [
        { icon: "pin", label: "Voyage mensuel" },
        { icon: "sparkles", label: "Recettes d’ailleurs" },
        { icon: "bag", label: "À emporter" },
      ],
      image: { src: "/cms/escale/hero.jpg", alt: "Table chargée d’épices et de plats du monde" },
      sticker: false,
      floatingText: "Ce mois-ci :\nla route d’Orient.",
      primary: { label: "Découvrir la carte", href: "/carte" },
      secondary: { label: "Réserver une table", href: "/reservations" },
    },
    about: {
      image: { src: "/cms/escale/about.jpg", alt: "Épices et ingrédients du monde" },
      artCaption: "UN VOYAGE\nÀ CHAQUE MENSUEL.",
      kicker: "NOTRE ESCALE",
      title: "Un pays,\n*un mois.*",
      paragraphs: [
        "Chaque mois, une cuisine raconte notre carte : le Mexique, le Vietnam, le Liban, le Japon. On achète les produits, on cuisine comme sur place.",
        "Les plats d’ailleurs changent, les classiques restent. Parce qu’on aime bien ce qu’on ne change pas.",
      ],
      cta: { label: "Voir le pays du mois", href: "/carte" },
    },
    marquee: {
      items: ["UN PAYS PAR MOIS", "PRODUITS AUTHENTIQUES", "ESCALE APRÈS ESCALE", "UN PAYS PAR MOIS"],
    },
    featuredProducts: {
      kicker: "L’ESCALE DU MOMENT",
      title: "Ce qui vient\n*d’ailleurs.*",
      aside: "Les plats de la cuisine du mois,\nprêts à être partagés.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LES VOYAGEURS",
      title: "Ils sont\n*partis.*",
      text: "Vos avis nous disent si le voyage vous a plu, et quelle escale vous aimeriez voir ensuite.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "OÙ NOUS TROUVER",
      title: "Poussez la porte,\n*on vous expliquera.*",
      hoursTitle: "Ouvert tous les jours",
      hoursNote: "Midi et soir · à confirmer",
      cta: { label: "Réserver une table", href: "/reservations" },
      burger: true,
      burgerOpen: "Toutes les saveurs.",
      burgerClosed: "Découvrez la composition.",
      burgerHint: "Survolez pour découvrir chaque ingrédient",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Le prochain départ est ici.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Le monde en images",
      intro: "Les ingrédients, les couleurs et les assiettes de nos escales.",
      images: [
        { src: "/cms/escale/gallery1.jpg", alt: "Épices du marché" },
        { src: "/cms/escale/gallery2.jpg", alt: "Assiette inspirée d’ailleurs" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "L’escale *en mouvement*",
      caption: "Le marché, la cuisine, la table : l’escale en une minute.",
      source: { kind: "file", src: "/cms/escale/video.mp4", poster: "/cms/escale/hero.jpg" },
    },
  },

  /* ── Nouveaux métiers ─────────────────────────────────────────────────── */
  pizzeria: {
    hero: {
      kicker: "PIZZERIA · TRATTORIA",
      title: "Le goût de *l’Italie.*",
      lead: "Farine italienne, tomate de San Marzano, mozzarella de Bufala : la pizza comme en Italie, avec les produits de chez nous.",
      badges: [
        { icon: "clock", label: "Feu de bois" },
        { icon: "bag", label: "À emporter" },
        { icon: "card", label: "Commande en ligne" },
      ],
      image: { src: "/cms/pizzeria/hero.jpg", alt: "Pizza sortant du four à bois" },
      sticker: true,
      floatingText: "90 secondes\nau feu de bois.",
      primary: { label: "Commander une pizza", href: "/commander" },
      secondary: { label: "Voir la carte", href: "/carte" },
    },
    about: {
      image: { src: "/cms/pizzeria/about.jpg", alt: "Pizzaiolo formant la pâte" },
      artCaption: "LA FARINE.\nLE FEU.",
      kicker: "NOTRE FOUR",
      title: "La pâte,\n*le feu, le temps.*",
      paragraphs: [
        "La pâte est pétrie la veille, la mozzarella fond sur place, et le four ne s’éteint jamais avant la fermeture.",
        "Les tomates romaines et le basilic frais arrivent en fin de service, comme à Rome. Le reste, c’est notre façon.",
      ],
      cta: { label: "Commander", href: "/commander#start" },
    },
    marquee: {
      items: ["FEU DE BOIS", "PÂTE FERMENTÉE 48 H", "SAN MARZANO", "FEU DE BOIS"],
    },
    featuredProducts: {
      kicker: "NOS PIZZAS",
      title: "Cinq	classiques,\n*une hazaña.*",
      aside: "Les pizzas du jour et la pizza\nblanche de la maison.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LE VERDICT",
      title: "Ils ont noté\n*la croûte.*",
      text: "Les avis de nos clients sur la pâte, la cuisson et le service : le meilleur indicateur pour choisir votre prochaine.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "À TABLE",
      title: "La salle*bouge*.",
      hoursTitle: "Du mardi au dimanche",
      hoursNote: "Service de 18h à 22h30 · à confirmer",
      cta: { label: "Réserver une table", href: "/reservations" },
      burger: true,
      burgerOpen: "Toutes les saveurs.",
      burgerClosed: "Découvrez la composition.",
      burgerHint: "Survolez pour découvrir chaque ingrédient",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "L’odeur vous mettra ici.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Le four et la salle",
      intro: "La pâte qui lève, le four qui ronronne, la salle pleine.",
      images: [
        { src: "/cms/pizzeria/gallery1.jpg", alt: "Four à bois" },
        { src: "/cms/pizzeria/gallery2.jpg", alt: "Pizza discontinuation" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le feu *en mouvement*",
      caption: "La pizza au four, du geste à l’assiette.",
      source: { kind: "file", src: "/cms/pizzeria/video.mp4", poster: "/cms/pizzeria/hero.jpg" },
    },
  },

  sushi: {
    hero: {
      kicker: "CUISINE JAPONAISE",
      title: "La précision *à votre table.*",
      lead: "Le riz à la température exacte, le poisson du jour, un geste en deux secondes : ici, chaque assiette est une partition d’exactitude.",
      badges: [
        { icon: "sparkles", label: "Poisson du jour" },
        { icon: "clock", label: "Sur place uniquement" },
        { icon: "star", label: "Menu omakase" },
      ],
      image: { src: "/cms/sushi/hero.jpg", alt: "Assiette de sushi dressée au restaurant" },
      sticker: false,
      floatingText: "Le geste\nqui compte.",
      primary: { label: "Réserver une place", href: "/reservations" },
      secondary: { label: "Voir la carte", href: "/carte" },
    },
    about: {
      image: { src: "/cms/sushi/about.jpg", alt: "Chef sushi préparant une pièce" },
      artCaption: "LE RIZ.\nLA LIGNE.",
      kicker: "NOTRE FAÇON",
      title: "Trois gestes,\n*rien de plus.*",
      paragraphs: [
        "Le riz est cuit au saké et à l’acidité de yuzu, la pièce est montée à la main, la lame est aiguisée chaque matin.",
        "Nous servons peu de convives pour rester au plus près du produit et de la saison.",
      ],
      cta: { label: "Réserver une place", href: "/reservations" },
    },
    marquee: {
      items: ["RIS CUIT AU SAKÉ", "POISSON DU JOUR", "SERVICE SOIGNÉ", "RIS CUIT AU SAKÉ"],
    },
    featuredProducts: {
      kicker: "LA CARTE",
      title: "Nos pièces\n*du jour.*",
      aside: "Nigiri, maki, sashimi et le\nmenu omakase du soir.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LA MAISON",
      title: "Ils sont\n*revenus.*",
      text: "Vos avis sur le riz, le poisson et l’accueil : la meilleure façon de découvrir la maison avant de s’asseoir.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LA PLACE",
      title: "Douze couverts,\n*une seule adresse.*",
      hoursTitle: "Du mardi au samedi",
      hoursNote: "Deux services par soir · à confirmer",
      cta: { label: "Choisir mon créneau", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Derrière le rideau, une seule salle.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Le comptoir en images",
      intro: "Le bois, la lumière basse et les pièces qui se succèdent.",
      images: [
        { src: "/cms/sushi/gallery1.jpg", alt: "Comptoir du restaurant sushi" },
        { src: "/cms/sushi/gallery2.jpg", alt: "Pièces de sushi" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le geste *en mouvement*",
      caption: "Une pièce montée en deux secondes.",
      source: { kind: "file", src: "/cms/sushi/video.mp4", poster: "/cms/sushi/hero.jpg" },
    },
  },

  coiffeur: {
    hero: {
      kicker: "COIFFURE & BEAUTÉ",
      title: "Votre style, *révélé.*",
      lead: "Un diagnostic honnête, une coupe qui vous ressemble et des conseils que vous pourrez appliquer chez vous.",
      badges: [
        { icon: "clock", label: "Rendez-vous en ligne" },
        { icon: "star", label: "Coiffeurs qualifiés" },
        { icon: "wallet", label: "Carte et espèces" },
      ],
      image: { src: "/cms/coiffeur/hero.jpg", alt: "Salon de coiffure contemporain" },
      sticker: false,
      floatingText: "La coupe\nqui vous va.",
      primary: { label: "Prendre rendez-vous", href: "/reservations" },
      secondary: { label: "Voir les prestations", href: "/carte" },
    },
    about: {
      image: { src: "/cms/coiffeur/about.jpg", alt: "Coiffeur arbeit sur une cliente" },
      artCaption: "LE DIAGNOSTIC.\nLA COUPE.",
      kicker: "LE SALON",
      title: "On écoute,\n*puis on coupe.*",
      paragraphs: [
        "Chaque rendez-vous commence par un diagnostic : votre cheveux, vos habitudes, le temps que vous avez devant vous.",
        "Ensuite seulement on coupe. Et on vous explique comment tenir la coupe entre deux visites.",
      ],
      cta: { label: "Prendre rendez-vous", href: "/reservations" },
    },
    marquee: {
      items: ["DIAGNOSTIC OFFERT", "COIFFEURS QUALIFIÉS", "CONSEILS À LA SORTIE", "DIAGNOSTIC OFFERT"],
    },
    featuredProducts: {
      kicker: "NOS PRESTATIONS",
      title: "Les soins,\n*les prix, la durée.*",
      aside: "Coupe, couleur, soin : chaque\nprestation est annoncée claire.",
      note: "Prestations et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toutes les prestations", href: "/carte" },
    },
    reviews: {
      kicker: "VOS MOTS",
      title: "Ils racontent\n*la coupe.*",
      text: "Avis vérifiés de nos clients sur le résultat, l’accueil et la tenue de la coiffure.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LE SALON",
      title: "On vous attend,\n*stylish.*",
      hoursTitle: "Du mardi au samedi",
      hoursNote: "09h–19h sans pause le samedi · à confirmer",
      cta: { label: "Choisir mon créneau", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au rez-de-chaussée, vitrine en bois.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Le salon en images",
      intro: "Les fauteuils, le miroir, l’ambiance du lieu.",
      images: [
        { src: "/cms/coiffeur/gallery1.jpg", alt: "Fauteuil du salon" },
        { src: "/cms/coiffeur/gallery2.jpg", alt: "Résultat d’une coiffure" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le salon *en mouvement*",
      caption: "Le travail du coiffeur, filmé en gros plan.",
      source: { kind: "file", src: "/cms/coiffeur/video.mp4", poster: "/cms/coiffeur/hero.jpg" },
    },
  },

  loft: {
    hero: {
      kicker: "IMMOBILIER · ARCHITECTURE",
      title: "L’espace *qui vous ressemble.*",
      lead: "Des biens rares, des volumes clairs et beaucoup de lumière : découvrez des lieux qui auront une histoire.",
      badges: [
        { icon: "pin", label: "Visites sur rendez-vous" },
        { icon: "clock", label: "Dossiers suivis en ligne" },
        { icon: "wallet", label: "Estimation offerte" },
      ],
      image: { src: "/cms/loft/hero.jpg", alt: "Loft lumineux avec grandes baies vitrées" },
      sticker: false,
      floatingText: "Un lieu,\nune histoire.",
      primary: { label: "Voir les biens", href: "/carte" },
      secondary: { label: "Demander une estimation", href: "/contact" },
    },
    about: {
      image: { src: "/cms/loft/about.jpg", alt: "Intérieur d’appartement rénové" },
      artCaption: "LA LUMIÈRE.\nLE VOLUME.",
      kicker: "NOTRE APPROCHE",
      title: "Des lieux\n*choisis, pas listés.*",
      paragraphs: [
        "Nous ne listons que des biens que nous avons visités et aimés : la lumière, les volumes, l’état du lieu.",
        "Ensuite, on vous écoute. Vos usages, vos envies, vos délais : on ne vous propose que ce qui colle.",
      ],
      cta: { label: "Parler de votre projet", href: "/contact" },
    },
    marquee: {
      items: ["BIENS VISITÉS ET VALIDÉS", "ESTIMATION OFFERTE", "VISITES SUR RENDEZ-VOUS", "BIENS VISITÉS ET VALIDÉS"],
    },
    featuredProducts: {
      kicker: "NOS BIENS",
      title: "Les adresses\n*en lumière.*",
      aside: "Lofts, appartements et locaux\nà découvrir sur rendez-vous.",
      note: "Biens et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir tous les biens", href: "/carte" },
    },
    reviews: {
      kicker: "LEUR PAROLE",
      title: "Ils ont trouvé\n*leur adresse.*",
      text: "Les avis de nos clients sur l’accompagnement, la clarté et la qualité des visites.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "SUR PLACE",
      title: "Un bien,\n*ça se visite.*",
      hoursTitle: "Du lundi au samedi",
      hoursNote: "Visites sur rendez-vous · à confirmer",
      cta: { label: "Planifier une visite", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au bureau, ou directement sur le bien.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Les lieux en images",
      intro: "Volumes, matières et lumière : un aperçu avant la visite.",
      images: [
        { src: "/cms/loft/gallery1.jpg", alt: "Volume d’un loft" },
        { src: "/cms/loft/gallery2.jpg", alt: "Détail de matière" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le bien *en mouvement*",
      caption: "Une visite, comme si on y était.",
      source: { kind: "file", src: "/cms/loft/video.mp4", poster: "/cms/loft/hero.jpg" },
    },
  },

  chantier: {
    hero: {
      kicker: "BTP · CONSTRUCTION",
      title: "On bâtit *ensemble.*",
      lead: "Des fondations solides, des délais tenus et un chantier où le client sait toujours où il en est.",
      badges: [
        { icon: "clock", label: "Devis en 48 h" },
        { icon: "wallet", label: "Travaux garantis" },
        { icon: "sparkles", label: "Équipe locale" },
      ],
      image: { src: "/cms/chantier/hero.jpg", alt: "Chantier de construction en cours" },
      sticker: false,
      floatingText: "Du plan\nà la clé.",
      primary: { label: "Demander un devis", href: "/contact" },
      secondary: { label: "Voir nos réalisations", href: "/carte" },
    },
    about: {
      image: { src: "/cms/chantier/about.jpg", alt: "Ouvrier sur un chantier" },
      artCaption: "LE CHANTIER.\nLA MÉTHODE.",
      kicker: "NOTRE MÉTHODE",
      title: "Un chantier,\n*un interlocuteur.*",
      paragraphs: [
        "Un seul chef de chantier suit votre projet de la première réunion à la réception : pas de relais, pas de mauvaise surprise.",
        "Les sous-traitants sont nos habits, nos fournisseurs sont vérifiés, et chaque avancement est photo à l’appui.",
      ],
      cta: { label: "Parler de mon projet", href: "/contact" },
    },
    marquee: {
      items: ["DEVIS EN 48 H", "CHEF DE CHANTIER UNIQUE", "GARANTIE DÉCENNALE", "DEVIS EN 48 H"],
    },
    featuredProducts: {
      kicker: "NOS PRESTATIONS",
      title: "Ce que nous\n*savons faire.*",
      aside: "Rénovation, neuf, entretien :\nles lots détaillés et chiffrés.",
      note: "Prestations et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toutes les prestations", href: "/carte" },
    },
    reviews: {
      kicker: "NOS CHANTIERS",
      title: "Ils ont vu\n*le résultat.*",
      text: "Les avis de nos clients sur le suivi, les délais et la qualité des travaux.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "SUR CHANTIER",
      title: "Venez voir\n*nos chantiers.*",
      hoursTitle: "Du lundi au vendredi",
      hoursNote: "Visites sur rendez-vous · à confirmer",
      cta: { label: "Demander un rendez-vous", href: "/contact" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au dépôt ou directement sur le chantier.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Nos réalisations",
      intro: "Avant, pendant, après : le chantier suivi en photos.",
      images: [
        { src: "/cms/chantier/gallery1.jpg", alt: "Gros œuvre en cours" },
        { src: "/cms/chantier/gallery2.jpg", alt: "Chantier terminé" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le chantier *en mouvement*",
      caption: "Une journée de chantier, en accéléré.",
      source: { kind: "file", src: "/cms/chantier/video.mp4", poster: "/cms/chantier/hero.jpg" },
    },
  },

  racing: {
    hero: {
      kicker: "AUTOMOBILE · PERFORMANCE",
      title: "Passez *à la vitesse supérieure.*",
      lead: "Préparation, entretien et performance : chaque machine est suivie par des gens qui connaissent le bruit du moteur.",
      badges: [
        { icon: "star", label: "Atelier spécialisé" },
        { icon: "clock", label: "Diagnostic en 24 h" },
        { icon: "wallet", label: "Devis avant intervention" },
      ],
      image: { src: "/cms/racing/hero.jpg", alt: "Voiture de course sur circuit" },
      sticker: true,
      floatingText: "Vroom.",
      primary: { label: "Prendre rendez-vous", href: "/reservations" },
      secondary: { label: "Voir les prestations", href: "/carte" },
    },
    about: {
      image: { src: "/cms/racing/about.jpg", alt: "Mécanicien au travail sur un moteur" },
      artCaption: "LA MÉCANIQUE.\nLA PRÉCISION.",
      kicker: "L’ATELIER",
      title: "On ne bricole\n*pas votre machine.*",
      paragraphs: [
        "Chaque intervention commence par un diagnostic complet et un devis écrit. On n’y touche pas avant votre accord.",
        "Puis on travaille avec les pièces d’origine ou équivalence certifiée, et on documente chaque étape.",
      ],
      cta: { label: "Prendre rendez-vous", href: "/reservations" },
    },
    marquee: {
      items: ["DIAGNOSTIC EN 24 H", "DEVIS ÉCRIT AVANT", "PIÈCES CERTIFIÉES", "DIAGNOSTIC EN 24 H"],
    },
    featuredProducts: {
      kicker: "NOS PRESTATIONS",
      title: "L’entretien,\n*la préparation, la tune.*",
      aside: "Révision, préparation circuit\net travail moteur.",
      note: "Prestations et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toutes les prestations", href: "/carte" },
    },
    reviews: {
      kicker: "LE PILOTE",
      title: "Ils sont\n*revenus au dépôt.*",
      text: "Les avis de nos clients sur la précision du travail, les délais et la transparence des prix.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "L’ATELIER",
      title: "Poussez la porte,\n*on regarde la machine.*",
      hoursTitle: "Du lundi au vendredi",
      hoursNote: "08h–18h, samedi sur rendez-vous",
      cta: { label: "Choisir mon créneau", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Le dépôt, au bout de la zone industrielle.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "L’atelier en images",
      intro: "Les machines, l’outillage, les traces de travail.",
      images: [
        { src: "/cms/racing/gallery1.jpg", alt: "Voiture préparée" },
        { src: "/cms/racing/gallery2.jpg", alt: "Détail moteur" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "La machine *en mouvement*",
      caption: "Le son d’un moteur qu’on connaît par cœur.",
      source: { kind: "file", src: "/cms/racing/video.mp4", poster: "/cms/racing/hero.jpg" },
    },
  },

  manuscrit: {
    hero: {
      kicker: "BLOG · ÉDITORIAL",
      title: "Les mots *qui comptent.*",
      lead: "Des textes publiés quand ils ont quelque chose à dire, et rien d’autre. Un rythme tranquille, des idées qui restent.",
      badges: [
        { icon: "sparkles", label: "Un article par semaine" },
        { icon: "clock", label: "Newsletter chaque vendredi" },
        { icon: "bag", label: "Sans publicité" },
      ],
      image: { src: "/cms/manuscrit/hero.jpg", alt: "Bureau d’écriture avec carnet ouvert" },
      sticker: false,
      floatingText: "À lire\nau calme.",
      primary: { label: "Lire les derniers articles", href: "/carte" },
      secondary: { label: "S’abonner à la lettre", href: "/contact" },
    },
    about: {
      image: { src: "/cms/manuscrit/about.jpg", alt: "Écriture manuscrite sur une page" },
      artCaption: "LE MANUSCRIT.\nLA VERSION.",
      kicker: "LE BLOG",
      title: "Écrire,\n*puis relire.*",
      paragraphs: [
        "Chaque article part d’une idée simple, passe par trois réécritures et s’arrête quand il ne reste rien à couper.",
        "Nous ne publions pas pour remplir un calendrier. Si l’article n’est pas prêt, il attend.",
      ],
      cta: { label: "Lire le dernier article", href: "/carte" },
    },
    marquee: {
      items: ["UN ARTICLE PAR SEMAINE", "SANS PUBLICITÉ", "LETTRE DU VENDREDI", "UN ARTICLE PAR SEMAINE"],
    },
    featuredProducts: {
      kicker: "À LA UNE",
      title: "Les textes\n*du moment.*",
      aside: "Les derniers articles,\nclassés par date de lecture.",
      note: "Articles de démonstration.",
      limit: 6,
      allLink: { label: "Tous les articles", href: "/carte" },
    },
    reviews: {
      kicker: "VOS MOTS",
      title: "Ils l’ont lu,\n*ils en parlent.*",
      text: "Les réactions de nos lecteurs sur les textes, les sujets et laclrarté du propos.",
      rateLabel: "Laisser un avis",
      viewLabel: "Voir les avis",
      sheetLabel: "Voir la fiche",
      cardCaption: "Avis de lecteurs",
    },
    visit: {
      kicker: "NOUS ÉCRIVONS",
      title: "Une question,\n*un sujet ?*",
      hoursTitle: "Réponse sous 48 h",
      hoursNote: "Du lundi au vendredi",
      cta: { label: "Écrire à la rédaction", href: "/contact" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "OÙ NOUS SOMMES",
      title: "La rédaction, quelque part en ville.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "L’atelier en images",
      intro: "Le bureau, les carnets, les marginalia.",
      images: [
        { src: "/cms/manuscrit/gallery1.jpg", alt: "Carnets de travail" },
        { src: "/cms/manuscrit/gallery2.jpg", alt: "Bureau d’écriture" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "L’écriture *en mouvement*",
      caption: "Une minute dans le métier de lire et d’écrire.",
      source: { kind: "file", src: "/cms/manuscrit/video.mp4", poster: "/cms/manuscrit/hero.jpg" },
    },
    blogList: {
      kicker: "DERNIÈRES PUBLICATIONS",
      title: "Les articles\n*récents.*",
      intro: "Trois textes publiés récemment, à lire tranquillement.",
      articles: [
        {
          title: "Écrire moins, écrire mieux",
          excerpt: "Ce que la rélecture nous apprend sur la clarté d’un texte — et pourquoi la vitesse n’est jamais le bon rythme.",
          image: { src: "/cms/manuscrit/gallery1.jpg", alt: "Carnet de réécriture" },
          date: "6 novembre 2026",
          href: "/carte",
        },
        {
          title: "Le goût des choses simples",
          excerpt: "Pourquoi les sujets les plusstedt ordinaires demandent les descriptions les plus justes.",
          image: { src: "/cms/manuscrit/hero.jpg", alt: "Bureau d’écriture" },
          date: "30 octobre 2026",
          href: "/carte",
        },
        {
          title: "Relire à voix haute",
          excerpt: "Un test simple pour repérer les phrases qui fatiguent, sans stylo rouge ni surligneur.",
          image: { src: "/cms/manuscrit/gallery2.jpg", alt: "Page annotée" },
          date: "16 octobre 2026",
          href: "/carte",
        },
      ],
    },
  },

  assurance: {
    hero: {
      kicker: "ASSURANCE · SÉCURITÉ",
      title: "Votre sécurité, *notre engagement.*",
      lead: "Un contrat clair, un conseiller joignable et des déclarations traitées en 48 heures : la sécurité sans jargon.",
      badges: [
        { icon: "clock", label: "Déclaration en 48 h" },
        { icon: "star", label: "Conseiller dédié" },
        { icon: "wallet", label: "Sans engagement" },
      ],
      image: { src: "/cms/assurance/hero.jpg", alt: "Conseiller en assurance welcoming un client" },
      sticker: false,
      floatingText: "On est là,\njustement.",
      primary: { label: "Demander un devis", href: "/contact" },
      secondary: { label: "Découvrir nos garanties", href: "/carte" },
    },
    about: {
      image: { src: "/cms/assurance/about.jpg", alt: "Échange commercial dans un bureau" },
      artCaption: "LA CONFIANCE.\nLE CONTRAT.",
      kicker: "NOTRE MÉTHODE",
      title: "Un conseiller,\n*pas un standard.*",
      paragraphs: [
        "Vous êtes suivi par une personne : elle connaît votre dossier, votre activité et vos risques réels.",
        "Les garanties sont expliquées en français courant, sans petites lignes ni surprises à la déclaration.",
      ],
      cta: { label: "Parler à un conseiller", href: "/contact" },
    },
    marquee: {
      items: ["CONSEILLER DÉDIÉ", "DÉCLARATION EN 48 H", "SANS JURIDION", "CONSEILLER DÉDIÉ"],
    },
    featuredProducts: {
      kicker: "NOS GARANTIES",
      title: "Les formules,\n*sans surprise.*",
      aside: "Habitation, commerce, flotte :\nles garanties détaillées et tarifées.",
      note: "Garanties et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toutes les garanties", href: "/carte" },
    },
    reviews: {
      kicker: "NOS CLIENTS",
      title: "Ils sont\n*rassurés.*",
      text: "Les avis de nos clients sur la réactivité, la clarté du contrat et la qualité du suivi.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "NOUS RENCONTRER",
      title: "Un café,\n*une explication.*",
      hoursTitle: "Du lundi au vendredi",
      hoursNote: "09h–18h, sur rendez-vous",
      cta: { label: "Prendre rendez-vous", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au bureau, ou à votre domicile.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Notre bureau en images",
      intro: "L’accueil, l’équipe, le temps que l’on prend.",
      images: [
        { src: "/cms/assurance/gallery1.jpg", alt: "Accueil du bureau" },
        { src: "/cms/assurance/gallery2.jpg", alt: "Échange avec un conseiller" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "La confiance *en mouvement*",
      caption: "Ce que nous faisons quand un sinistre survient.",
      source: { kind: "file", src: "/cms/assurance/video.mp4", poster: "/cms/assurance/hero.jpg" },
    },
  },

  patisserie: {
    hero: {
      kicker: "PÂTISSERIE · BOULANGERIE",
      title: "Le sucré *qui fait sourire.*",
      lead: "Beurre AOP, chocolat noir, fruits de saison : des pâtisseries qui se comprennent en une bouchée.",
      badges: [
        { icon: "clock", label: "Cuisson du matin" },
        { icon: "bag", label: "Commande en ligne" },
        { icon: "sparkles", label: "Fait maison" },
      ],
      image: { src: "/cms/patisserie/hero.jpg", alt: "Vitrine de pâtisseries artisanales" },
      sticker: true,
      floatingText: "Encore\nun gâteau ?",
      primary: { label: "Commander une pâtisserie", href: "/commander" },
      secondary: { label: "Voir la vitrine", href: "/carte" },
    },
    about: {
      image: { src: "/cms/patisserie/about.jpg", alt: "Pâtissier glaçant un entremets" },
      artCaption: "LE FOUR.\nLE GOUT.",
      kicker: "LA BOULANGERIE",
      title: "Tout commence\n*au fournil.*",
      paragraphs: [
        "Le pain est pétri et cuit sur place, chaque matin. Les viennoiseries suivent, puis les entremets de la saison.",
        "Nous travaillons avec une courte liste de producteurs, et rien n’est industriel. Même les couleurs des vitrines sont choisies.",
      ],
      cta: { label: "Voir la vitrine du jour", href: "/carte" },
    },
    marquee: {
      items: ["PÉTRI LE MATIN", "BEURRE AOP", "SANS ADDITIF", "PÉTRI LE MATIN"],
    },
    featuredProducts: {
      kicker: "LA VITRINE",
      title: "Ce qui sort\n*du four.*",
      aside: "Pains, viennoiseries et entremets\nrenouvelés chaque jour.",
      note: "Produits et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toute la vitrine", href: "/carte" },
    },
    reviews: {
      kicker: "VOS PRÉFÉRENCES",
      title: "Vous avez\n*vos favoris.*",
      text: "Les avis de nos clients sur la fraîcheur, le goût et la présentation.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LA BOUTIQUE",
      title: "Passez\n*près du fournil.*",
      hoursTitle: "Du mardi au dimanche",
      hoursNote: "07h–19h30, fermé le lundi · à confirmer",
      cta: { label: "Réserver une table", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "L’odeur vous amène.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "La vitrine en images",
      intro: "Les formes, les finitions, la lumière du matin.",
      images: [
        { src: "/cms/patisserie/gallery1.jpg", alt: "Entremets de la maison" },
        { src: "/cms/patisserie/gallery2.jpg", alt: "Pain et viennoiseries" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le fournil *en mouvement*",
      caption: "Pétrissage, tourage, four : la journée en accéléré.",
      source: { kind: "file", src: "/cms/patisserie/video.mp4", poster: "/cms/patisserie/hero.jpg" },
    },
  },

  streetfood: {
    hero: {
      kicker: "STREET FOOD · FOOD TRUCK",
      title: "La faim *n’attend pas.*",
      lead: "Le truck garé sur la place, la file qui sent bon et la commande prise en trente secondes : ici, on mange debout et bien.",
      badges: [
        { icon: "pin", label: "Sur la place, tous les soirs" },
        { icon: "clock", label: "Prêt en 8 minutes" },
        { icon: "card", label: "Paiement sans contact" },
      ],
      image: { src: "/cms/streetfood/hero.jpg", alt: "Food truck éclairé la nuit" },
      sticker: true,
      floatingText: "La nuit,\nça chauffe.",
      primary: { label: "Voir ce qui mijote", href: "/carte" },
      secondary: { label: "Trouver le truck", href: "/contact" },
    },
    about: {
      image: { src: "/cms/streetfood/about.jpg", alt: "Préparation de street food de nuit" },
      artCaption: "LA NUIT.\nLA FILE.",
      kicker: "LE TRUCK",
      title: "Une cuisine\n*qui roule.*",
      paragraphs: [
        "Le camion change de place chaque semaine, mais la recette ne bouge pas : produits frais, cuisson à la minute.",
        "On ouvre à 18h, on ferme quand la file est vidée. Il reste rarement beaucoup de monde dans les assiettes.",
      ],
      cta: { label: "Voir la carte du truck", href: "/carte" },
    },
    marquee: {
      items: ["CUISSON À LA MINUTE", "TOUS LES SOIRS", "PAIEMENT SANS CONTACT", "CUISSON À LA MINUTE"],
    },
    featuredProducts: {
      kicker: "CE QUI MIJOTE",
      title: "Ce soir,\n*on sert.*",
      aside: "La carte du truck,\ncourte et franche.",
      note: "Produits et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LA RUE PARLE",
      title: "Ils ont\n*fait la queue.*",
      text: "Les avis de nos clients sur les portions, les prix et l’ambiance du truck.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "OÙ TROUVER LE TRUCK",
      title: "On bouge,\n*la carte aussi.*",
      hoursTitle: "Du mercredi au dimanche",
      hoursNote: "18h–23h, selon la place · à confirmer",
      cta: { label: "Voir la place du jour", href: "/contact" },
      burger: true,
      burgerOpen: "Toutes les saveurs.",
      burgerClosed: "Découvrez la composition.",
      burgerHint: "Survolez pour découvrir chaque ingrédient",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "La place du jour, c’est ici.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "La nuit en images",
      intro: "Les néons, la file, la vapeur au-dessus des assiettes.",
      images: [
        { src: "/cms/streetfood/gallery1.jpg", alt: "Néon du food truck" },
        { src: "/cms/streetfood/gallery2.jpg", alt: "Assiette de nuit" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le truck *en mouvement*",
      caption: "Le service, la file, la nuit : l’énergie du truck.",
      source: { kind: "file", src: "/cms/streetfood/video.mp4", poster: "/cms/streetfood/hero.jpg" },
    },
  },

  compta: {
    hero: {
      kicker: "COMPTABILITÉ · GESTION",
      title: "Vos chiffres, *notre métier.*",
      lead: "Comptabilité, déclarations, bilans : un cabinet accessible, des délais tenus et des explanations sans jargon.",
      badges: [
        { icon: "clock", label: "Réponse sous 24 h" },
        { icon: "wallet", label: "Forfait clair" },
        { icon: "star", label: "Expert-comptable formé" },
      ],
      image: { src: "/cms/compta/hero.jpg", alt: "Bureau d’expert-comptable" },
      sticker: false,
      floatingText: "Un chiffre,\nune explication.",
      primary: { label: "Demander un devis", href: "/contact" },
      secondary: { label: "Voir nos prestations", href: "/carte" },
    },
    about: {
      image: { src: "/cms/compta/about.jpg", alt: "Expert-comptable vérifiant des documents" },
      artCaption: "LE CHIFFRE.\nLE SENS.",
      kicker: "LE CABINET",
      title: "Comprendre\n*ses comptes.*",
      paragraphs: [
        "Un bilan ne sert à rien si on ne sait pas le lire. Nous commentons chaque poste et vous disons ce qu’il faut surveiller.",
        "Déclarations, paie, TVA, comptes annuels : le calendrier est tenu, et un coup de fil ne coûte pas de plus cher.",
      ],
      cta: { label: "Demander un devis", href: "/contact" },
    },
    marquee: {
      items: ["DÉLAIS TENUS", "FORFAIT CLAIR", "CONSEIL INCLUS", "DÉLAIS TENUS"],
    },
    featuredProducts: {
      kicker: "NOS MISSIONS",
      title: "Ce que nous\n*gérons.*",
      aside: "Comptabilité, déclarations, paie :\nle périmètre, le prix, le délai.",
      note: "Prestations et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toutes les prestations", href: "/carte" },
    },
    reviews: {
      kicker: "NOS CLIENTS",
      title: "Ils comprennent\n*mieux.*",
      text: "Les avis de nos clients sur la disponibilité, la pédagogie et le respect des délais.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LE CABINET",
      title: "On se voit,\n*on récapitule.*",
      hoursTitle: "Du lundi au vendredi",
      hoursNote: "09h–18h, sur rendez-vous",
      cta: { label: "Prendre rendez-vous", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au cabinet ou en visio.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Le cabinet en images",
      intro: "Le bureau, les dossiers, la machine à café qui fait tourner la compta.",
      images: [
        { src: "/cms/compta/gallery1.jpg", alt: "Bureau du cabinet" },
        { src: "/cms/compta/gallery2.jpg", alt: "Documents comptables" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le métier *en mouvement*",
      caption: "Une journée de clôture, en accéléré.",
      source: { kind: "file", src: "/cms/compta/video.mp4", poster: "/cms/compta/hero.jpg" },
    },
  },

  ecole: {
    hero: {
      kicker: "FORMATION · ÉDUCATION",
      title: "Apprendre *avec plaisir.*",
      lead: "Des groupes limités, des formateurs qui font leur métier, et des programmes qui valent le coup d’un usage réel.",
      badges: [
        { icon: "sparkles", label: "Groupes de 12 maximum" },
        { icon: "clock", label: "Sessions toute l’année" },
        { icon: "wallet", label: "Paiement en 3 fois" },
      ],
      image: { src: "/cms/ecole/hero.jpg", alt: "Classe avec étudiants" },
      sticker: false,
      floatingText: "Viens\nessayer.",
      primary: { label: "Voir les formations", href: "/carte" },
      secondary: { label: "Poser une question", href: "/contact" },
    },
    about: {
      image: { src: "/cms/ecole/about.jpg", alt: "Formateur devant un tableau" },
      artCaption: "LE GROUPE.\nLA PRATIQUE.",
      kicker: "PÉDAGOGIE",
      title: "Petit groupe,\n*grande exigence.*",
      paragraphs: [
        "Douze personnes maximum par atelier : de quoi que chacun mette la main à l’œuvre, pose ses questions et reparte avec quelque chose de concret.",
        "Les formateurs viennent du terrain et pratiquent la didactique à côté du métier. On voit les erreurs avant qu’elles ne coûtent cher.",
      ],
      cta: { label: "Voir les formations", href: "/carte" },
    },
    marquee: {
      items: ["GROUPES LIMITÉS À 12", "FORMATEURS DU TERRAIN", "CAS PRATIQUES", "GROUPES LIMITÉS À 12"],
    },
    featuredProducts: {
      kicker: "NOS FORMATIONS",
      title: "Les parcours,\n*la durée, le prix.*",
      aside: "Chaque programme détaillé,\navec ses modalités d’inscription.",
      note: "Formations et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toutes les formations", href: "/carte" },
    },
    reviews: {
      kicker: "NOS STAGIAIRES",
      title: "Ils en parlent\n*autrement.*",
      text: "Les retours de nos anciens participants sur le contenu, le rythme et l’utilité concrète des ateliers.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "NOS LOCAUX",
      title: "Une salle,\n*des postes.*",
      hoursTitle: "Du lundi au samedi",
      hoursNote: "Sessions de 9h à 18h · à confirmer",
      cta: { label: "S’inscrire à une session", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au centre, à côté de la médiathèque.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "La vie de l’école",
      intro: "Les ateliers, les projets, les questions qui restent.",
      images: [
        { src: "/cms/ecole/gallery1.jpg", alt: "Atelier en cours" },
        { src: "/cms/ecole/gallery2.jpg", alt: "Projet présenté" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "L’école *en mouvement*",
      caption: "Une session d’atelier, en accéléré.",
      source: { kind: "file", src: "/cms/ecole/video.mp4", poster: "/cms/ecole/hero.jpg" },
    },
  },

  gastronomique: {
    hero: {
      kicker: "GASTRONOMIE · FINE DINING",
      title: "L’art *de la table.*",
      lead: "Un menu qui se construit autour d’un produit, un service qui ne s’encombre pas : la grande cuisine sans le protocole lourd.",
      badges: [
        { icon: "star", label: "Menu dégustation" },
        { icon: "clock", label: "Dîner de 19h30" },
        { icon: "sparkles", label: "Accord mets et vins" },
      ],
      image: { src: "/cms/gastronomique/hero.jpg", alt: "Assiette de fine dining dressée" },
      sticker: false,
      floatingText: "Une table,\nun menu.",
      primary: { label: "Réserver une table", href: "/reservations" },
      secondary: { label: "Découvrir le menu", href: "/carte" },
    },
    about: {
      image: { src: "/cms/gastronomique/about.jpg", alt: "Chef dressant une assiette" },
      artCaption: "LE MENU.\nLE SERVICE.",
      kicker: "LE MENU",
      title: "Un menu,\n*une seule soirée.*",
      paragraphs: [
        "Le chef compose un menu unique, adapté au marché du jour. On le déroule en sept services, sans option à choisir.",
        "Le sommelier propose un accord en fonction de vos plats, ou une seule coupe à l’aveugle pour découvrir.",
      ],
      cta: { label: "Réserver une table", href: "/reservations" },
    },
    marquee: {
      items: ["MENU UNIQUE", "SEPT SERVICES", "ACCORD VINS", "MENU UNIQUE"],
    },
    featuredProducts: {
      kicker: "LE MENU",
      title: "Les services\n*de la soirée.*",
      aside: "Entrées, plats, desserts :\nce que vous goûtez ce soir.",
      note: "Menu et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir le menu complet", href: "/carte" },
    },
    reviews: {
      kicker: "LA PRESSE",
      title: "On a parlé\n*de nous.*",
      text: "Les critiques et les avis de nos clients sur le menu, le service et l’ambiance de la salle.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LA SALLE",
      title: "Vingt-deux couverts,\n*une seule prise.*",
      hoursTitle: "Du mercredi au samedi",
      hoursNote: "Un seul service à 19h30 · à confirmer",
      cta: { label: "Choisir mon créneau", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au fond de la cour, première porte.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "La maison en images",
      intro: "La salle, le menu, le service de la salle.",
      images: [
        { src: "/cms/gastronomique/gallery1.jpg", alt: "Salle du restaurant" },
        { src: "/cms/gastronomique/gallery2.jpg", alt: "Service à table" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le service *en mouvement*",
      caption: "Une soirée, du premier verre au dernier dessert.",
      source: { kind: "file", src: "/cms/gastronomique/video.mp4", poster: "/cms/gastronomique/hero.jpg" },
    },
  },

  baravin: {
    hero: {
      kicker: "BAR À VINS · TAPAS",
      title: "Le temps *se partage.*",
      lead: "Une carte courte de vins natures, des tapas à partager et une salle où l’on reste plus longtemps que prévu.",
      badges: [
        { icon: "star", label: "Vins au verre" },
        { icon: "bag", label: "Tapas à partager" },
        { icon: "clock", label: "Sans réservation" },
      ],
      image: { src: "/cms/baravin/hero.jpg", alt: "Bar à vins avec-Assiettes de tapas" },
      sticker: false,
      floatingText: "Un verre,\npuis on reste.",
      primary: { label: "Voir la carte des vins", href: "/carte" },
      secondary: { label: "Réserver une table", href: "/reservations" },
    },
    about: {
      image: { src: "/cms/baravin/about.jpg", alt: "Bouteilles de vin dans une cave" },
      artCaption: "LA CAVE.\nLE VERRE.",
      kicker: "NOS VINS",
      title: "Petite liste,\n*grande exigence.*",
      paragraphs: [
        "Trente références, renouvelées régulièrement, choisies pour leur buvabilité autant que pour leur singularité.",
        "Le sommelier est là pour parler vin, mais aussi pour dire simplement ce qui ira avec votre table.",
      ],
      cta: { label: "Voir la carte", href: "/carte" },
    },
    marquee: {
      items: ["VINS AU VERRE", "TAPAS À PARTAGER", "LISTE COURTE", "VINS AU VERRE"],
    },
    featuredProducts: {
      kicker: "LA CARTE",
      title: "Ce qu’on\n*ouvre ce soir.*",
      aside: "Les vins natures, les bulles,\net ce qui accompagne.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LES HABITUÉS",
      title: "On y revient\n*le mardi.*",
      text: "Les avis de nos clients sur les vins, les tapas et l’ambiance de la salle.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LA SALLE",
      title: "On est là,\n*du mardi au samedi.*",
      hoursTitle: "Du mardi au samedi",
      hoursNote: "18h–1h du matin · à confirmer",
      cta: { label: "Réserver une table", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au bout du couloir éclairé.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "La cave en images",
      intro: "Les bouteilles, le zinc, les assiettes à partager.",
      images: [
        { src: "/cms/baravin/gallery1.jpg", alt: "Cave à vin" },
        { src: "/cms/baravin/gallery2.jpg", alt: "Tapas à partager" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le verre *en mouvement*",
      caption: "Le service du bar, filmé de près.",
      source: { kind: "file", src: "/cms/baravin/video.mp4", poster: "/cms/baravin/hero.jpg" },
    },
  },

  brunch: {
    hero: {
      kicker: "BRUNCH · CAFÉ MODERNE",
      title: "Le matin *qui fait du bien.*",
      lead: "Des œufs, du pain, du café de spécialité et des assises qui ne pressent personne : le week-end commence ici.",
      badges: [
        { icon: "clock", label: "Tous les jours, 9h–17h" },
        { icon: "sparkles", label: "Café de spécialité" },
        { icon: "wallet", label: "Sans réservation" },
      ],
      image: { src: "/cms/brunch/hero.jpg", alt: "Table de brunch lumineuse" },
      sticker: true,
      floatingText: "Encore\nun œuf mollet ?",
      primary: { label: "Voir la carte du brunch", href: "/carte" },
      secondary: { label: "Réserver une table", href: "/reservations" },
    },
    about: {
      image: { src: "/cms/brunch/about.jpg", alt: "Assiette de brunch" },
      artCaption: "LE MATIN.\nLA TABLE.",
      kicker: "LE BRUNCH",
      title: "Long, lent,\n*et copieux.*",
      paragraphs: [
        "On sert le brunch de 9h à 17h, sans limite de temps : les plats arrivent quand vous êtes prêts.",
        "Le café vient d’un torréfacteur de quartier, le pain est bake le matin même, et les assiettes sont généreuses.",
      ],
      cta: { label: "Réserver une table", href: "/reservations" },
    },
    marquee: {
      items: ["SANS LIMITATION DE TEMPS", "CAFÉ DE SPÉCIALITÉ", "PAIN DU MATIN", "SANS LIMITATION DE TEMPS"],
    },
    featuredProducts: {
      kicker: "LA CARTE",
      title: "Ce qu’on\n*propose le matin.*",
      aside: "Œufs, pancakes, bowls et pain\nbeurré, toute la journée.",
      note: "Produits et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LE WEEK-END",
      title: "On y revient\n*le samedi.*",
      text: "Les avis de nos clients sur les plats, le café et l’ambiance de la salle.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LA SALLE",
      title: "Une grande table,\n*la lumière du matin.*",
      hoursTitle: "Tous les jours",
      hoursNote: "9h–17h, week-end dès 8h30 · à confirmer",
      cta: { label: "Choisir mon créneau", href: "/reservations" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "En face du marché, avec les terrasses.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Le matin en images",
      intro: "La salle, la lumière, les assiettes du dimanche.",
      images: [
        { src: "/cms/brunch/gallery1.jpg", alt: "Salle lumineuse" },
        { src: "/cms/brunch/gallery2.jpg", alt: "Assiette de brunch" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le matin *en mouvement*",
      caption: "La cuisine du brunch, en temps réel.",
      source: { kind: "file", src: "/cms/brunch/video.mp4", poster: "/cms/brunch/hero.jpg" },
    },
  },

  burger: {
    hero: {
      kicker: "BURGER · FAST CASUAL",
      title: "Une faim. *Une vraie.*",
      lead: "Bœuf haché sur place, bun brioché, sauce maison : un burger qui se commande vite et se mange encore mieux.",
      badges: [
        { icon: "clock", label: "Prêt en 6 minutes" },
        { icon: "bag", label: "À emporter" },
        { icon: "wallet", label: "Menu à 9,90 €" },
      ],
      image: { src: "/cms/burger/hero.jpg", alt: "Burger généreux servi sur table" },
      sticker: true,
      floatingText: "Fondu\ndedans.",
      primary: { label: "Commander un burger", href: "/commander" },
      secondary: { label: "Voir la carte", href: "/carte" },
    },
    about: {
      image: { src: "/cms/burger/about.jpg", alt: "Bœuf haché grillé au restaurant" },
      artCaption: "LE BŒUF.\nLE PAIN.",
      kicker: "LE BISTRO",
      title: "On hache,\n*on grille, on sert.*",
      paragraphs: [
        "Le bœuf est haché chaque matin et grillé à la commande, jamais قبل. Le pain brioché arrive du fournil voisin chaque matin.",
        "Les sauces sont faites maison, la pomme de terre est frite sur place, et le menu reste lisible.",
      ],
      cta: { label: "Commander", href: "/commander#start" },
    },
    marquee: {
      items: ["BŒUF HACHÉ SUR PLACE", "PAIN BRIOCHÉ DU FOURNIL", "SAUCES MAISON", "BŒUF HACHÉ SUR PLACE"],
    },
    featuredProducts: {
      kicker: "NOS BURGERS",
      title: "Six burgers,\n*pas un de plus.*",
      aside: "Les classiques et le burger\ndu mois, sans menus interminables.",
      note: "Produits et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LE VOTE",
      title: "Ils ont fandom\n*leur préféré.*",
      text: "Les avis de nos clients sur la cuisson, les sauces et la texture du pain.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LE LOCAL",
      title: "Table ou\n*à la fenêtre.*",
      hoursTitle: "Ouvert 7j/7",
      hoursNote: "11h–23h, service continu · à confirmer",
      cta: { label: "Commander à emporter", href: "/commander" },
      burger: true,
      burgerOpen: "Toutes les saveurs.",
      burgerClosed: "Découvrez la composition.",
      burgerHint: "Survolez pour découvrir chaque ingrédient",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Sur la rue, avec la file qui attend.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "Le smash burger",
      intro: "La viande, le pain, la sauce : ce qu’on voit avant la première bouchée.",
      images: [
        { src: "/cms/burger/gallery1.jpg", alt: "Burger assemblé" },
        { src: "/cms/burger/gallery2.jpg", alt: "Frites de la maison" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "La plancha *en mouvement*",
      caption: "Le bruit, la fumée, le flip : six minutes de cuisine.",
      source: { kind: "file", src: "/cms/burger/video.mp4", poster: "/cms/burger/hero.jpg" },
    },
  },
};
