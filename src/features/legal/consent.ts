/** Consentement cookies du site STUDIO OS. Sans dépendance serveur : lisible par
 *  tout script de mesure côté navigateur, qui doit appeler `platformConsentAllows`
 *  avant d’envoyer quoi que ce soit et écouter `platformConsentEvent`. */
export type PlatformConsent = {
  version: 1;
  audience: boolean;
  marketing: boolean;
  updatedAt: string;
};
export const platformConsentKey = "studio-os-cookie-consent";
export const platformConsentEvent = "studio:consent-changed";
/** Recommandation CNIL : redemander le choix après 6 mois. */
export const consentMaxAgeMs = 1000 * 60 * 60 * 24 * 182;

export function parsePlatformConsent(raw: string | null, now: number): PlatformConsent | null {
  try {
    const value = JSON.parse(raw || "null");
    if (
      value?.version !== 1 ||
      typeof value.audience !== "boolean" ||
      typeof value.marketing !== "boolean" ||
      typeof value.updatedAt !== "string"
    )
      return null;
    const age = now - Date.parse(value.updatedAt);
    return Number.isFinite(age) && age >= 0 && age < consentMaxAgeMs ? value : null;
  } catch {
    return null;
  }
}

export function readPlatformConsent(now: number): PlatformConsent | null {
  try {
    return parsePlatformConsent(localStorage.getItem(platformConsentKey), now);
  } catch {
    return null;
  }
}

/** Un signal « Global Privacy Control » du navigateur vaut refus. */
export function platformConsentAllows(purpose: "audience" | "marketing", now = Date.now()) {
  if (typeof navigator !== "undefined" && (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl) return false;
  return readPlatformConsent(now)?.[purpose] === true;
}
