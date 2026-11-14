/* Moteur réflexe de FLUX : sans IA générative, une demande libre (« site pour
   ma pizzeria Da Marco, en rouge, avec commande en ligne ») donne déjà un site
   e-commerce complet et cohérent. L’IA générative, quand elle est activée,
   part de ce plan et l’enrichit (llm.ts). */
import type { FontId } from "@/features/cms/schema";
import type { FluxGoal, FluxLayout, FluxPlan } from "./plan";

const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, " ");

type Profile = {
  match: RegExp;
  layout: FluxLayout;
  goal: FluxGoal;
  primary: string;
  background: string;
  accent: string;
  heading: FontId;
  body: FontId;
  kicker: string;
  title: string;
  lead: string;
  marquee: string[];
  products: string;
  about: string;
  story: string;
};

/** Profils métier : la base e-commerce est commune, le ton change. */
const profiles: Profile[] = [
  { match: /pizz|itali|trattoria|pasta/, layout: "bistrot", goal: "order", primary: "#b3261e", background: "#fff8ef", accent: "#2f6b3a", heading: "dmSerif", body: "inter", kicker: "PIZZERIA ARTISANALE", title: "La vraie pizza,\n*cuite comme là-bas.*", lead: "Pâte maturée, produits italiens et four bien chaud : commandez en ligne, on s’occupe du reste.", marquee: ["PÂTE MATURÉE 48 H", "MOZZARELLA FIOR DI LATTE", "CUITE AU FOUR", "À EMPORTER OU EN LIVRAISON"], products: "Nos pizzas *du moment*", about: "Une histoire de *famille* et de farine", story: "Tout part d’une recette transmise et d’un four qu’on ne laisse jamais refroidir." },
  { match: /burger|street|snack|tacos|kebab|fast/, layout: "comptoir", goal: "order", primary: "#c2410c", background: "#fff8e8", accent: "#facc15", heading: "poppins", body: "inter", kicker: "STREET FOOD", title: "Une faim.\n*Une vraie envie.*", lead: "Des recettes généreuses préparées à la minute. Commandez en deux clics, récupérez sans attendre.", marquee: ["FAIT MINUTE", "PAIN BRIOCHÉ", "SAUCES MAISON", "CLICK & COLLECT"], products: "Les *best-sellers*", about: "Du *bon*, vite, et sans compromis", story: "Des produits frais, des recettes simples et une équipe qui adore régaler." },
  { match: /cafe|coffee|salon de the|brunch|tea/, layout: "pause", goal: "order", primary: "#7c4a2d", background: "#fdf6ee", accent: "#e8b88a", heading: "fraunces", body: "nunito", kicker: "CAFÉ & GOURMANDISES", title: "Votre pause\n*préférée.*", lead: "Cafés de spécialité, douceurs maison et brunchs : à savourer sur place ou à emporter.", marquee: ["CAFÉ DE SPÉCIALITÉ", "FAIT MAISON", "BRUNCH LE WEEK-END", "À EMPORTER"], products: "À *savourer* maintenant", about: "Un lieu pour *ralentir*", story: "Un comptoir chaleureux, des grains choisis avec soin et des pâtisseries du jour." },
  { match: /boulang|patiss|viennois|gateau|chocolat/, layout: "pause", goal: "order", primary: "#9a3412", background: "#fff7ed", accent: "#f2c6a0", heading: "playfair", body: "nunito", kicker: "ARTISAN BOULANGER-PÂTISSIER", title: "Le goût du\n*fait maison.*", lead: "Pains au levain, viennoiseries pur beurre et pâtisseries du jour, à réserver en ligne.", marquee: ["LEVAIN NATUREL", "PUR BEURRE", "CUIT CHAQUE MATIN", "COMMANDE EN LIGNE"], products: "Sortis du *four*", about: "Le *savoir-faire* au quotidien", story: "Chaque nuit, nos fournils s’allument pour vous offrir le meilleur dès le matin." },
  { match: /sushi|japon|ramen|asiat|thai|wok|chinois|vietnam|coreen/, layout: "comptoir", goal: "order", primary: "#be123c", background: "#fbf7f2", accent: "#1f2937", heading: "inter", body: "inter", kicker: "SAVEURS D’ASIE", title: "Fraîcheur\n*et précision.*", lead: "Des recettes préparées à la commande avec des produits d’une grande fraîcheur. Livraison et retrait.", marquee: ["PRÉPARÉ À LA COMMANDE", "POISSON FRAIS", "LIVRAISON RAPIDE", "SAUCES MAISON"], products: "Nos *incontournables*", about: "L’art du *geste juste*", story: "Une cuisine de précision, respectueuse des produits et des saisons." },
  { match: /vegan|vegetal|vegetarien|bio|healthy|salade|bowl/, layout: "jardin", goal: "order", primary: "#2f6b3f", background: "#f5f8ed", accent: "#a3c76d", heading: "fraunces", body: "inter", kicker: "CUISINE VÉGÉTALE", title: "Une cuisine\n*pleine de vie.*", lead: "Des assiettes colorées, de saison et locales, à commander en ligne ou à savourer sur place.", marquee: ["100 % VÉGÉTAL", "PRODUITS LOCAUX", "DE SAISON", "ZÉRO DÉCHET"], products: "La carte *du marché*", about: "Le *bon* qui fait du bien", story: "Nous travaillons avec des producteurs voisins pour une cuisine sincère et gourmande." },
  { match: /gastro|etoile|chef|fine|haut de gamme|bistronomi/, layout: "bistrot", goal: "reserve", primary: "#5b4a2c", background: "#faf6ee", accent: "#c8a96a", heading: "playfair", body: "inter", kicker: "RESTAURANT", title: "L’émotion\n*à votre table.*", lead: "Une cuisine d’auteur, de saison, servie avec attention. Réservez votre table en quelques secondes.", marquee: ["CUISINE DE SAISON", "MENU DÉGUSTATION", "ACCORDS METS & VINS", "SUR RÉSERVATION"], products: "Le *menu* du moment", about: "Une cuisine *d’auteur*", story: "Chaque assiette raconte un produit, une rencontre et une saison." },
  { match: /creperie|crepe|galette|breton/, layout: "jardin", goal: "order", primary: "#1d4e89", background: "#f6f9fc", accent: "#f2b134", heading: "dmSerif", body: "nunito", kicker: "CRÊPERIE", title: "Galettes dorées,\n*crêpes gourmandes.*", lead: "Blé noir, beurre salé et garnitures généreuses : à déguster sur place ou à emporter.", marquee: ["BLÉ NOIR", "BEURRE SALÉ", "CIDRE ARTISANAL", "À EMPORTER"], products: "Nos *galettes* et crêpes", about: "Un air de *Bretagne*", story: "Des recettes traditionnelles et des produits sélectionnés avec soin." },
  { match: /\bbar\b|cocktail|biere|\bvins?\b|\bcave\b|\bpub\b/, layout: "bistrot", goal: "reserve", primary: "#9d174d", background: "#fbf5f3", accent: "#f59e0b", heading: "dmSerif", body: "inter", kicker: "BAR & PLANCHES", title: "On trinque\n*ce soir ?*", lead: "Cocktails signature, belle sélection et planches à partager. Réservez votre table pour la soirée.", marquee: ["COCKTAILS SIGNATURE", "PLANCHES À PARTAGER", "AFTERWORK", "SOIRÉES À THÈME"], products: "La *carte* des envies", about: "Le lieu des *bons moments*", story: "Un comptoir convivial pour se retrouver, découvrir et partager." },
  { match: /traiteur|evenement|mariage|buffet/, layout: "jardin", goal: "contact", primary: "#7a3e2b", background: "#fbf7f1", accent: "#d6b48a", heading: "playfair", body: "inter", kicker: "TRAITEUR", title: "Vos événements,\n*notre savoir-faire.*", lead: "Buffets, cocktails et menus sur mesure pour vos événements privés et professionnels.", marquee: ["SUR MESURE", "PRODUITS FRAIS", "LIVRAISON & SERVICE", "DEVIS RAPIDE"], products: "Nos *formules*", about: "Le goût du *sur-mesure*", story: "Nous composons chaque prestation avec vous, du premier échange au dernier toast." },
  { match: /boutique|epicerie|commerce|magasin|vente|produits|e-?commerce|shop|vetement|mode|bijou|deco|fleur/, layout: "comptoir", goal: "order", primary: "#1f4f6e", background: "#f7f9fb", accent: "#e0a458", heading: "poppins", body: "inter", kicker: "BOUTIQUE EN LIGNE", title: "Nos produits,\n*livrés chez vous.*", lead: "Une sélection choisie avec soin, à commander en ligne en quelques clics. Retrait ou livraison.", marquee: ["SÉLECTION SOIGNÉE", "PAIEMENT SÉCURISÉ", "RETRAIT OU LIVRAISON", "SERVICE CLIENT RÉACTIF"], products: "Nos *coups de cœur*", about: "Une boutique *qui vous ressemble*", story: "Nous sélectionnons chaque produit pour sa qualité et l’histoire qu’il raconte." },
  { match: /coiff|barbier|beaute|esthet|onglerie|spa|massage/, layout: "pause", goal: "contact", primary: "#7e3a5c", background: "#fcf6f8", accent: "#d8a7b9", heading: "playfair", body: "nunito", kicker: "SALON", title: "Prenez soin\n*de vous.*", lead: "Des prestations sur mesure dans un lieu apaisant. Prenez rendez-vous en ligne.", marquee: ["SUR RENDEZ-VOUS", "PRODUITS PROFESSIONNELS", "CONSEILS PERSONNALISÉS", "CARTE CADEAU"], products: "Nos *prestations*", about: "Un moment *pour vous*", story: "Une équipe passionnée, à l’écoute de vos envies." },
];
const fallbackProfile: Profile = { match: /$^/, layout: "bistrot", goal: "order", primary: "#184d3b", background: "#f8faf7", accent: "#c9a46a", heading: "dmSerif", body: "inter", kicker: "BIENVENUE", title: "Le bon goût,\n*en quelques clics.*", lead: "Découvrez notre sélection et commandez en ligne : retrait sur place ou livraison.", marquee: ["COMMANDE EN LIGNE", "PAIEMENT SÉCURISÉ", "FAIT AVEC SOIN", "RETRAIT OU LIVRAISON"], products: "Nos *incontournables*", about: "Notre *histoire*", story: "Une équipe passionnée, des produits choisis et l’envie de bien faire." };

