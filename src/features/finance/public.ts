/**
 * Façade publique du module Finance.
 *
 * Seul point d'entrée contractuel pour les autres modules et les routes.
 * Les détails d'implémentation restent dans les fichiers internes
 * (service, books, dashboard, posting), importables uniquement depuis
 * l'intérieur du module. La contribution de navigation passe par
 * `@/features/finance/navigation`.
 */
export * from "./service";
export * from "./books";
export * from "./dashboard";
export * from "./posting";
export * from "./events";
