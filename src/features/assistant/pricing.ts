/* Économie de Cuisine IA.

   Principe : le crédit a une valeur catalogue fixe (2 c€). Chaque réponse est
   facturée en crédits selon son coût réel :
   - le moteur réflexe (règles locales, coût fournisseur ≈ 0) coûte 1 crédit ;
   - l’IA générative coûte son coût fournisseur réel × la marge (8 par défaut),
     converti en crédits, avec un minimum.
   Même vendu au pack le plus remisé (1,29 c€ le crédit), 1 € de coût
   fournisseur rapporte donc au moins 8 × 1,29 / 2 ≈ 5,2 €, et jusqu’à 8 € au
   prix catalogue. Les réponses réflexes, quasi gratuites à servir, montent la
   marge moyenne bien au-delà. Voir docs/platform/CUISINE_IA.md. */

export const welcomeCredits = 300;
/** Valeur catalogue d’un crédit, en euros. */
export const creditValueEur = 0.02;
export const reflexCredits = 1;
export const minimumLlmCredits = 2;
/** Plafond par question pour protéger le solde d’une boucle longue. */
export const maximumLlmCredits = 60;
export const lowBalance = 50;

export function markup() {
  const value = Number(process.env.ATACUISINE_AI_MARKUP || 8);
  return Number.isFinite(value) && value >= 3 && value <= 30 ? value : 8;
}

export const packs = [
  {
    id: "service",
    title: "Service",
    credits: 1000,
    priceCents: 1900,
    hint: "≈ 500 questions IA ou 1 000 réflexes",
  },
  {
    id: "brigade",
    title: "Brigade",
    credits: 3000,
    priceCents: 4900,
    hint: "Le plus choisi · −14 %",
    featured: true,
  },
  {
    id: "chef",
    title: "Chef",
    credits: 10000,
    priceCents: 12900,
    hint: "Pour plusieurs établissements · −32 %",
  },
] as const;
export type PackId = (typeof packs)[number]["id"];

/** Tarifs publics en dollars par million de tokens (1 $ compté 1 €, par prudence). */
const modelPrices: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
  },
};

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** Coût fournisseur en euros d’une suite d’appels. Modèle inconnu : tarif Opus. */
export function providerCostEur(model: string, usages: TokenUsage[]) {
  const price = modelPrices[model] ?? modelPrices["claude-opus-5-5"];
  return usages.reduce(
    (sum, u) =>
      sum +
      (u.input_tokens * price.input +
        u.output_tokens * price.output +
        (u.cache_read_input_tokens ?? 0) * price.cacheRead +
        (u.cache_creation_input_tokens ?? 0) * price.cacheWrite) /
        1_000_000,
    0,
  );
}

/** Crédits facturés pour un coût fournisseur donné. */
export function llmCredits(costEur: number, factor = markup()) {
  const raw = Math.ceil((costEur * factor) / creditValueEur);
  return Math.min(maximumLlmCredits, Math.max(minimumLlmCredits, raw));
}

export const eur = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