const colorWords: [RegExp, string][] = [
  [/bleu nuit/, "#1e2a4a"], [/bordeaux|lie de vin/, "#7f1d1d"], [/rouge/, "#b91c1c"], [/bleu marine|marine/, "#1e3a5f"], [/turquoise|cyan/, "#0f766e"],
  [/bleu/, "#1d4ed8"], [/vert sapin|vert fonce/, "#14532d"], [/vert/, "#2f7d4a"], [/jaune/, "#a16207"], [/orange/, "#c2410c"],
  [/rose/, "#be185d"], [/violet|mauve|lavande/, "#6d28d9"], [/dore|\bor\b|gold/, "#9a7b2f"], [/marron|chocolat|brun/, "#6b3f24"],
  [/noir/, "#1f1b1a"], [/gris/, "#4b5563"], [/terracotta|brique/, "#a4462e"],
];
/** La dernière couleur citée l’emporte (« en rouge… finalement plutôt bleu »). */
function colorIn(text: string) {
  let best: { at: number; hex: string } | null = null;
  for (const [re, hex] of colorWords) {
    const found = [...text.matchAll(new RegExp(re.source, "g"))].at(-1);
    if (found && (!best || found.index > best.at)) best = { at: found.index, hex };
  }
  return best?.hex ?? null;
}

