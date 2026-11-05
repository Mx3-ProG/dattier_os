// Calendrier des versions de Dattier OS : source unique pour la page /source,
// l'accueil et docs/RELEASES.md (à garder alignés). Les dates à venir sont
// prévisionnelles : une version n'est « publiée » que lorsque `released` est vrai.

export type Release = {
  version: string;
  /** Date ISO (AAAA-MM-JJ) de publication réelle ou prévue. */
  date: string;
  released: boolean;
  kind: "majeure" | "mineure" | "corrective";
  title: string;
  highlights: string[];
};

/** Version actuellement distribuée (doit correspondre à package.json). */
export const CURRENT_VERSION = "1.0.0";

/** Rythme : une version mineure tous les 6 mois, le premier mardi de mai et de novembre. */
export const releases: Release[] = [
  {
    version: "0.0.1",
    date: "2026-10-14",
    released: true,
    kind: "corrective",
    title: "Starter",
    highlights: [
      "Premier socle : commandes, réservations, équipe et stocks",
      "Niveaux d’utilisateurs et droits d’accès",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-11-03",
    released: true,
    kind: "majeure",
    title: "Première version stable",
    highlights: [
      "Plateforme multi-structures avec données cloisonnées en base",
      "Offres Essentiel et Premium",
      "Studio de site, boutique, espace client et sécurité opérationnelle",
    ],
  },
  {
    version: "1.1.0",
    date: "2027-05-04",
    released: false,
    kind: "mineure",
    title: "Mise à jour de printemps 2027",
    highlights: [
      "Améliorations issues des retours des restaurateurs",
      "Mise à niveau des dépendances et du socle technique",
    ],
  },
  {
    version: "1.2.0",
    date: "2027-11-02",
    released: false,
    kind: "mineure",
    title: "Mise à jour d’automne 2027",
    highlights: [
      "Nouvelles fonctionnalités annoncées au printemps",
      "Mise à niveau des dépendances et du socle technique",
    ],
  },
  {
    version: "1.3.0",
    date: "2028-05-02",
    released: false,
    kind: "mineure",
    title: "Mise à jour de printemps 2028",
    highlights: ["Contenu défini six mois avant la sortie"],
  },
  {
    version: "1.4.0",
    date: "2028-11-07",
    released: false,
    kind: "mineure",
    title: "Mise à jour d’automne 2028",
    highlights: ["Contenu défini six mois avant la sortie"],
  },
];

export const current = releases.find((r) => r.version === CURRENT_VERSION)!;

/** Prochaine version planifiée (la première non publiée). */
export const next = releases.find((r) => !r.released) ?? null;

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** Nombre de jours restants avant une date (0 si passée). */
export function daysUntil(iso: string, now = new Date()) {
  const ms = new Date(`${iso}T12:00:00Z`).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}
