/**
 * Préférences d’affichage du tableau de bord (menu de navigation).
 *
 * Présentation uniquement : masquer une entrée ne désactive jamais son module
 * et ne modifie pas l’abonnement ni les add-ons possédés. Une entrée masquée
 * reste accessible par lien direct ; elle disparaît seulement du menu.
 */
export type NavigationPreference = {
  version: 1;
  hidden: string[];
};

export function navigationPreferenceKey(restaurant: string) {
  return `studio-os:navigation:v1:${encodeURIComponent(restaurant)}`;
}

export function hiddenNavigationIds(
  raw: string | null,
  known: ReadonlySet<string> = new Set(),
): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      (value as { version?: unknown }).version !== 1 ||
      !("hidden" in value) ||
      !Array.isArray((value as { hidden?: unknown }).hidden)
    )
      return [];
    const hidden = (value as { hidden: unknown[] }).hidden;
    return [
      ...new Set(
        hidden.filter(
          (id): id is string =>
            typeof id === "string" && (known.size === 0 || known.has(id)),
        ),
      ),
    ];
  } catch {
    return [];
  }
}

export function encodeNavigationPreferences(hidden: readonly string[]) {
  return JSON.stringify({
    version: 1,
    hidden: [...new Set(hidden)],
  } satisfies NavigationPreference);
}

export function isNavigationHidden(hidden: readonly string[], id: string) {
  return hidden.includes(id);
}

export const dashboardPreferenceKey = navigationPreferenceKey;
export const hiddenDashboardModules = hiddenNavigationIds;
export const encodeDashboardPreferences = encodeNavigationPreferences;