import type { Section } from "./schema";

/**
 * Contenu pré-rempli pour chaque modèle : textes, images et vidéos qui font
 * vivre le template. Appliqué par `applySiteTemplate` en plus du thème et de
 * la composition. Les champs absents conservent le contenu par défaut.
 *
 * Chaque modèle a sa propre voix : une brasserie ne parle pas comme une
 * école. Les textes mêlent récit (l'histoire, le geste, le lieu) et vente
 * (la promesse, la preuve, l'appel).
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
      kicker: "DEPUIS 1998, LE MÊME ZINC",
      title: "Le bistrot d’en face, *en mieux.*",
      lead: "Une ardoise écrite au crayon chaque matin, un cassoulet qui mijote et un café serré : ici, on vient pour le plat du jour et on reste pour le verre.",
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
      image: { src: "/cms/bistrot/about.jpg", alt: "Assiette du jour servie au comptoir" },
      artCaption: "LE ZINC.\nLA CARTE DU JOUR.",
      kicker: "NOTRE FAÇON DE FAIRE",
      title: "Le plat du jour,\n*écrit au crayon.*",
      paragraphs: [
        "Le matin, on passe au marché, on choisit les produits, on écrit la carte au crayon sur l’ardoise. Ce qui manque, on ne le cuisine pas.",
        "Les classiques ne bougent jamais : l’œufs Mayonnaise, le steak-frites, la crème brûlée. Les suggestions, si. C’est comme ça qu’un bistrot reste un bistrot.",
      ],
      cta: { label: "Réserver ma place", href: "/reservations" },
    },
    marquee: {
      items: ["CARTE DU JOUR", "PRODUITS DE SAISON", "SERVICE CONTINU", "CAFÉ SERRÉ"],
    },
    featuredProducts: {
      kicker: "CE QU’ON PRÉPARE AUJOURD’HUI",
      title: "L’ardoise\n*du jour.*",
      aside: "Une poignée de plats, changés au rythme du marché et de l’humeur du chef.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "CE QUE LES HABITUÉS EN DISENT",
      title: "Ils reviennent\n*pour l’assiette.*",
      text: "La meilleure façon de juger un bistrot, c’est de lire ce que les clients racontent après leur deuxième visite.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "QUAND VENIR",
      title: "Midi sharp,\n*soir détendu.*",
      hoursTitle: "Ouvert tous les jours",
      hoursNote: "Service de 12h à 14h30, puis de 19h à 22h30 · à confirmer",
      cta: { label: "Choisir mon créneau", href: "/reservations" },
      burger: true,
      burgerOpen: "Toutes les saveurs.",
      burgerClosed: "Découvrez la composition.",
      burgerHint: "Survolez pour découvrir chaque ingrédient",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au bout du comptoir, côté rue.",
      buttonLabel: "Ouvrir l’itinéraire",
    },
    gallery: {
      kicker: "EN IMAGES",
      title: "L’intérieur du bistrot",
      intro: "Le zinc, les banquettes de cuir et la lumière de fin de journée.",
      images: [
        { src: "/cms/bistrot/gallery1.jpg", alt: "Salle et comptoir du bistrot" },
        { src: "/cms/bistrot/gallery2.jpg", alt: "Table dressée au bistrot" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "L’ardoise *prend vie*",
      caption: "Une journée à la carte, de l’ardoise au service.",
      source: { kind: "file", src: "/cms/bistrot/video.mp4", poster: "/cms/bistrot/hero.jpg" },
    },
  },

  jardin: {
    hero: {
      kicker: "LE POTAGER EN PLEINE VILLE",
      title: "On cuisine ce qui pousse *à côté.*",
      lead: "Des légumes cueillis le matin dans nos Jardins, des casseroles qui CUISINENT le midi : la saison, sans détour ni transport.",
      badges: [
        { icon: "sparkles", label: "Cueilli du matin" },
        { icon: "bag", label: "Sur place ou à emporter" },
        { icon: "wallet", label: "Déjeuner à 15 €" },
      ],
      image: { src: "/cms/jardin/hero.jpg", alt: "Légumes frais de saison en cuisine végétale" },
      sticker: false,
      floatingText: "100 %\nvégétal",
      primary: { label: "Voir le menu du jour", href: "/carte" },
      secondary: { label: "Notre histoire", href: "/histoire" },
    },
    about: {
      image: { src: "/cms/jardin/about.jpg", alt: "Assiette végétale colorée" },
      artCaption: "DU JARDIN\nÀ L’ASSIETTE.",
      kicker: "NOTRE APPROCHE",
      title: "La saison\n*sans intermédiaire.*",
      paragraphs: [
        "Trois maraîchers à moins de dix kilomètres, une cueillette chaque matin, et rien ne dort en chambre froide. Ce qui est dans l’assiette a moins de vingt-quatre heures.",
        "La carte suit le calendrier : le chou-fleur de novembre disparaît en mars, la fraise revient en juin. Les végétariens n’ont pas à se passer, ils ont à choisir.",
      ],
      cta: { label: "Découvrir la carte", href: "/carte" },
    },
    marquee: {
      items: ["CUEILLI DU MATIN", "CIRCUIT COURT", "CUISINE VÉGÉTALE", "DEPUIS LA PARCELLE"],
    },
    featuredProducts: {
      kicker: "LA CARTE DU POTAGER",
      title: "Ce que le jardin\n*nous a donné.*",
      aside: "Des assiettes complètes, végétales ou non, toujours accompagnées de pain maison.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "CE QUE LA TABLE EN PENSE",
      title: "On a parfois\n*bon appétit.*",
      text: "Les avis de nos clients sur les légumes, les assaisonnements et la façon de dresser les assiettes.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "OUVERT QUAND IL FAIT BON",
      title: "Une serre,\n*de la ville.*",
      hoursTitle: "Du mardi au samedi",
      hoursNote: "Déjeuner 12h–14h, dîner 19h–22h · à confirmer",
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
      title: "Le jardin en photos",
      intro: "Les planches, les cagettes et la lumière à travers les feuilles.",
      images: [
        { src: "/cms/jardin/gallery1.jpg", alt: "Étal de légumes frais" },
        { src: "/cms/jardin/gallery2.jpg", alt: "Feuillage du jardin" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "De la planche\n*à l’assiette*",
      caption: "La cueillette du matin et la cuisine qui suit, en une minute.",
      source: { kind: "file", src: "/cms/jardin/video.mp4", poster: "/cms/jardin/hero.jpg" },
    },
  },

  comptoir: {
    hero: {
      kicker: "COMMANDEZ, C’EST PRÊT",
      title: "Deux minutes de commande.\n*Dix minutes d’attente.*",
      lead: "Pas de serveur, pas de carte à lire : on choisit, on paye, on récupère. Le goût, lui, ne négocie pas.",
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
      title: "On prépare\n*devant vous.*",
      paragraphs: [
        "La commande part au gril, la sauce est montée à la minute, et vous voyez votre plat monter. C’est du spectacle, mais surtout de la fraîcheur.",
        "Les classiques ne changent pas, les suggestions tournent chaque semaine. Un plat du mois peut disparaître sans brutally, c’est la règle.",
      ],
      cta: { label: "Je commande", href: "/commander#start" },
    },
    marquee: {
      items: ["COMMANDE EN 2 MINUTES", "PRÊT EN 10 MINUTES", "CUISSON AU GRIL", "SANS ATTENTE"],
    },
    featuredProducts: {
      kicker: "LES PLUS COMMANDÉS",
      title: "Ce que tout le monde\n*commande.*",
      aside: "Les plats les plus demandés, prêts en quelques minutes.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir la carte complète", href: "/carte" },
    },
    reviews: {
      kicker: "CE QUE LA RUE EN DIT",
      title: "Ils ont fait\n*la queue.*",
      text: "Les avis de nos clients sur les portions, les prix et la vitesse du service.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "QUAND OUVRIR",
      title: "Le comptoir\n*vous attend.*",
      hoursTitle: "Ouvert 7j/7",
      hoursNote: "Service continu de 11h à 23h · à confirmer",
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
      intro: "La file, la plancha et l’assiette qui part.",
      images: [
        { src: "/cms/comptoir/gallery1.jpg", alt: "Service au comptoir" },
        { src: "/cms/comptoir/gallery2.jpg", alt: "Préparation d’un plat" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Trente secondes\n*de cuisine.*",
      caption: "L’assemblage d’une commande, du gril à la main qui l’emporte.",
      source: { kind: "file", src: "/cms/comptoir/video.mp4", poster: "/cms/comptoir/hero.jpg" },
    },
  },

  pause: {
    hero: {
      kicker: "OUVERT DE 7H30 À 19H",
      title: "On a pris son temps.\n*Vous aussi.*",
      lead: "Un café qui tire droit, une viennoiserie encore tiède et un coin où l’on peut rester plus longtemps que prévu.",
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
      title: "Rien n’est pressé,\n*même le café.*",
      paragraphs: [
        "Le grain est torréfié pour nous et moulu le matin même. La viennoiserie est façonnée à la main, et le pain part au fournil avant l’ouverture.",
        "Le matin, on travaille ici. L’après-midi, on lit ici. Le week-end, on reste longtemps avec la famille.",
      ],
      cta: { label: "Réserver une table", href: "/reservations" },
    },
    marquee: {
      items: ["CAFÉ FRAIS DU MATIN", "VIENNOISERIE FAÇONNÉE À LA MAIN", "ESPACE DE TRAVAIL", "OUVERT 7J/7"],
    },
    featuredProducts: {
      kicker: "LA VITRINE DU JOUR",
      title: "Ce qui sort\n*chaque matin.*",
      aside: "Pains, viennoiseries, tartes et sandwichs, préparés avant l’ouverture.",
      note: "Produits et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir la vitrine", href: "/carte" },
    },
    reviews: {
      kicker: "VOS HABITUDES",
      title: "Votre place\n*est gardée.*",
      text: "Les avis de nos clients sur le café, la viennoiserie et l’ambiance de la salle.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "QUAND PASSER",
      title: "Du matin\n*au soir.*",
      hoursTitle: "Ouvert tous les jours",
      hoursNote: "De 7h30 à 19h, week-end jusqu’à 18h · à confirmer",
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
      title: "La salle et la vitrine",
      intro: "Le bois, la lumière de l’après-midi et les plateaux qui sortent.",
      images: [
        { src: "/cms/pause/gallery1.jpg", alt: "Salle du café" },
        { src: "/cms/pause/gallery2.jpg", alt: "Vitrine de pâtisseries" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le four\n*s’ouvre.*",
      caption: "Le tour du fournil avant l’ouverture, en une minute.",
      source: { kind: "file", src: "/cms/pause/video.mp4", poster: "/cms/pause/hero.jpg" },
    },
  },

  signature: {
    hero: {
      kicker: "CARTE COURTE, GRANDS PRODUITS",
      title: "Trois ingrédients.\n*Pas un de plus.*",
      lead: "Un chef qui écrit sa carte chaque semaine, des producteurs qu’il connaît par leur prénom et une salle où l’on prend le temps.",
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
      kicker: "NOTRE DÉMARCHE",
      title: "Peu de choses,\n*mieux choisies.*",
      paragraphs: [
        "Le chef ne garde que ce qui mérite sa place : trois ou quatre producteurs, une technique qu’il maîtrise, et le droit de changer d’avis chaque lundi.",
        "Le dressage vient d’ici, le produit vient de là. On ne cherche pas l’effet, on cherche l’équilibre.",
      ],
      cta: { label: "Réserver une table", href: "/reservations" },
    },
    marquee: {
      items: ["CARTE COURTE", "PRODUITS D’EXCEPTION", "SOMMELLERIE AU VERRE", "MENU ÉCRIT CHAQUE SEMAINE"],
    },
    featuredProducts: {
      kicker: "LA CARTE DE CE SOIR",
      title: "Ce que le chef\n*propose ce soir.*",
      aside: "Une carte qui suit le marché, servie en séquence ou à la carte.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LA CRITIQUE",
      title: "Ils en ont parlé\n*longtemps.*",
      text: "Les critiques et les avis de nos clients sur le menu, le service et l atmosphère de la salle.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "NOUS TROUVEZ",
      title: "Une porte discrète,\n*une salle sombre.*",
      hoursTitle: "Du mardi au samedi",
      hoursNote: "Service à partir de 19h, une seule prise · à confirmer",
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
      title: "La maison, la salle, l’assiette",
      intro: "Le dressage, le produit et la lumière basse de la salle.",
      images: [
        { src: "/cms/signature/gallery1.jpg", alt: "Dressage d’une assiette" },
        { src: "/cms/signature/gallery2.jpg", alt: "Salle du restaurant" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le geste\n*en gros plan.*",
      caption: "Le travail du chef, filmé au plus près de la passe.",
      source: { kind: "file", src: "/cms/signature/video.mp4", poster: "/cms/signature/hero.jpg" },
    },
  },

  riviera: {
    hero: {
      kicker: "FACE AU PORT, DEPUIS 1986",
      title: "Le poisson arrive\n*le matin, part le midi.*",
      lead: "Arrivage du jour, vegetables grillées au feu de bois et des tables qui débordent sur le quai : la Méditerranée, à deux pas de l’eau.",
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
      title: "Le marché decides,\n*la cuisine exécute.*",
      paragraphs: [
        "Le pêcheur dépose la boite à cinq heures, le chef choisit ce qui part au feu. Les légumes viennent de la place, à trois rues.",
        "La cuisine est simple : huile d’olive, herbes fraîches, gril. Le reste n’est que du bon sens.",
      ],
      cta: { label: "Réserver en terrasse", href: "/reservations" },
    },
    marquee: {
      items: ["PÊCHE DU JOUR", "LÉGUMES GRILLÉS AU FEU DE BOIS", "FACE AU PORT", "TABLE D’HIVERGE EN TERRASSE"],
    },
    featuredProducts: {
      kicker: "LA CARTE DU PORT",
      title: "Ce que la mer\n*et le marché.*",
      aside: "Les arrivages du matin et les légumes de la place, grillés à la commande.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "VOS VACANCES",
      title: "Le genre d’endroit\n*qui reste en tête.*",
      text: "Les avis de nos clients sur la table, la vue et l’accueil : tout ce qu’il faut avant de réserver.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LA TERRASSE",
      title: "Assis face au port,\n*le meilleur moment.*",
      hoursTitle: "Ouvert tous les jours",
      hoursNote: "Déjeuner 12h–14h30, dîner 19h–22h · à confirmer",
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
      intro: "La terrasse, les assiettes et la lumière de fin de journée.",
      images: [
        { src: "/cms/riviera/gallery1.jpg", alt: "Terrasse face au port" },
        { src: "/cms/riviera/gallery2.jpg", alt: "Assiette méditerranéenne" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "La table *prend vie*",
      caption: "Le service en terrasse et la lumière d’une saison entière.",
      source: { kind: "file", src: "/cms/riviera/video.mp4", poster: "/cms/riviera/hero.jpg" },
    },
  },

  atelier: {
    hero: {
      kicker: "CUISINE DE SAISON, DRESSAGE NET",
      title: "Rien de trop.\n*Tout est là.*",
      lead: "Un produit brut, une cuisson précise et une assiette qui dit exactement ce qu’elle contient. Rien pour masquer, tout pour assurer la place.",
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
        "Pas de jeton, pas de décor superflu : ce qui est dans l’assiette doit avoir une raison d’être. Le produit brut, la cuisson juste, l’assaisonnement mesuré.",
        "Le dressage est un travail d’alignement, pas d’empilement. Ce qui ne sert pas l’assiette sort de l’assiette.",
      ],
      cta: { label: "Réserver une place", href: "/reservations" },
    },
    marquee: {
      items: ["PRODUIT BRUT", "CUISSON PRÉCISE", "AUCUN DÉCOR SUPERFLU", "ASSIETTE JUSTE"],
    },
    featuredProducts: {
      kicker: "LE MENU DU JOUR",
      title: "Trois assiettes,\n*une seule idée.*",
      aside: "Un menu unique, changé selon l’inspiration et le marché.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir le menu", href: "/carte" },
    },
    reviews: {
      kicker: "CE QU’ON EN DIT",
      title: "La précision\n*remarquée.*",
      text: "Les avis de nos clients sur la cuisine, la salle et l’expérience : ce qui compte vraiment.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LA SALLE",
      title: "Une adresse calme,\n*une table pour deux.*",
      hoursTitle: "Du mardi au samedi",
      hoursNote: "Service à partir de 19h, un seul menu · à confirmer",
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
      title: "L’atelier en photos",
      intro: "Le travail du produit, la ligne de l’assiette, la lumière de la salle.",
      images: [
        { src: "/cms/atelier/gallery1.jpg", alt: "Détail du dressage" },
        { src: "/cms/atelier/gallery2.jpg", alt: "Salle de l’atelier" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "La technique\n*à nu*",
      caption: "Le geste du métier, filmé sans emphase.",
      source: { kind: "file", src: "/cms/atelier/video.mp4", poster: "/cms/atelier/hero.jpg" },
    },
  },

  escale: {
    hero: {
      kicker: "NOTRE CARTE VOYAGE",
      title: "Ce mois-ci, on part\n*au Mexique.*",
      lead: "Une carte qui change de continent, des produits achetés chez le producteur et des recettes qu’on a apprises sur place.",
      badges: [
        { icon: "pin", label: "Voyage mensuel" },
        { icon: "sparkles", label: "Recettes d’ailleurs" },
        { icon: "bag", label: "À emporter" },
      ],
      image: { src: "/cms/escale/hero.jpg", alt: "Table chargée d’épices et de plats du monde" },
      sticker: false,
      floatingText: "Ce mois-ci :\nla route d’Orient.",
      primary: { label: "Découvrir la carte du mois", href: "/carte" },
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
      items: ["UN PAYS PAR MOIS", "PRODUITS AUTHENTIQUES", "RECETTES VÉCUES", "ESCALE APRÈS ESCALE"],
    },
    featuredProducts: {
      kicker: "L’ESCALE DU MOMENT",
      title: "Ce qui vient\n*d’ailleurs.*",
      aside: "Les plats de la cuisine du mois,Electronic à partager.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LES VOYAGEURS",
      title: "Ils sont\n*partis avec nous.*",
      text: "Vos avis nous disent si le voyage vous a plu, et quelle escale vous aimeriez voir ensuite.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "OÙ NOUS TROUVER",
      title: "Poussez la porte,\n*on vous raconte.*",
      hoursTitle: "Ouvert tous les jours",
      hoursNote: "Midi et soir, tous les jours · à confirmer",
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
      title: "L’escale\n*commence ici*",
      caption: "Le marché, la cuisine, la table : l’escale en une minute.",
      source: { kind: "file", src: "/cms/escale/video.mp4", poster: "/cms/escale/hero.jpg" },
    },
  },

  pizzeria: {
    hero: {
      kicker: "FEU DE BOIS, FARINE ITALIENNE",
      title: "La pâte met deux jours.\n*La pizza, quatre-vingt-dix secondes.*",
      lead: "San Marzano, mozzarella de Bufala et un four qui ne s’éteint jamais avant la fermeture : la pizza comme à Naples, avec nos produits.",
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
      title: "Tout se joue\n*à la fournil.*",
      paragraphs: [
        "La pâte est pétrie la veille et laissée au froid 48 heures. La mozzarella fond sur place, les tomates arrivent entières et sont pressées devant vous.",
        "Les tomates romaines et le basilic frais arrivent en fin de service, comme à Rome. Le reste, c’est notre façon.",
      ],
      cta: { label: "Commander", href: "/commander#start" },
    },
    marquee: {
      items: ["FEU DE BOIS", "PÂTE FERMENTÉE 48 H", "SAN MARZANO", "MOZZARELLA DI BUFALA"],
    },
    featuredProducts: {
      kicker: "NOS PIZZAS",
      title: "Cinq classiques,\n*une part de plus.*",
      aside: "Les pizzas du jour et la pizza bianca de la maison, cuites à la commande.",
      note: "Carte et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LE VERDICT",
      title: "Ils ont jugé\n*la croûte.*",
      text: "Les avis de nos clients sur la pâte, la cuisson et le temps de livraison : le meilleur indicateur pour choisir la vôtre.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "À TABLE",
      title: "La salle bouge,\n*la pizza aussi.*",
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
      intro: "La pâte qui lève, le feu qui ronronne, la salle pleine.",
      images: [
        { src: "/cms/pizzeria/gallery1.jpg", alt: "Four à bois" },
        { src: "/cms/pizzeria/gallery2.jpg", alt: "Pizza servie" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Au feu\n*de bois*",
      caption: "La pizza au four, du geste à l’assiette.",
      source: { kind: "file", src: "/cms/pizzeria/video.mp4", poster: "/cms/pizzeria/hero.jpg" },
    },
  },

  sushi: {
    hero: {
      kicker: "LE RIZ D’ABORD",
      title: "Tout se joue\n*sur le riz.*",
      lead: "Cuit au saké, salé juste, un peu de glace et pas un grain de trop. Une pièce, deux secondes, et le silence autour.",
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
        "Le riz est cuit au saké et à l’acidité de yuzu, la pièce est montée à la main, la lame est aiguisée chaque matin avant l’ouverture.",
        "Douze couverts par service, pas un de plus : c’est la condition pour rester au plus près du produit et de la saison.",
      ],
      cta: { label: "Réserver une place", href: "/reservations" },
    },
    marquee: {
      items: ["RIS CUIT AU SAKÉ", "POISSON DU JOUR", "DOUZE COUVERTS PAR SERVICE", "LAME AIGUISÉE CHAQUE MATIN"],
    },
    featuredProducts: {
      kicker: "LA CARTE",
      title: "Nos pièces\n*du jour.*",
      aside: "Nigiri, maki, sashimi et le menu omakase du soir.",
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
      hoursNote: "Deux services par soir, 19h et 21h · à confirmer",
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
      title: "Deux secondes\n*pour une pièce.*",
      caption: "Le geste du chef, filmé sans musique et sans commentaire.",
      source: { kind: "file", src: "/cms/sushi/video.mp4", poster: "/cms/sushi/hero.jpg" },
    },
  },

  coiffeur: {
    hero: {
      kicker: "DIAGNOSTIC OFFERT, SANS ENGAGEMENT",
      title: "On ne coupe pas vos cheveux.\n*On les comprend.*",
      lead: "Un diagnostic honnête, une coupe qui tient six mois et des conseils que vous appliquez chez vous, entre deux rendez-vous.",
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
      title: "On écoute\n*avant de couper.*",
      paragraphs: [
        "Chaque rendez-vous commence par un diagnostic : vos cheveux, vos habitudes, le temps que vous avez devant vous. On ne propose jamais plus que ce que vous pouvez Tenir.",
        "Ensuite on coupe, et on vous explique comment tenir la coupe jusqu’au prochain rendez-vous.",
      ],
      cta: { label: "Prendre rendez-vous", href: "/reservations" },
    },
    marquee: {
      items: ["DIAGNOSTIC OFFERT", "COIFFEURS QUALIFIÉS", "CONSEILS TENABLES À LA MAISON", "RDV EN LIGNE"],
    },
    featuredProducts: {
      kicker: "NOS PRESTATIONS",
      title: "Coupe, couleur, soin :\n*le prix est écrit.*",
      aside: "Chaque prestation est annoncée claire, avec sa durée et son tarif.",
      note: "Prestations et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toutes les prestations", href: "/carte" },
    },
    reviews: {
      kicker: "LE MOT DE LA FIN",
      title: "Ils racontent\n*la coupe.*",
      text: "Les avis de nos clients sur le résultat, l’accueil et la tenue de la coiffure dans le temps.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LE SALON",
      title: "Poussez la porte,\n*on s’occupe de vous.*",
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
      intro: "Les fauteuils, le miroir et l’ambiance du lieu.",
      images: [
        { src: "/cms/coiffeur/gallery1.jpg", alt: "Fauteuil du salon" },
        { src: "/cms/coiffeur/gallery2.jpg", alt: "Résultat d’une coiffure" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le travail\n*en gros plan.*",
      caption: "Le geste du coiffeur, filmé sans commentaire.",
      source: { kind: "file", src: "/cms/coiffeur/video.mp4", poster: "/cms/coiffeur/hero.jpg" },
    },
  },

  loft: {
    hero: {
      kicker: "IMMOBILIER, SANS VISITE IMPOSÉE",
      title: "Des lieux qu’on visitera\n*deux fois.*",
      lead: "Des volumes clairs, de la lumière et un état du lieu irréprochable : on ne liste que ce qu’on a visité et aimé.",
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
      title: "On visite\n*avant de vendre.*",
      paragraphs: [
        "Chaque bien est vu, mesuré et photographié par nous : l’orientation, la lumière à différentes heures, l’état réel des finitions.",
        "Ensuite on vous écoute. Vos usages, vos envies, vos délais : on ne vous propose que ce qui colle.",
      ],
      cta: { label: "Parler de votre projet", href: "/contact" },
    },
    marquee: {
      items: ["BIENS VISITÉS ET VALIDÉS", "ESTIMATION OFFERTE", "VISITES SUR RENDEZ-VOUS", "PHOTOGRAPHIES RÉELLES"],
    },
    featuredProducts: {
      kicker: "NOS BIENS",
      title: "Les adresses\n*en lumière.*",
      aside: "Lofts, appartements et locaux à découvrir sur rendez-vous.",
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
      title: "Un bien se visite,\n*il ne s’explique pas.*",
      hoursTitle: "Du lundi au samedi",
      hoursNote: "Visites sur rendez-vous, du lundi au samedi · à confirmer",
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
      title: "La visite\n*filmée*",
      caption: "Une visite, comme si vous y étiez.",
      source: { kind: "file", src: "/cms/loft/video.mp4", poster: "/cms/loft/hero.jpg" },
    },
  },

  chantier: {
    hero: {
      kicker: "DEVIS EN 48 H, GARANTIE DÉCENNALE",
      title: "Un chantier, *un seul interlocuteur.*",
      lead: "De la première réunion à la réception, la même personne suit votre projet : pas de relais, pas de mauvaise surprise en cours de route.",
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
      title: "Le chantier ne vit\n*que d’un plan.*",
      paragraphs: [
        "Un chef de chantier unique suit votre projet de la première réunion à la réception : c’est lui qui répond, qui propose et qui réceptionne.",
        "Nos sous-traitants sont nos habits, nos fournisseurs sont vérifiés, et chaque avancement est documenté en photo.",
      ],
      cta: { label: "Parler de mon projet", href: "/contact" },
    },
    marquee: {
      items: ["DEVIS EN 48 H", "UN SEUL CHEF DE CHANTIER", "GARANTIE DÉCENNALE", "AVANCEMENT PHOTOGRAPHIÉ"],
    },
    featuredProducts: {
      kicker: "NOS PRESTATIONS",
      title: "Ce que nous\n*savons faire.*",
      aside: "Rénovation, neuf, entretien : les lots détaillés, chiffrés et datés.",
      note: "Prestations et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toutes les prestations", href: "/carte" },
    },
    reviews: {
      kicker: "NOS CHANTIERS",
      title: "Ils ont vu\n*le résultat.*",
      text: "Les avis de nos clients sur le suivi, les délais tenus et la qualité des travaux.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "SUR CHANTIER",
      title: "Venez voir\n*nos chantiers.*",
      hoursTitle: "Du lundi au vendredi",
      hoursNote: "Visites de chantier sur rendez-vous · à confirmer",
      cta: { label: "Demander un rendez-vous", href: "/contact" },
      burger: false,
      burgerOpen: "",
      burgerClosed: "",
      burgerHint: "",
    },
    map: {
      kicker: "NOUS TROUVER",
      title: "Au dépôt, ou directement sur le chantier.",
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
      title: "Une journée\n*de chantier*",
      caption: "Le chantier en accéléré, du matin à la fermeture.",
      source: { kind: "file", src: "/cms/chantier/video.mp4", poster: "/cms/chantier/hero.jpg" },
    },
  },

  racing: {
    hero: {
      kicker: "DIAGNOSTIC EN 24 H, DEVIS ÉCRIT",
      title: "On n’y touche pas\n*avant votre accord.*",
      lead: "Diagnostic complet, devis écrit, pièces d’origine ou équivalence certifiée : votre machine est entre des mains qui connaissent le bruit d’un moteur.",
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
        "Chaque intervention commence par un diagnostic complet et un devis écrit. Rien n’est touché avant votre accord, et chaque étape est documentée.",
        "Le réglage, la préparation circuit et le travail moteur se font ici, avec les outillages qui vont avec.",
      ],
      cta: { label: "Prendre rendez-vous", href: "/reservations" },
    },
    marquee: {
      items: ["DIAGNOSTIC EN 24 H", "DEVIS ÉCRIT AVANT", "PIÈCES D’ORIGINE OU CERTIFIÉES", "PRÉPARATION CIRCUIT"],
    },
    featuredProducts: {
      kicker: "NOS PRESTATIONS",
      title: "Entretien, préparation,\n*tune.*",
      aside: "Révision, préparation circuit et travail moteur : de la révision complète à la retouche de carrosserie.",
      note: "Prestations et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toutes les prestations", href: "/carte" },
    },
    reviews: {
      kicker: "LE PILOTE",
      title: "Ils sont\n*revenus au dépôt.*",
      text: "Les avis de nos clients sur la précision du travail, les délais tenus et la transparence des prix.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "L’ATELIER",
      title: "Poussez la porte,\n*on regarde la machine.*",
      hoursTitle: "Du lundi au vendredi",
      hoursNote: "08h–18h, samedi sur rendez-vous · à confirmer",
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
      title: "Le dépôt en photos",
      intro: "Les machines, l’outillage et les traces de travail.",
      images: [
        { src: "/cms/racing/gallery1.jpg", alt: "Voiture préparée" },
        { src: "/cms/racing/gallery2.jpg", alt: "Détail moteur" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le son\n*d’un moteur*",
      caption: "Le son d’un moteur qu’on connaît par cœur.",
      source: { kind: "file", src: "/cms/racing/video.mp4", poster: "/cms/racing/hero.jpg" },
    },
  },

  manuscrit: {
    hero: {
      kicker: "UN ARTICLE PAR SEMAINE, SANS PUBLICITÉ",
      title: "On publie quand\n*c’est prêt.*",
      lead: "Des textes qui prennent le temps, une lettre chaque vendredi et pas une seule bannière pour masquer le temps de lecture.",
      badges: [
        { icon: "sparkles", label: "Un article par semaine" },
        { icon: "clock", label: "Lettre chaque vendredi" },
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
        "Chaque article part d’une idée simple, passe par trois réécritures et s’arrête quand il ne reste rien à couper. On ne publie pas pour remplir un calendrier.",
        "Si le texte n’est pas prêt, il attend la semaine suivante. Nos lecteurs le savent : c’est pour ça qu’ils reviennent.",
      ],
      cta: { label: "Lire le dernier article", href: "/carte" },
    },
    marquee: {
      items: ["UN ARTICLE PAR SEMAINE", "SANS PUBLICITÉ", "LETTRE DU VENDREDI", "TROIS RÉÉCRITURES"],
    },
    featuredProducts: {
      kicker: "À LA UNE",
      title: "Les textes\n*du moment.*",
      aside: "Les derniers articles, classés par date de publication.",
      note: "Articles de démonstration.",
      limit: 6,
      allLink: { label: "Tous les articles", href: "/carte" },
    },
    reviews: {
      kicker: "VOS MOTS",
      title: "Ils l’ont lu,\n*ils en parlent.*",
      text: "Les réactions de nos lecteurs sur les sujets, la clarté du propos et le temps qu’on leur laisse.",
      rateLabel: "Laisser un avis",
      viewLabel: "Voir les avis",
      sheetLabel: "Voir la fiche",
      cardCaption: "Avis de lecteurs",
    },
    visit: {
      kicker: "NOUS ÉCRIVONS",
      title: "Une question,\n*un sujet à traiter ?*",
      hoursTitle: "Réponse sous 48 h",
      hoursNote: "Du lundi au vendredi, on répond",
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
      title: "La rédaction en photos",
      intro: "Le bureau, les carnets, les marges.",
      images: [
        { src: "/cms/manuscrit/gallery1.jpg", alt: "Carnets de travail" },
        { src: "/cms/manuscrit/gallery2.jpg", alt: "Bureau d’écriture" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "L’écriture\n*au travail*",
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
          excerpt: "Ce que la relecture nous apprend sur la clarté d’un texte — et pourquoi la vitesse n’est jamais le bon rythme.",
          image: { src: "/cms/manuscrit/gallery1.jpg", alt: "Carnet de réécriture" },
          date: "6 novembre 2026",
          href: "/carte",
        },
        {
          title: "Le goût des choses simples",
          excerpt: "Pourquoi les sujets les plus ordinaires demandent les descriptions les plus justes.",
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
      kicker: "CONSEILLER DÉDIÉ, DÉCLARATION EN 48 H",
      title: "Un contrat qu’on\n*peut vous expliquer.*",
      lead: "Un conseiller qui connaît votre dossier, des garanties en français courant et une déclaration traitée en 48 heures, sans jargon ni mauvaise surprise.",
      badges: [
        { icon: "clock", label: "Déclaration en 48 h" },
        { icon: "star", label: "Conseiller dédié" },
        { icon: "wallet", label: "Sans engagement" },
      ],
      image: { src: "/cms/assurance/hero.jpg", alt: "Conseiller en assurance accueillant un client" },
      sticker: false,
      floatingText: "On est là,\njustement.",
      primary: { label: "Demander un devis", href: "/contact" },
      secondary: { label: "Découvrir nos garanties", href: "/carte" },
    },
    about: {
      image: { src: "/cms/assurance/about.jpg", alt: "Échange commercial dans un bureau" },
      artCaption: "LA CONFIANCE.\nLE CONTRAT.",
      kicker: "NOTRE MÉTHODE",
      title: "Une personne,\n*pas un standard.*",
      paragraphs: [
        "Vous êtes suivi par un conseiller qui connaît votre dossier, votre activité et vos risques réels. Pas de standard, pas de formulaire à remplir trois fois.",
        "Les garanties sont expliquées en français courant, clause par clause, avant que vous ne signiez quoi que ce soit.",
      ],
      cta: { label: "Parler à un conseiller", href: "/contact" },
    },
    marquee: {
      items: ["CONSEILLER DÉDIÉ", "DÉCLARATION EN 48 H", "CONTRAT EXPLICABLE", "SANS SURPRISE"],
    },
    featuredProducts: {
      kicker: "NOS GARANTIES",
      title: "Les formules,\n*sans surprise.*",
      aside: "Habitation, commerce, flotte : les garanties détaillées, tarifées et comparables.",
      note: "Garanties et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toutes les garanties", href: "/carte" },
    },
    reviews: {
      kicker: "NOS CLIENTS",
      title: "Ils sont\n*rassurés.*",
      text: "Les avis de nos clients sur la réactivité, la clarté du contrat et la qualité de l’accompagnement.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "NOUS RENCONTRER",
      title: "Un café,\n*une explication.*",
      hoursTitle: "Du lundi au vendredi",
      hoursNote: "09h–18h, sur rendez-vous · à confirmer",
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
      intro: "L’accueil, l’équipe et le temps que l’on prend.",
      images: [
        { src: "/cms/assurance/gallery1.jpg", alt: "Accueil du bureau" },
        { src: "/cms/assurance/gallery2.jpg", alt: "Échange avec un conseiller" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Quand\n*un sinistre* arrive",
      caption: "Ce que nous faisons quand un sinistre survient.",
      source: { kind: "file", src: "/cms/assurance/video.mp4", poster: "/cms/assurance/hero.jpg" },
    },
  },

  patisserie: {
    hero: {
      kicker: "PÉTRI LE MATIN, BEURRE AOP",
      title: "On pétrit à cinq heures.\n*Vous arrivez à neuf.*",
      lead: "Du pain, des viennoiseries et des entremets faits maison chaque matin, avec un beurre AOP et des fruits de saison. Rien n’est décongelé.",
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
      artCaption: "LE FOUR.\nLE GOÛT.",
      kicker: "LA BOULANGERIE",
      title: "Tout commence\n*au fournil.*",
      paragraphs: [
        "Le pain est pétri et cuit sur place, chaque matin. Les viennoiseries suivent, puis les entremets de la saison, montés à la main.",
        "Nous travaillons avec une courte liste de producteurs et rien n’est industriel. Même les couleurs des vitrines sont choisies.",
      ],
      cta: { label: "Voir la vitrine du jour", href: "/carte" },
    },
    marquee: {
      items: ["PÉTRI LE MATIN", "BEURRE AOP", "AUCUN ADDITIF", "ENTREMETS DE SAISON"],
    },
    featuredProducts: {
      kicker: "LA VITRINE",
      title: "Ce qui sort\n*du four.*",
      aside: "Pains, viennoiseries et entremets renouvelés chaque matin.",
      note: "Produits et prix de démonstration.",
      limit: 6,
      allLink: { label: "Toute la vitrine", href: "/carte" },
    },
    reviews: {
      kicker: "VOS PRÉFÉRENCES",
      title: "Vous avez\n*vos favoris.*",
      text: "Les avis de nos clients sur la fraîcheur, le goût et la présentation en vitrine.",
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
      intro: "Les formes, les finitions et la lumière du matin.",
      images: [
        { src: "/cms/patisserie/gallery1.jpg", alt: "Entremets de la maison" },
        { src: "/cms/patisserie/gallery2.jpg", alt: "Pain et viennoiseries" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Cinq heures\n*le matin*",
      caption: "Pétrissage, tourage, four : la matinée en accéléré.",
      source: { kind: "file", src: "/cms/patisserie/video.mp4", poster: "/cms/patisserie/hero.jpg" },
    },
  },

  streetfood: {
    hero: {
      kicker: "SUR LA PLACE, TOUS LES SOIRS",
      title: "Le truck bouge.\n*La recette reste.*",
      lead: "On se gare sur la place, on allume le gril et on cuisine à la minute devant la file. Vous mangez debout, et bien.",
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
        "Le camion change de place chaque semaine, mais la recette ne bouge pas : produits frais, cuisson à la minute, sauce maison.",
        "On ouvre à 18h et on ferme quand la file est vidée. Il reste rarement beaucoup dans les assiettes.",
      ],
      cta: { label: "Voir la carte du truck", href: "/carte" },
    },
    marquee: {
      items: ["CUISSON À LA MINUTE", "TOUS LES SOIRS", "SAUCES MAISON", "PAIEMENT SANS CONTACT"],
    },
    featuredProducts: {
      kicker: "CE QUI MIJOTE",
      title: "Ce soir,\n*on sert.*",
      aside: "La carte du truck : courte, franche, sans lecture interminable.",
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
      hoursNote: "18h–23h, selon la place du jour · à confirmer",
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
      intro: "Les néons, la file et la vapeur au-dessus des assiettes.",
      images: [
        { src: "/cms/streetfood/gallery1.jpg", alt: "Néon du food truck" },
        { src: "/cms/streetfood/gallery2.jpg", alt: "Assiette de nuit" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le truck\n*tourne*",
      caption: "Le service, la file, la nuit : l’énergie du truck.",
      source: { kind: "file", src: "/cms/streetfood/video.mp4", poster: "/cms/streetfood/hero.jpg" },
    },
  },

  compta: {
    hero: {
      kicker: "FORFAIT CLAIR, DÉLAIS TENUS",
      title: "Un bilan qu’on\n*comprend.*",
      lead: "Comptabilité, déclarations, paie : chaque poste est commenté, chaque échéance est tenue, et vous savez toujours où vous en êtes.",
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
        "Un bilan ne sert à rien si on ne sait pas le lire. Nous commentons chaque poste et vous disons précisément ce qu’il faut surveiller.",
        "Déclarations, paie, TVA, comptes annuels : le calendrier est tenu, et un appel de plus ne coûte rien de plus.",
      ],
      cta: { label: "Demander un devis", href: "/contact" },
    },
    marquee: {
      items: ["FORFAIT CLAIR", "DÉLAIS TENUS", "CONSEIL INCLUS", "POSTES COMMENTÉS"],
    },
    featuredProducts: {
      kicker: "NOS MISSIONS",
      title: "Ce que nous\n*gérons.*",
      aside: "Comptabilité, déclarations, paie : le périmètre, le prix et le délai, écrits.",
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
      hoursNote: "09h–18h, sur rendez-vous · à confirmer",
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
      intro: "Le bureau, les dossiers et la machine à café qui fait tourner la compta.",
      images: [
        { src: "/cms/compta/gallery1.jpg", alt: "Bureau du cabinet" },
        { src: "/cms/compta/gallery2.jpg", alt: "Documents comptables" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "La journée\n*de clôture*",
      caption: "Une journée de clôture, en accéléré.",
      source: { kind: "file", src: "/cms/compta/video.mp4", poster: "/cms/compta/hero.jpg" },
    },
  },

  ecole: {
    hero: {
      kicker: "GROUPES LIMITÉS À 12 PERSONNES",
      title: "Douze personnes.\n*Vos mains sur le sujet.*",
      lead: "Des ateliers où chacun manipule, pose ses questions et repart avec quelque chose de utilisable le lendemain. Pas de cours magistral.",
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
      items: ["GROUPES LIMITÉS À 12", "FORMATEURS DU TERRAIN", "CAS PRATIQUES", "SESSIONS TOUTE L’ANNÉE"],
    },
    featuredProducts: {
      kicker: "NOS FORMATIONS",
      title: "Les parcours,\n*la durée, le prix.*",
      aside: "Chaque programme détaillé, avec ses modalités d’inscription et son niveau.",
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
      title: "Une salle,\n*des postes de travail.*",
      hoursTitle: "Du lundi au samedi",
      hoursNote: "Sessions de 9h à 18h, du lundi au samedi · à confirmer",
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
      intro: "Les ateliers, les projets présentés et les questions qui restent.",
      images: [
        { src: "/cms/ecole/gallery1.jpg", alt: "Atelier en cours" },
        { src: "/cms/ecole/gallery2.jpg", alt: "Projet présenté" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "L’atelier\n*en un éclair*",
      caption: "Une session d’atelier, en accéléré.",
      source: { kind: "file", src: "/cms/ecole/video.mp4", poster: "/cms/ecole/hero.jpg" },
    },
  },

  /* ── Fine dining ──────────────────────────────────────────────────────── */
  gastronomique: {
    hero: {
      kicker: "MENU UNIQUE, UN SEUL SERVICE",
      title: "Un menu,\n*une seule soirée.*",
      lead: "Le chef compose selon le marché du jour, on le déroule en sept services, et le sommelier propose un accord sans vous forcer la main.",
      badges: [
        { icon: "star", label: "Menu dégustation" },
        { icon: "clock", label: "Dîner à 19h30" },
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
      title: "Sept services,\n*une seule ligne.*",
      paragraphs: [
        "Le chef compose un menu unique, adapté au marché du jour. Pas de choix à faire, pas d’attente : on déroule, et chaque service s’enchaîne.",
        "Le sommelier propose un accord en fonction de vos ports, ou une seule coupe à l’aveugle pour découvrir.",
      ],
      cta: { label: "Réserver une table", href: "/reservations" },
    },
    marquee: {
      items: ["SEPT SERVICES", "ACCORD VINS PROPOSÉ", "UN SEUL SERVICE PAR SOIR", "MENU ÉCRIT LE LUNDI"],
    },
    featuredProducts: {
      kicker: "LE MENU DU SOIR",
      title: "Les services\n*de la soirée.*",
      aside: "Entrées, plats, desserts : ce que vous goûtez ce soir, dans l’ordre.",
      note: "Menu et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir le menu complet", href: "/carte" },
    },
    reviews: {
      kicker: "LA PRESSE ET LES CLIENTS",
      title: "On a parlé\n*longtemps après.*",
      text: "Les critiques et les avis de nos clients sur le menu, le rythme du service et l’ambiance de la salle.",
      rateLabel: "Nous noter sur Google",
      viewLabel: "Voir les avis Google",
      sheetLabel: "Voir la fiche Google",
      cardCaption: "Avis vérifiés sur Google",
    },
    visit: {
      kicker: "LA SALLE",
      title: "Vingt-deux couverts,\n*une seule prise.*",
      hoursTitle: "Du mercredi au samedi",
      hoursNote: "Un seul service à 19h30, tous les soirs · à confirmer",
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
      intro: "La salle, le menu, le service en salle.",
      images: [
        { src: "/cms/gastronomique/gallery1.jpg", alt: "Salle du restaurant" },
        { src: "/cms/gastronomique/gallery2.jpg", alt: "Service à table" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Une soirée\n*de bout en bout*",
      caption: "Du premier verre au dernier dessert.",
      source: { kind: "file", src: "/cms/gastronomique/video.mp4", poster: "/cms/gastronomique/hero.jpg" },
    },
  },

  baravin: {
    hero: {
      kicker: "LISTE COURTE, VINS AU VERRE",
      title: "Un verre,\n*puis on reste.*",
      lead: "Trente références choisies pour leur buvabilité, des tapas à partager et une salle où l’on ne regarde pas l’heure en partant.",
      badges: [
        { icon: "star", label: "Vins au verre" },
        { icon: "bag", label: "Tapas à partager" },
        { icon: "clock", label: "Sans réservation" },
      ],
      image: { src: "/cms/baravin/hero.jpg", alt: "Bar à vins avec assiettes de tapas" },
      sticker: false,
      floatingText: "Un verre,\npuis on reste.",
      primary: { label: "Voir la carte des vins", href: "/carte" },
      secondary: { label: "Réserver une table", href: "/reservations" },
    },
    about: {
      image: { src: "/cms/baravin/about.jpg", alt: "Bouteilles de vin dans une cave" },
      artCaption: "LA CAVE.\nLE VERRE.",
      kicker: "NOS VINS",
      title: "Trente références,\n*et c’est tout.*",
      paragraphs: [
        "Une liste courte, renouvelée régulièrement, choisie pour leur buvabilité autant que pour leur singularité. Si une bouteille ne fait plus son effet, elle sort.",
        "Le sommelier est là pour parler vin, mais aussi pour dire simplement ce qui ira avec votre table.",
      ],
      cta: { label: "Voir la carte", href: "/carte" },
    },
    marquee: {
      items: ["VINS AU VERRE", "TAPAS À PARTAGER", "LISTE COURTE", "SANS RÉSERVATION"],
    },
    featuredProducts: {
      kicker: "LA CARTE DU BAR",
      title: "Ce qu’on\n*ouvre ce soir.*",
      aside: "Les vins natures, les bulles et ce qui accompagne le verre.",
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
      title: "Du mardi au samedi,\n*après le boulot.*",
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
      intro: "Les bouteilles, le zinc et les assiettes à partager.",
      images: [
        { src: "/cms/baravin/gallery1.jpg", alt: "Cave à vin" },
        { src: "/cms/baravin/gallery2.jpg", alt: "Tapas à partager" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le service\n*du bar*",
      caption: "Le service du bar, filmé de près.",
      source: { kind: "file", src: "/cms/baravin/video.mp4", poster: "/cms/baravin/hero.jpg" },
    },
  },

  brunch: {
    hero: {
      kicker: "DE 9H À 17H, SANS LIMITATION DE TEMPS",
      title: "Le matin\n*prend son temps.*",
      lead: "Œufs coulants, pancakes, bowls et pain beurré : tout est préparé à la commande, et l’assiette arrive quand vous êtes prêts.",
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
        "On sert le brunch de 9h à 17h, sans limite de temps : les plats arrivent quand vous êtes prêts, et la table reste la vôtre.",
        "Le café vient d’un torréfacteur de quartier, le pain est bake le matin même, et les assiettes sont généreuses.",
      ],
      cta: { label: "Réserver une table", href: "/reservations" },
    },
    marquee: {
      items: ["SANS LIMITATION DE TEMPS", "CAFÉ DE SPÉCIALITÉ", "PAIN DU MATIN", "TOUS LES JOURS"],
    },
    featuredProducts: {
      kicker: "LA CARTE",
      title: "Ce qu’on\n*propose le matin.*",
      aside: "Œufs, pancakes, bowls et pain beurré, toute la journée.",
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
      intro: "La salle, la lumière et les assiettes du dimanche.",
      images: [
        { src: "/cms/brunch/gallery1.jpg", alt: "Salle lumineuse" },
        { src: "/cms/brunch/gallery2.jpg", alt: "Assiette de brunch" },
      ],
    },
    video: {
      kicker: "EN VIDÉO",
      title: "Le matin\n*ça se passe*",
      caption: "La cuisine du brunch, en temps réel.",
      source: { kind: "file", src: "/cms/brunch/video.mp4", poster: "/cms/brunch/hero.jpg" },
    },
  },

  burger: {
    hero: {
      kicker: "BŒUF HACHÉ SUR PLACE, PAIN BRIOCHÉ",
      title: "Six burgers.\n*Pas un de plus.*",
      lead: "Bœuf haché chaque matin, pain brioché du fournil voisin, sauce maison : la commande se prend en trente secondes et se mange tout de suite.",
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
      kicker: "LE FAIT-MAISON",
      title: "On hache,\n*on grille, on sert.*",
      paragraphs: [
        "Le bœuf est haché chaque matin et grillé à la commande, jamais avant. Le pain brioché arrive du fournil voisin, encore tiède.",
        "Les sauces sont faites maison, la pomme de terre est frite sur place, et le menu reste lisible : six burgers, une poignée de variantes, rien d’autre.",
      ],
      cta: { label: "Commander", href: "/commander#start" },
    },
    marquee: {
      items: ["BŒUF HACHÉ SUR PLACE", "PAIN BRIOCHÉ DU FOURNIL", "SAUCES MAISON", "PRÊT EN 6 MINUTES"],
    },
    featuredProducts: {
      kicker: "NOS BURGERS",
      title: "Six burgers,\n*et c’est tout.*",
      aside: "Les classiques et le burger du mois, sans menus interminables.",
      note: "Produits et prix de démonstration.",
      limit: 6,
      allLink: { label: "Voir toute la carte", href: "/carte" },
    },
    reviews: {
      kicker: "LE VOTE",
      title: "Ils ont leur\n*préféré.*",
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
      title: "La plancha\n*qui crache*",
      caption: "Le bruit, la fumée, le flip : six minutes de cuisine.",
      source: { kind: "file", src: "/cms/burger/video.mp4", poster: "/cms/burger/hero.jpg" },
    },
  },
};
