/**
 * Vocabulaire du locataire. Le « commerce » (business) est l'unité isolée par la RLS :
 * un restaurant n'est qu'un type de commerce parmi d'autres.
 *
 * Renommage progressif (docs/platform/CORE-ET-MODULES.md, section « Renommage ») :
 * le code nouveau parle de `business`. Les noms historiques restent valides tant que
 * leur migration n'est pas faite : table `restaurants`, colonne `restaurant_id`,
 * réglage SQL `app.restaurant_id`, routes `/restaurant/[restaurant]` et `/r/[restaurant]`.
 * Ces noms historiques désignent tous un commerce, quel que soit son secteur.
 */

/** Secteurs d'activité proposés à la création d'un commerce (`restaurants.industry`). */
export const industries = [
  "restaurant",
  "beauty",
  "retail",
  "construction",
  "services",
  "other",
] as const;
export type Industry = (typeof industries)[number];
/** Un secteur reçu d'une URL : seuls les secteurs déclarés sont acceptés. */
export const isIndustry = (value: unknown): value is Industry =>
  typeof value === "string" && (industries as readonly string[]).includes(value);

/**
 * Identifiant d'un commerce. Même valeur que `restaurants.id` / `restaurant_id` :
 * le type ne change que le nom, jamais le format ni le périmètre d'isolation.
 */
export type BusinessId = string;

/** Format accepté pour un identifiant de commerce reçu d'une URL ou d'un en-tête. */
export const businessIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
export const isBusinessId = (value: unknown): value is BusinessId =>
  typeof value === "string" && businessIdPattern.test(value);