/** Nom de l’établissement : « s’appelle Da Marco », « nommé “Le Fournil” », « pour Chez Lulu ». */
export function nameIn(raw: string) {
  const quoted = raw.match(/[«“"]\s*([^»”"]{2,40}?)\s*[»”"]/);
  if (quoted) return quoted[1].trim();
  const named = raw.match(/(?:s[’']appelle|nomm[ée]e?|appel[ée]e?|enseigne|nom\s*:?)\s+([A-ZÀ-Ý][^,.;!?\n]{1,40})/);
  if (named) return named[1].replace(/\s+(?:en|avec|et|qui|pour|à|au|aux|dans)\s.*$/i, "").trim();
  const chez = raw.match(/\b(Chez\s+[A-ZÀ-Ý][\wÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ý][\wÀ-ÿ'’-]+)?)/);
  return chez ? chez[1].trim() : "";
}

/** Plan complet à partir d’une demande libre. */
export function reflexPlan(message: string, current: { name: string }): FluxPlan {
  const n = fold(message);
  const p = profiles.find((profile) => profile.match.test(n)) ?? fallbackProfile;
  const name = nameIn(message);
  const brand = name || current.name;
  const goal: FluxGoal = /reserv/.test(n)
    ? "reserve"
    : /devis|rendez-vous|rdv|contact/.test(n)
      ? "contact"
      : /command|livr|e-?commerce|boutique|vend|click/.test(n)
        ? "order"
        : p.goal;
  // « fond noir », « fond sombre » : thème foncé ; « fond blanc / crème » : clair.
  const background = /fond (noir|sombre|fonce)|\bdark\b|ambiance nocturne/.test(n)
    ? "#161312"
    : /fond (blanc|clair)/.test(n)
      ? "#ffffff"
      : /fond (creme|beige|sable)/.test(n)
        ? "#f8f1e5"
        : p.background;
  const colorText = n.replace(/fond \w+/g, "");
  const primary = colorIn(colorText) ?? p.primary;
  const heading: FontId = /elegant|chic|luxe|raffin/.test(n)
    ? "playfair"
    : /moderne|minimal|epure/.test(n)
      ? "inter"
      : /fun|ludique|enfant|rond/.test(n)
        ? "nunito"
        : p.heading;
  const primaryLabel = { order: "Commander en ligne", reserve: "Réserver une table", contact: "Nous contacter" }[goal];
  const faq = [
    goal === "order"
      ? { question: "Comment commander en ligne ?", answer: "Choisissez vos produits, ajoutez-les au panier puis sélectionnez votre créneau de retrait ou de livraison. Vous recevez une confirmation immédiate." }
      : goal === "reserve"
        ? { question: "Comment réserver ?", answer: "Cliquez sur « Réserver », choisissez la date, l’heure et le nombre de personnes. Nous confirmons votre demande rapidement." }
        : { question: "Comment vous contacter ?", answer: "Par la page Contact, par téléphone ou par email : nous répondons rapidement à chaque demande." },
    { question: "Quels moyens de paiement acceptez-vous ?", answer: "Carte bancaire en ligne de façon sécurisée, et sur place selon les modalités indiquées lors de la commande." },
    { question: "Puis-je retirer ma commande sur place ?", answer: "Oui, choisissez le retrait au moment de la commande et présentez-vous au créneau indiqué." },
    { question: "Où trouver les allergènes ?", answer: "Chaque produit indique sa composition. Une question ? Notre équipe vous renseigne avec plaisir." },
  ];
  return {
    layout: p.layout,
    goal,
    name,
    description: `${brand ? `${brand} · ` : ""}${p.lead}`.slice(0, 300),
    announcement: goal === "order" ? "COMMANDE EN LIGNE · RETRAIT OU LIVRAISON" : goal === "reserve" ? "RÉSERVEZ VOTRE TABLE EN LIGNE" : "DEVIS ET RENDEZ-VOUS EN LIGNE",
    colors: { primary, background, accent: p.accent },
    fonts: { heading, body: p.body },
    hero: {
      kicker: brand ? brand.toUpperCase().slice(0, 80) : p.kicker,
      title: p.title,
      lead: p.lead,
      primaryLabel,
      secondaryLabel: goal === "order" ? "Voir la carte" : "Découvrir",
      badges: goal === "order"
        ? ["Commande en ligne", "Retrait rapide", "Paiement sécurisé", "Fait avec soin"]
        : goal === "reserve"
          ? ["Réservation en ligne", "Confirmation rapide", "Produits de saison", "Accueil chaleureux"]
          : ["Réponse rapide", "Sur mesure", "Conseils personnalisés", "Satisfaction garantie"],
    },
    marquee: p.marquee,
    products: { kicker: p.kicker, title: p.products, aside: goal === "order" ? "Ajoutez au panier,\non prépare tout de suite." : "Une sélection qui change\nau fil des saisons." },
    about: { kicker: "NOTRE HISTOIRE", title: p.about, paragraphs: [p.story, brand ? `${brand}, c’est avant tout une équipe qui aime recevoir et faire plaisir.` : "Avant tout, une équipe qui aime recevoir et faire plaisir."] },
    faq,
    cta: { title: goal === "order" ? "Une petite *envie* ?" : goal === "reserve" ? "On vous garde *une table* ?" : "Parlons de *votre projet*", text: goal === "order" ? "Commandez maintenant, on s’occupe de tout." : goal === "reserve" ? "Réservez en quelques secondes." : "Écrivez-nous, réponse rapide garantie.", label: primaryLabel },
    footer: { tagline: brand ? `${brand} · ${p.kicker.toLowerCase()}` : "Fait avec soin, servi avec le sourire.", cta: goal === "order" ? "On commande ?" : goal === "reserve" ? "À très vite ?" : "On en parle ?" },
    seo: {
      title: `${brand || "{{restaurant.name}}"} · ${p.kicker.charAt(0)}${p.kicker.slice(1).toLowerCase()}`.slice(0, 70),
      description: p.lead.slice(0, 170),
    },
    addonSections: [
      ...(goal === "reserve" ? (["reservation"] as const) : []),
      ...(/fidel|points/.test(n) ? (["loyalty"] as const) : []),
      ...(/livr/.test(n) ? (["delivery"] as const) : []),
      ...(/allergen/.test(n) ? (["allergens"] as const) : []),
      ...(/lot|formule|box|coffret/.test(n) ? (["bundles"] as const) : []),
      ...(/rendez-vous|rdv|prestation/.test(n) ? (["services"] as const) : []),
      ...(/devis|estimation/.test(n) ? (["estimation"] as const) : []),
    ],
    extras: { loader: null, notFound: null, background: null, decoration: null },
  };
}
