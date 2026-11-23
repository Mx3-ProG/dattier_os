/**
 * Façade publique du module Messagerie client.
 *
 * Seul point d'entrée contractuel pour les autres modules et les routes.
 * Les détails d'implémentation restent dans les fichiers internes
 * (service, contact), importables uniquement depuis l'intérieur du module.
 * Pas de contribution de navigation dédiée.
 */
export * from "./service";
export * from "./contact";
