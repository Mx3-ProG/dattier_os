/**
 * Façade publique du module Plan de salle.
 *
 * Seul point d'entrée contractuel pour les autres modules et les routes.
 * Les détails d'implémentation restent dans les fichiers internes
 * (service, capabilities, access), importables uniquement depuis l'intérieur
 * du module. La contribution de navigation passe par
 * `@/features/floor/navigation`.
 */
export * from "./service";
export * from "./capabilities";
export * from "./access";
