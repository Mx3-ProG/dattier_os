import type { Page, Section, SiteConfig } from "./schema";

const image = { src: "/cms/racing/gallery1.jpg", alt: "Automobile de présentation à remplacer" };
const block = (id: string, kicker: string, title: string, body: string): Section => ({
  id, type: "textBlock", lock: 1, visible: true, required: false,
  props: { kicker, title, body, align: "left" },
});
const photo = (id: string, kicker: string, title: string, body: string, side: "left" | "right" = "right", ctaHref = "/contact"): Section => ({
  id, type: "textImage", lock: 1, visible: true, required: false,
  props: { kicker, title, body, image, imageSide: side, cta: { label: ctaHref === "/services" ? "Découvrir les services" : "Parlons de votre projet", href: ctaHref } },
});
const page = (title: string, slug: string, sections: Section[]): Page => ({
  kind: "custom", title, slug, visible: true,
  seo: { title, description: "", ogImage: "" }, sections,
});

/** Editorial pages installed with La Collection. All content remains editable. */
export function applyCollectionPages(config: SiteConfig, defaults: SiteConfig["pages"]): void {
  config.collectionVehicles ??= [];
  const home = config.pages.home;
  if (!home.sections.some((section) => section.id === "collection-home-services")) {
    const service = photo("collection-home-services", "À VOS CÔTÉS", "Des services sur mesure", "Expertise, protection, transport et accompagnement : chaque projet automobile mérite une attention particulière. Contactez-nous pour connaître les prestations disponibles.", "left", "/services");
    const aboutIndex = home.sections.findIndex((section) => section.type === "about");
    home.sections.splice(aboutIndex < 0 ? home.sections.length : aboutIndex + 1, 0, service);
  }
  const pages: Record<string, Page> = {
    "deja-vendues": page("Déjà vendues", "deja-vendues", [
      block("collection-sold-intro", "NOS HISTOIRES", "Déjà vendues", "Découvrez les automobiles qui ont poursuivi leur route auprès de nouveaux passionnés."),
    ]),
    services: page("Services", "services", [
      block("collection-services-intro", "SUR MESURE", "Nos services", "De la première visite à la remise des clés, notre accompagnement s’adapte à votre projet. Prestations et conditions à confirmer auprès de notre équipe."),
      photo("collection-services-expertise", "EXPERTISE", "Un regard précis sur chaque automobile", "L’état, l’historique et les caractéristiques d’une voiture comptent autant que la première impression."),
      photo("collection-services-protection", "PROTECTION", "Préserver chaque détail", "Une protection adaptée permet de profiter plus longtemps des lignes et des finitions qui rendent une automobile unique.", "left"),
      photo("collection-services-transport", "LIVRAISON", "Un transport à la hauteur", "Chaque remise de clés mérite une organisation soignée et un échange personnel."),
    ]),
    "pourquoi-nous": page("Pourquoi nous choisir", "pourquoi-nous", [
      block("collection-why-intro", "NOTRE MAISON", "Pourquoi nous choisir ?", "La confiance se construit dans les détails, dans la qualité des échanges et dans la façon de présenter chaque automobile."),
      photo("collection-why-story", "NOTRE HISTOIRE", "Une passion devenue métier", "Derrière chaque sélection, il y a une équipe, des rencontres et une certaine idée de l’automobile."),
      photo("collection-why-selection", "NOTRE SÉLECTION", "Le goût des configurations singulières", "Nous aimons les véhicules qui racontent quelque chose et les projets qui prennent le temps d’être bien menés.", "left"),
      photo("collection-why-quality", "NOTRE ENGAGEMENT", "La qualité à chaque étape", "Une information claire et un accompagnement attentif rendent le choix d’une automobile plus serein."),
    ]),
    garantie: page("Garantie", "garantie", [
      block("collection-warranty-intro", "SÉRÉNITÉ", "La garantie, expliquée clairement", "Les garanties applicables varient selon le véhicule et le contrat proposé. Demandez les conditions détaillées, les exclusions et la durée de couverture avant votre achat."),
      photo("collection-warranty-process", "CONTRÔLE", "Un véhicule connu avant sa remise", "Notre équipe vous présente les informations disponibles sur le véhicule et les documents remis lors de la vente."),
      { id: "collection-warranty-faq", type: "faq", lock: 1, visible: true, required: false,
        props: { kicker: "QUESTIONS FRÉQUENTES", title: "Ce qu’il faut savoir", items: [
          { question: "Quelle est la durée de la garantie ?", answer: "À personnaliser selon le contrat de garantie proposé pour chaque véhicule." },
          { question: "Quels éléments sont couverts ?", answer: "La couverture dépend des conditions contractuelles remises lors de la vente." },
          { question: "Comment demander une prise en charge ?", answer: "Indiquez ici le contact et les étapes de votre procédure réelle." },
        ] } },
    ]),
  };
  for (const [key, value] of Object.entries(pages)) {
    if (!config.pages[key]) config.pages[key] = value;
  }

  // System pages already have stable routes and working catalogue/contact blocks.
  if (config.pages.carte.title === defaults.carte.title) config.pages.carte.title = "À vendre";
  if (config.pages.carte.seo.title === defaults.carte.seo.title) config.pages.carte.seo.title = "Automobiles à vendre";
  if (config.pages.histoire.title === defaults.histoire.title) config.pages.histoire.title = "Notre histoire";
  if (config.pages.contact.title === defaults.contact.title) config.pages.contact.title = "Nous contacter";
  if (!config.pages.contact.sections.some((section) => section.id === "collection-contact-intro")) {
    config.pages.contact.sections.unshift(
      block("collection-contact-intro", "PRENONS RENDEZ-VOUS", "Nous contacter", "Parlez-nous de votre recherche ou de votre automobile. Nous prendrons le temps d’échanger avec vous."),
    );
  }
}
