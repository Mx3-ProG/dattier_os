// Source unique des liens du site public : header, menu mobile et footer.
// Chaque cible est une route existante de src/app/[[...page]]/page.tsx
// ou une ancre d'une section de l'accueil (voir home-sections.tsx).
export type NavLink = { href: string; label: string };

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
  { href: "/histoire", label: "Notre histoire" },
  { href: "/carte", label: "Notre carte" },
  { href: `/#${homeAnchors.specialites}`, label: "Nos spécialités" },
  { href: "/avis", label: "Avis clients" },
  { href: "/commander", label: "À emporter" },
  { href: "/contact", label: "Contact" },
];

export const fullNav: NavLink[] = [
  { href: "/", label: "Accueil" },
  { href: "/histoire", label: "Notre histoire" },
  { href: "/carte", label: "Notre carte" },
  { href: `/#${homeAnchors.specialites}`, label: "Nos spécialités" },
  { href: "/avis", label: "Avis clients" },
  { href: "/reservations", label: "Réservation" },
  { href: "/commander", label: "À emporter" },
  { href: `/#${homeAnchors.infos}`, label: "Informations pratiques" },
  { href: "/contact", label: "Contact" },
  { href: `/#${homeAnchors.faq}`, label: "FAQ" },
];

export const secondaryNav: NavLink[] = [
  { href: "/galerie", label: "Galerie" },
  { href: "/compte", label: "Compte client" },
];

export const legalNav: NavLink[] = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/cookies", label: "Cookies" },
];

export function isActive(pathname: string, href: string) {
  if (href.includes("#")) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
