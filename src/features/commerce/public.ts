/**
 * Façade publique du module Vente / Commerce.
 *
 * Seul point d'entrée contractuel pour les autres modules et les routes.
 * Les détails d'implémentation restent dans les fichiers internes
 * (service, account, client, engagement, engagement-rules, rewards, schema,
 * engagement-demo), importables uniquement depuis l'intérieur du module.
 * La contribution de navigation passe par `@/features/commerce/navigation`
 * (inexistante aujourd'hui : pas de navigation dédiée).
 */
export * from "./service";
export * from "./account";
export * from "./client";
export * from "./engagement";
export * from "./engagement-rules";
export * from "./rewards";
export * from "./schema";
// engagement-demo est chargé dynamiquement par l'API de démo ; on l'expose
// néanmoins pour garder une surface unique.
export * from "./engagement-demo";
