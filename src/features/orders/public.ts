/**
 * Façade publique du module Commandes.
 *
 * Seul point d'entrée contractuel pour les autres modules et les routes. Tout
 * import externe de `@/features/orders/...` doit passer par ici (ou par
 * `@/features/orders/navigation` pour les contributions de navigation).
 *
 * Les détails d'implémentation restent dans `service.ts`, qui n'est importable
 * que depuis l'intérieur du module.
 */
export * from "./service";
