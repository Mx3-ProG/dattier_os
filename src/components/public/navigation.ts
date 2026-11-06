// Source unique des liens du site public : header, menu mobile et footer.
// Chaque cible est une route existante de src/app/site-demo/[[...page]]/page.tsx
// ou une ancre d'une section de l'accueil (voir home-sections.tsx).
export type NavLink = { href: string; label: string };

// Le site de démonstration vit sous /site-demo : « / » présente atacuisine.
export const siteBase = "/site-demo";
export const sitePath = (path = "") =>
  path === "" || path === "/" ? siteBase : `${siteBase}${path}`;

export const homeAnchors = {
  specialites: "specialites",
  histoire: "histoire",
  carte: "carte",
  avis: "avis",
  reservation: "reservation",
  faq: "faq",
  infos: "infos",
} as const;

export const primaryNav: NavLink[] = [
  { href: sitePath("/histoire"), label: "Notre histoire" },
  { href: sitePath("/carte"), label: "Notre carte" },
  { href: `${siteBase}#${homeAnchors.specialites}`, label: "Nos spécialités" },
  { href: sitePath("/avis"), label: "Avis clients" },
  { href: sitePath("/commander"), label: "Click & collect" },
  { href: sitePath("/contact"), label: "Contact" },
];

export const fullNav: NavLink[] = [
  { href: sitePath("/"), label: "Accueil" },
  { href: sitePath("/histoire"), label: "Notre histoire" },
  { href: sitePath("/carte"), label: "Notre carte" },
  { href: `${siteBase}#${homeAnchors.specialites}`, label: "Nos spécialités" },
  { href: sitePath("/avis"), label: "Avis clients" },
  { href: sitePath("/reservations"), label: "Réservation" },
  { href: sitePath("/commander"), label: "Click & collect" },
  { href: `${siteBase}#${homeAnchors.infos}`, label: "Informations pratiques" },
  { href: sitePath("/contact"), label: "Contact" },
  { href: `${siteBase}#${homeAnchors.faq}`, label: "FAQ" },
];

export const secondaryNav: NavLink[] = [
  { href: sitePath("/galerie"), label: "Galerie" },
  { href: sitePath("/compte"), label: "Compte client" },
];

export const legalNav: NavLink[] = [
  { href: sitePath("/mentions-legales"), label: "Mentions légales" },
  { href: sitePath("/confidentialite"), label: "Confidentialité" },
  { href: sitePath("/cookies"), label: "Cookies" },
];

export function isActive(pathname: string, href: string) {
  if (href.includes("#")) return false;
  return href === siteBase ? pathname === siteBase : pathname.startsWith(href);
}
