/**
 * Façade publique du module Facturation plateforme (Studio).
 *
 * Seul point d'entrée contractuel pour les autres modules et les routes.
 * Les détails d'implémentation restent dans les fichiers internes
 * (service, documents, stripe-saas), importables uniquement depuis l'intérieur
 * du module. La contribution de navigation passe par
 * `@/features/billing/navigation`.
 */
export * from "./service";
export * from "./documents";
export * from "./stripe-saas";
