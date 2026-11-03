import {
  SCHEMA_VERSION,
  type Page,
  type Section,
  type SiteConfig,
  type Theme,
} from "./schema";

/**
 * Default configuration = the site exactly as it was hard-coded before the CMS.
 * It is also the starting point of every new Studio ATS instance (template).
 */
export const defaultTheme: Theme = {
  colors: {
    primary: "#184d3b",
    primaryDark: "#103627",
    secondary: "#658570",
    accent: "#e2eadf",
    text: "#26201f",
    muted: "#6d5c5b",
    background: "#f8faf7",
    buttonBg: "#184d3b",
    buttonText: "#ffffff",
    link: "#26201f",
  },
  fonts: { heading: "georgia", body: "arial", button: "arial" },
  headingScale: 1,
  subheadingScale: 1,
  headingWeight: 900,
  letterSpacing: "tight",
};

const s = <S extends Section>(section: S) => section;
const catalogFor = (id: string, lock: 1 | 2 | 3, required: boolean): Section =>
  s({
    id,
    type: "featuredProducts",
    lock,
    visible: true,
    required,
    props: {
      kicker: "LA CARTE DES ENVIES",
      title: "Alors, on craque pour quoi ?",
      aside: "Petit creux ou grosse envie,\nil y a toujours un bon match.",
      note: "Carte, prix et illustrations de démonstration.",
      limit: 0,
      allLink: { label: "", href: "" },
    },
  });
