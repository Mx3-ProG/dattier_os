# Boutique et bibliothèque d’add-ons

## Parcours actuel

Add-ons se trouve à la fin de la section Configuration du menu. La page s’ouvre sur Mes add-ons, qui rassemble les fonctionnalités incluses dans le forfait et les abonnements actifs pour l’établissement. La Boutique d’add-ons présente les autres entrées du catalogue avec leur état : achat à venir, test disponible ou paiement en attente. Crédits Studio conserve sa vue séparée, encore sans recharge.

Chaque carte peut afficher une fiche « Découvrir » : fonctions présentes et exemple d’utilisation. Il s’agit d’une présentation explicative, pas d’une démonstration exécutant des actions ni d’un aperçu de données réelles. Ouvrir la fiche ne déclenche pas d’achat, d’activation ou de requête supplémentaire.

Dans Mes add-ons, un bouton ouvre directement la page existante : Salle → plan de salle ; Réservations → réservations ; Fidélité → clients ; Site internet → éditeur du site ; Factures fournisseurs → factures ; Boutique en ligne → commandes. Le dernier bouton sert à consulter les commandes, pas à configurer le paiement en ligne.

## Accès

Le raccourci exige à la fois possession/inclusion et présence de sa destination dans la navigation actuellement autorisée du dashboard. Sans destination autorisée, la carte reste consultable avec un message d’accès indisponible. Le rendu ne déduit jamais une permission du seul fait que l’add-on appartient à l’établissement.

Les contrôles métier et commerciaux serveur sont inchangés. Un achat fraîchement confirmé peut attendre l’actualisation du snapshot pour rendre son raccourci visible. Les restrictions d’aménagement de salle et les permissions propres aux actions continuent de s’appliquer dans les pages ouvertes.

La fiche ne rend pas les autres add-ons achetables. Seul le parcours Factures fournisseurs est raccordé à Stripe en test sous condition de configuration. Les tarifs, abonnements existants et soldes de crédits ne sont pas modifiés. Aucun interrupteur de désactivation n’est ajouté dans cette étape.

## Vérification

Huit tests ciblés réussis : classement, dates d’expiration, absence de doublons, raccourcis refusés sans possession ou destination accessible, identifiants inconnus et parité de navigation. TypeScript et ESLint ciblé exécutés. Compilation et parcours navigateur validés sur une copie locale sans secrets, résultats finaux ci-dessous. Aucun déploiement ni migration.

Revue React : contributions statiques hors composant, état dérivé sans effet supplémentaire, boutons explicites et fiches natives details/summary ; les chargements différés des pages métier restent conservés.

Résultats finaux : huit tests ciblés, TypeScript, ESLint ciblé et compilation de production réussis. Trois parcours navigateur réussis : classement et emplacement du menu, états d’abonnement simulés sur mobile, ouverture effective de Salle et Factures fournisseurs depuis Mes add-ons. Le test vérifie également qu’ouvrir une fiche n’émet aucune requête de souscription. Aucun paiement Stripe réel testé.

## Suivi des abonnements

Les cartes des abonnements actifs indiquent désormais la période payée et l’état du renouvellement. Après un arrêt confirmé, le bouton de résiliation disparaît ; le raccourci d’utilisation demeure jusqu’à l’échéance. Une fonctionnalité également incluse dans le forfait est signalée pour permettre à l’administrateur d’arrêter son abonnement supplémentaire. Ce signalement ne remplace pas la future prévention automatique de la double facturation lors d’un changement de forfait.

Cette évolution requiert la migration additive 045 et la permission dédiée de réconciliation décrite dans `STRIPE-ADDONS-TEST.md`. Elle est vérifiée localement ; Stripe réel reste non configuré.

## Catégories et écrans de chargement

La vue Boutique se filtre par catégorie, prix, disponibilité et statut d’acquisition. Les catégories et les produits sont en base (`addon_categories`, `addon_products`, migration 049) : en ajouter ne demande pas de déploiement. Seul un nouveau *type* d’add-on demande du code, car il lui faut son moteur de rendu. Les six fonctionnalités historiques restent gérées par `addonCatalog` et `addon_subscriptions`, sous la catégorie affichée « Fonctionnalités ».

Dix écrans de chargement sont disponibles : Magic Loader, Kitchen Loader et Studio S gratuits, puis sept écrans en paiement unique (5, 7 ou 9 € HT). Tous partagent le même moteur (`src/components/loading-screens`) ; chaque animation est un fichier CSS/SVG chargé à la demande.

### Par établissement

- Un établissement possède des licences (`addon_licenses`), au plus un écran actif (`loading_screen_settings`, clé primaire sur l’établissement) et ses réglages : couleurs, vitesse, logo, message, activation.
- Tous les membres lisent la configuration de l’établissement sélectionné. Le rôle applicatif ne peut écrire ni licence ni réglage directement : tout passe par des fonctions SQL qui vérifient le droit.
- Acheter est réservé à l’administrateur de l’organisation. Installer, activer et personnaliser exigent la permission « settings » (propriétaire, super administrateur ou administrateur d’organisation).

### Chargement

`TenantLoader` lit l’établissement dans l’URL, puis sa configuration dans le stockage local, sans attendre le réseau. Sans configuration connue, l’écran natif s’affiche : il apparaît en fondu après 120 ms pour éviter un flash si le cache répond. `LoadingScreenSync` actualise le cache et précharge l’animation active pendant les temps morts. Un 401 ou 403 efface le cache de cet établissement, et la déconnexion depuis l’espace de gestion efface tous les caches. L’écran disparaît dès que les données sont prêtes, sans délai artificiel. Avec `prefers-reduced-motion`, chaque animation reste une composition fixe. Les aperçus de la boutique sont téléchargés à l’approche de l’écran et mis en pause hors de la vue.

### Administration de la plateforme

`/platform/boutique` est accessible aux comptes de `platform_admins` (`scripts/platform-admin.ts`). La page gère catégories, descriptions, prix, gratuit ou paiement unique, mise en vente, retrait du catalogue et versions. Elle affiche aussi achats, installations, revenus nets et popularité. Retirer un add-on ne touche jamais aux licences acquises. L’abonnement est prévu dans le modèle (`pricing_mode`, `valid_until`) mais refusé par l’administration et interdit par contrainte pour les écrans de chargement.

### Règles commerciales appliquées

Ces règles sont un choix par défaut, à valider avec vos conditions générales :

| Événement Stripe | Effet sur la licence |
| --- | --- |
| Paiement confirmé | Licence définitive, sans date d’expiration |
| Remboursement partiel | Licence conservée, revenu net réduit |
| Remboursement total | Licence révoquée ; rachat possible |
| Litige ouvert | Licence suspendue ; retour à l’écran natif |
| Litige gagné | Licence rétablie sans nouvel achat |
| Litige perdu | Licence révoquée |
| Second paiement du même add-on | Marqué « doublon » et remboursé automatiquement ; la licence d’origine reste intacte |
