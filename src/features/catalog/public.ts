/**
 * Façade publique du module Carte et catalogue.
 *
 * Seul point d'entrée contractuel pour les autres modules et les routes.
 * Les détails d'implémentation restent dans `service.ts`, importable uniquement
 * depuis l'intérieur du module. La contribution de navigation passe par
 * `@/features/catalog/navigation`.
 */
export * from "./service";
