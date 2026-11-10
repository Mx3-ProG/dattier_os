# Lot 6 — Isolation multi-entreprise

Le compteur comptable `fin_counters` possède déjà une ligne par établissement, identifiée par `restaurant_id`. Les établissements appartiennent à une organisation. La migration additive 046 ajoute une politique RLS explicite : le rôle applicatif ne peut accéder qu'au compteur de l'établissement courant, avec le droit financier requis. Ses droits directs sur la table restent absents ; les fonctions comptables existantes conservent leurs opérations internes.

Cette protection évite qu'une future attribution de droits directs rende visibles les compteurs d'autres établissements. Elle ne fusionne pas les comptabilités des établissements d'une même organisation : chacun conserve son journal et sa numérotation. Si un bilan consolidé par organisation est souhaité, il faudra l'ajouter séparément.

Restent à traiter avant de déclarer la plateforme universelle achevée : configuration métier autre que restauration, activation et suspension effectives des modules, achat indépendant des autres add-ons, synchronisation Stripe réelle, prévention de la double facturation lors des changements de forfait, domaines personnalisés de bout en bout, onboarding métier et validation sur l'environnement hébergé. Le lot 7 ne doit pas être présenté comme terminé sur la seule base de cette migration.

Migration préparée localement ; aucun déploiement ni modification de données de production.

Vérification locale : les 19 tests comptables passent, dont un contrôle du compteur entre deux organisations et des droits du rôle applicatif. La vérification TypeScript et le contrôle du diff passent également. Le déploiement de la migration 046 et la vérification sur l'environnement hébergé restent à faire.
