/** Décision de collecte côté navigateur. Sans module serveur : partagé par le site et les tests. */
export type AudienceMode = "consent_required" | "exemption_declared";
export const isAudienceMode = (value: unknown): value is AudienceMode =>
  value === "consent_required" || value === "exemption_declared";
export const consentStorageKey = (restaurant: string) =>
  `atacuisine-cookie-consent:${restaurant}`;
export const audienceExclusionKey = (restaurant: string) =>
  `atacuisine-audience-exclude:${restaurant}`;
export const consentChangedEvent = "donuts:consent-changed";

export function audienceChoice(raw: string | null): boolean | undefined {
  try {
    const value = JSON.parse(raw || "null");
    return value?.version === 1 && typeof value.audience === "boolean"
      ? value.audience
      : undefined;
  } catch {
    return undefined;
  }
}
/**
 * - Consentement requis : rien n’est envoyé sans accord explicite.
 * - Exemption déclarée : envoi sauf opposition du visiteur.
 * Un signal de refus du navigateur ou l’exclusion d’un appareil l’emportent toujours.
 */
export function mayCollect(input: {
  mode: AudienceMode | null;
  choice: boolean | undefined;
  refusalSignal: boolean;
  excluded: boolean;
}) {
  if (!input.mode || input.refusalSignal || input.excluded) return false;
  return input.mode === "consent_required"
    ? input.choice === true
    : input.choice !== false;
}