const about = (id: string): Section => ({
  id,
  type: "about",
  lock: 1,
  visible: true,
  required: false,
  props: {
    image: {
      src: "/cms/restaurant.svg",
      alt: "Logo original de votre restaurant",
    },
    artCaption: "VOTRE TABLE.\nVOTRE HISTOIRE.",
    kicker: "BIENVENUE DANS NOTRE UNIVERS",
    title: "Un petit lieu.\n*Une grande dose\nde bonne humeur.*",
    paragraphs: [
      "Présentez ici votre cuisine, votre équipe et ce qui rend votre établissement unique.",
      "Une commande ne réserve pas de table. Les places disponibles et les modalités de réservation sont à préciser par l’établissement.",
    ],
    cta: { label: "Ma prochaine pause", href: "/commander#start" },
  },
});
const visit = (id: string, lock: 1 | 2 = 1): Section => ({
  id,
  type: "visit",
  lock,
  visible: true,
  required: false,
  props: {
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
});
const reviews = (id: string, lock: 1 | 2 = 1): Section => ({
  id,
  type: "reviews",
  lock,
  visible: true,
  required: false,
  props: {
    kicker: "VOTRE AVIS COMPTE",
    title: "Vous avez aimé ?\n*Dites-le sur Google.*",
    text: "Consultez les retours laissés sur la fiche officielle de votre restaurant et partagez votre propre expérience après votre visite.",
    rateLabel: "Nous noter sur Google",
    viewLabel: "Voir les avis Google",
    sheetLabel: "Voir la fiche Google",
    cardCaption: "Avis vérifiés sur Google",
  },
});
const map = (id: string): Section => ({
  id,
  type: "map",
  lock: 1,
  visible: true,
  required: false,
  props: {
    kicker: "NOUS TROUVER",
    title: "La gourmandise est juste ici.",
    buttonLabel: "Ouvrir l’itinéraire",
  },
});
const system = (
  id: string,
  block: Extract<Section, { type: "system" }>["props"]["block"],
): Section => ({
  id,
  type: "system",
  lock: 3,
  visible: true,
  required: true,
  props: { block },
});
const legal = (id: string): Section => ({
  id,
  type: "legal",
  lock: 2,
  visible: true,
  required: true,
  props: { extra: [] },
});
const emptySeo = { title: "", description: "", ogImage: "" };
const page = (
  kind: Page["kind"],
  title: string,
  slug: string,
  sections: Section[],
): Page => ({
  kind,
  title,
  slug,
  visible: true,
  seo: emptySeo,
  sections,
});

export function defaultConfig(): SiteConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    branding: {
      publicName: "",
      brandLines: "{{restaurant.name}}",
      logo: { src: "/cms/restaurant.svg", alt: "Votre restaurant" },
      description: "Cuisine, rencontres et convivialité.",
      email: "",
      announcement: "DE LA CUISINE. DU PARTAGE. DE LA CONVIVIALITÉ.",
      announcementHighlight: "✦ BIENVENUE ✦",
    },
    theme: structuredClone(defaultTheme),
    seo: {
      noIndex: true,
      title: "{{restaurant.name}} · Cuisine et convivialité",
      description:
        "Cuisine, rencontres et convivialité. Démonstration e-commerce locale propulsée par DATTIER OS.",
      ogImage: "",
      favicon: "",
      shareName: "{{restaurant.name}}",
    },
    header: {
      navMenu: "La carte",
      navUniverse: "Notre univers",
      navContact: "Nous trouver",
      navAccount: "Mon compte",
      orderLabel: "Commander",
    },
    footer: {
      tagline: "Un peu, beaucoup,\npassionnément gourmand.",
      cta: "À tout de suite ?",
      credit: "{{restaurant.name}} · propulsé par DATTIER OS",
      notice: "Disponibilités et prix confirmés lors de la commande.",
    },
    legal: {
      operator: "",
      legalForm: "",
      siret: "",
      rcs: "",
      vat: "",
      email: "",
      publicationDirector: "",
      host: "",
      mediator: "",
    },
    pages: {
      home: page("content", "Accueil", "", [
        {
          id: "home-hero",
          type: "hero",
          lock: 1,
          visible: true,
          required: false,
          props: {
            kicker: "VOTRE PAUSE BONNE HUMEUR",
            title: "Le bonheur\nà un *très bon goût.*",
            lead: "Découvrez notre cuisine, notre histoire et les moments à partager autour de notre table.",
            primary: { label: "Ça donne faim ?", href: "/commander" },
            secondary: { label: "Je découvre la carte", href: "#specialites" },
            badges: [
              { icon: "bag", label: "Sur place ou à emporter" },
              { icon: "clock", label: "À votre rythme" },
              { icon: "card", label: "Commande en ligne" },
              { icon: "wallet", label: "Paiement sur place" },
            ],
            image: {
              src: "/cms/restaurant.svg",
              alt: "Illustration de restaurant",
            },
            sticker: true,
            floatingText: "Oups.\nEncore un.",
          },
        },
        {
          id: "home-marquee",
          type: "marquee",
          lock: 1,
          visible: true,
          required: false,
          props: {
            items: [
              "LE GOÛT DU PARTAGE",
              "CROUSTY & CRUNCHY",
              "UNE TABLE POUR VOUS",
              "LE GOÛT DU PARTAGE",
            ],
          },
        },
        {
          id: "home-products",
          type: "featuredProducts",
          lock: 1,
          visible: true,
          required: false,
          props: {
            kicker: "LA CARTE DES ENVIES",
            title: "Team sucré.\n*Team salé.*",
            aside:
              "Petit creux ou grosse envie,\nil y a toujours un bon match.",
            note: "Carte, prix et illustrations de démonstration.",
            limit: 6,
            allLink: { label: "Toute la carte", href: "/carte" },
          },
        },
        about("home-about"),
        visit("home-visit"),
        reviews("home-reviews"),
        map("home-map"),
      ]),
      histoire: page("content", "Ma story", "histoire", [
        about("histoire-about"),
        reviews("histoire-reviews"),
      ]),
      contact: page("content", "Nous trouver", "contact", [
        visit("contact-visit"),
        reviews("contact-reviews"),
        map("contact-map"),
      ]),
      galerie: page("content", "Galerie", "galerie", [
        {
          id: "galerie-gallery",
          type: "gallery",
          lock: 1,
          visible: true,
          required: false,
          props: {
            kicker: "",
            title: "Les couleurs de la gourmandise",
            intro:
              "La galerie officielle sera publiée ici après validation des photos par l’établissement.",
            pageTitle: true,
            images: [],
          },
        },
      ]),
      carte: page("partial", "La carte", "carte", [
        catalogFor("carte-products", 2, true),
      ]),
      commander: page("partial", "Commander", "commander", [
        system("commander-start", "orderStart"),
        catalogFor("commander-products", 2, true),
      ]),
      avis: page("partial", "Avis", "avis", [
        reviews("avis-reviews", 2),
        system("avis-form", "reviewForm"),
      ]),
      reservations: page("partial", "Réservations", "reservations", [
        visit("reservations-visit", 2),
        system("reservations-form", "reservationForm"),
      ]),
      "mentions-legales": page(
        "legal",
        "Mentions légales",
        "mentions-legales",
        [legal("mentions-legales-legal")],
      ),
      "conditions-generales-vente": page(
        "legal",
        "Conditions générales de vente",
        "conditions-generales-vente",
        [legal("cgv-legal")],
      ),
      confidentialite: page("legal", "Confidentialité", "confidentialite", [
        legal("confidentialite-legal"),
      ]),
      cookies: page("legal", "Cookies", "cookies", [legal("cookies-legal")]),
      checkout: page("protected", "Panier et paiement", "checkout", []),
      suivi: page("protected", "Suivi de commande", "suivi", [
        system("suivi-tracking", "tracking"),
      ]),
      compte: page("protected", "Espace client", "compte", [
        system("compte-account", "account"),
      ]),
      qr: page("protected", "Commande à table (QR)", "qr", [
        catalogFor("qr-products", 3, true),
      ]),
    },
  };
}
/** Pages that always exist and cannot be created or deleted from the CMS. */
export const systemPageKeys = Object.keys(defaultConfig().pages);
