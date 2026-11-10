# Add-ons et crédits Studio

## Décisions et état livré

Tarif demandé : 9 € TTC par mois par add-on. Hypothèse affichée : par établissement, partagé par les membres autorisés ; à confirmer avant ouverture commerciale. Depuis l’abonnement unique à 39 €, les droits déjà acquis restent conservés (`addon_legacy_grants`), sans double facturation. Le domaine personnalisé est devenu un add-on (`domain`).

La section « Add-ons » est intégrée au Workspace, accessible avec la permission settings, y compris via `?module=addons`. Elle contient le catalogue initial et une vue « Crédits Studio ». C'est une présentation commerciale en préparation, pas une boutique transactionnelle : aucun bouton ne simule un achat, aucune activation et aucun débit ne sont exécutés. Les cartes « inclus » reflètent les forfaits actuels, pas une validation technique des prestataires.

Les démos isolées, achat Stripe Billing, activation persistante, solde partagé et recharges restent à développer. Le catalogue n'est pas un moteur d'autorisation. L'écran d'accueil habituel du Workspace est conservé.

## Consommation proposée

Séparer abonnement fonctionnel (9 €) et ressources mesurées. Pas de débit pour un déplacement de table ou une consultation ordinaire. Pour les traitements payants, afficher estimation, coût final en euros et crédits, historique et plafond. Ne pas afficher une estimation comme un coût confirmé.

La proposition du propriétaire est coût fournisseur + 10 %. Cela correspond à multiplier le coût par 1,10, pas à une marge de 10 % sur le prix de vente. Cette hypothèse n'est ni implémentée ni déclarée rentable : vérifier frais de paiement, change, traitements échoués, support et infrastructure. Conserver une grille par ressource, versionnée et annoncée avant usage. Ne pas appliquer cette règle aux anciens crédits sans transition explicite.

Préférer « Crédits Studio » à une unité ambiguë : unité de consommation interne, pas promesse d'investissement ou monnaie échangeable. La valeur, les packs, les conditions de remboursement/expiration et le traitement des crédits offerts restent à définir avant vente. L'équivalent en euros devra toujours rester visible.

## Portefeuille à construire

Portefeuille d'organisation, budgets et permissions de consommation par établissement. Journal en ajout seul avec achat, attribution, réservation, consommation, libération et correction. Montants en unités entières suffisamment précises ; arrondi documenté. Réserver un budget avant appel fournisseur pour éviter les dépenses concurrentes au-delà du solde. Déduplication des appels et notifications de paiement. Restituer la réservation inutilisée ; traiter explicitement les résultats incertains.

Achat : montant confirmé, session serveur Stripe, événement signé et vérifié, crédit unique, rapprochement et remboursements encadrés. Ne pas créditer au retour de la page de paiement. Aucun découvert ou rechargement automatique sans accord. Les salariés consomment selon leurs droits, seuls les administrateurs de facturation achètent ou modifient les plafonds.

Les packs Cuisine IA existants restent inchangés. Un transfert vers le nouveau portefeuille devra préserver les soldes et distinguer crédits payés/offerts ; aucun taux de conversion n'est adopté ici.

## Lots suivants

1. Finaliser unité de facturation et catalogue de capacités, préserver inclusions et dépendances.
2. Ajouter tables d'abonnement/activation et provenance des droits, tests d'isolation et de désactivation.
3. Brancher Stripe Billing et achat indépendant, avec suppression des chevauchements lors d'un upgrade.
4. Ajouter portefeuille, estimation, réservations atomiques et compteurs réels.
5. Brancher recharge puis premiers fournisseurs, avec consentement et plafonds.
6. Ajouter les démos sur données fictives séparées, puis généraliser les modules métier.

## Vérification de ce lot

Typage et ESLint sur les fichiers modifiés réussis. Revue React : état local simple, boutons accessibles, clés stables, aucune requête supplémentaire ou effet d'activation. Validation visuelle navigateur non effectuée ; les six écarts navigateur historiques ne sont pas corrigés par cet ajout.
