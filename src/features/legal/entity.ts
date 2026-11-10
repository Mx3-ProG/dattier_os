/* Identité légale de l’éditeur de STUDIO OS, reprise par les pages légales
   (/mentions-legales, /cgu, /confidentialite, /cookies) et le bandeau cookies.
   Source : registre SIRENE / RNE (immatriculation du 18/08/2026). Mettre à jour
   ici, et seulement ici, en cas de transfert de siège, de changement de
   dirigeant ou d’hébergeur. */
import { addonCatalog, addonMonthlyCents, pilotageAddonPrices } from "@/features/addons/catalog";
import { basePlan } from "@/features/platform/pricing";
import { additionalRestaurantPrice, freeThreshold } from "@/features/platform/referrals";

export const legalEntity = {
  product: "STUDIO OS",
  name: "Wayne-web",
  /** Nom commercial sous lequel Wayne-web développe et commercialise STUDIO OS. */
  tradeName: "Studio ATS",
  form: "Société par actions simplifiée (SAS)",
  capital: "50,00 €",
  siren: "108 884 032",
  siret: "108 884 032 00013",
  rcs: "RCS Toulouse 108 884 032",
  vat: "FR49 108884032",
  naf: "62.10Y – Programmation informatique",
  address: "3 allée du Docteur Lejzer Ludwik Zamenhof, 31100 Toulouse, France",
  president: "Thomas Dufeal",
  generalManager: "Mathieu Deffontaines",
  /** Directeur de la publication au sens de l’article 6 de la LCEN. */
  publicationDirector: "Thomas Dufeal, Président",
  website: "https://www.studio-ats.com",
  /** Adresse e-mail de contact et d’exercice des droits RGPD. */
  email: "contact@studio-os.digital" as string | null,
  /** Hébergeur (art. 6, III, 1° LCEN). */
  host: {
    name: "Vercel Inc." as string | null,
    address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis" as string | null,
    contact: "https://vercel.com" as string | null,
    /** Région d’exécution et de stockage des données. */
    location: "France",
  },
} as const;

/** Date d’entrée en vigueur affichée en tête des documents. */
export const legalUpdatedAt = "10 novembre 2026";

const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

/** Chiffres de l’offre, toujours lus dans le catalogue pour rester alignés avec la home. */
export const legalOffer = {
  base: `${basePlan} €`,
  extraEstablishment: `${additionalRestaurantPrice} €`,
  trialDays: 3,
  addon: euros(addonMonthlyCents),
  pilotageAddons: Object.entries(pilotageAddonPrices).map(([id, cents]) => ({
    name: addonCatalog.find((a) => a.id === id)?.name ?? id,
    price: euros(cents),
  })),
  addons: addonCatalog.filter((a) => a.includedFrom === null),
  included: addonCatalog.filter((a) => a.includedFrom !== null),
  referralFree: freeThreshold[39],
};
