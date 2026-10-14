# Scénarios

## Service complet

Suivre les sept étapes du README. Après la validation Sarah, les ingrédients sont réservés mais pas encore consommés. Karim consomme uniquement ceux des plats en commençant ; Youssef consomme uniquement ceux des boissons. Le règlement déclaré de deux couscous à 22 € et deux thés à 3,50 € vaut 51 €. Aucune transaction bancaire n’a lieu.

## Commandes successives

Créer une première commande sur une table, puis rouvrir la même table pour ajouter des desserts. Les deux commandes gardent leur identité mais partagent la session. Les servir puis clôturer une fois : une déclaration englobe les lignes non annulées de toute la session. Une nouvelle visite requiert de remettre la table à l’état libre.

## Annulations

Avant Commencer : Sarah annule une ligne, ses réservations sont libérées. Après Commencer : l’annulation ne restaure pas les ingrédients et crée un mouvement de perte sans deuxième déduction. Le mouvement contient les quantités déjà consommées dans son motif. Les lignes servies ne sont pas annulables par cette action ; les remboursements ne sont pas implémentés.

## Approvisionnement et inventaire

Amine → Livraisons → commande de 20 000 g de semoule → réceptionner 15 000 g avec date limite future. Vérifier état partiel et 5 000 g restant. Stocks → lot reçu → Inventaire → compter une nouvelle quantité avec un motif. Un comptage sous la quantité réservée doit échouer.

## Réservations

Créer deux demandes pour le même créneau. Sarah confirme la première sur une table adéquate. La confirmation de la seconde sur cette même table échoue ; choisir une autre table. Les demandes sont provisoires jusqu’à confirmation. Aucun message externe n’est envoyé.

## Séparation des données

Nadia change d’établissement depuis la sidebar. La carte, les commandes, stocks, réservations et graphiques sont propres au restaurant sélectionné. Sarah ne dispose pas de cette affectation ; une requête HTTP forcée vers l’autre établissement est refusée.

## Synchronisation

Utiliser deux contextes de navigateur indépendants pour deux profils simultanés (deux onglets du même navigateur partagent normalement le cookie de profil). Créer une commande depuis Sarah, attendre au plus un cycle de polling chez Karim. Un rechargement ne doit rien perdre.

## Tests

`tests/domain.test.ts` : conversions et permissions. `tests/integration.test.ts` : PostgreSQL réel embarqué en mémoire, transactions et assertions métier. `tests/e2e/journey.spec.ts` : UI de bout en bout sur la base locale, changement de rôle, HTTP interdit, second onglet de réservation et vues mobiles. L’E2E réinitialise la démo avant le parcours.

## Carte, codes promo et renfort salle

Lina ou Nadia → La carte → Ajouter un produit : renseigner nom, prix, catégorie, station et ingrédients par portion. Archiver le masque dans les commandes/site ; Archives permet de le restaurer. Supprimer efface un produit et sa recette uniquement s’il ne figure dans aucune commande.

Clients & fidélité → client consentant → Offrir un code : saisir un code unique, la remise (% entier ou montant en euros), le coût en points et la date limite. Vérifier le nouveau solde et ouvrir la fiche privée. Pour utiliser le code : servir tous les produits, déclarer le règlement, sélectionner le client titulaire et saisir son code. Le montant net est enregistré ; la fiche indique Utilisé. Annuler un code actif inutilisé restitue ses points une fois.

Karim ou Youssef → Nouvelle commande depuis Cuisine/Bar, ou Plan de salle → choisir une table. La commande est attribuée au profil connecté. Ils peuvent servir ou annuler des lignes et remettre une table nettoyée à l’état libre ; les déclarations de règlement restent réservées aux profils habilités.
