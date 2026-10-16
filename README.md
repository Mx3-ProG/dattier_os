# DATTIER OS — V0 locale

Un poste de travail partagé pour Le Dattier Hefsi : salle, cuisine, bar, stocks et direction, avec site public connecté. Toutes les identités, recettes, prix et opérations sont fictifs. Aucune réservation réelle, aucun paiement ni message externe n’est envoyé.

## Démarrer

Prérequis : Node.js 22.13+ (testé avec Node 26), npm. Aucun Docker, compte Supabase ou abonnement requis.

```sh
npm ci
cp .env.example .env.local # seulement si .env.local n’existe pas déjà
npm run dev
```

Ouvrir http://127.0.0.1:3000/demo (ou le port affiché par Next.js). Le site est sur `/`, le poste de travail sur `/dashboard`. L’application écoute uniquement en boucle locale par défaut.

La première requête initialise le schéma PostgreSQL et le seed, dans une transaction. Les données sont conservées côté serveur dans `.data/dattier-demo`, indépendamment du navigateur. Un seul processus serveur doit ouvrir ce répertoire. Ne pas lancer simultanément `next dev` et `next start` sur la même base.

Variables : `DATTIER_DEMO=true` est indispensable ; `DATTIER_DATA_DIR` sélectionne un répertoire explicitement nommé `demo`. Sur Vercel, le mode local est bloqué même si la variable est activée. Aucun secret distant n’est requis.

## Profils de démonstration

| Profil fictif | Rôle |
| --- | --- |
| Slimane | SUPER_ADMIN, administration technique de la démo |
| Nadia | OWNER, pilotage et configuration |
| Lina | MANAGER, supervision opérationnelle |
| Sarah | WAITER, salle et réservations |
| Karim | CHEF, cuisine et stocks |
| Youssef | BARTENDER, bar et stocks |
| Amine | STOCK_MANAGER, stocks et approvisionnements |
| Inès | PURCHASING, fournisseurs et livraisons |
| Leïla | ACCOUNTANT, finances et dépenses |

Slimane est le super administrateur. Son adresse e-mail reste à fournir : elle sera rattachée lors de la mise en place de l’authentification de production (la table `profiles` ne contient pas encore de colonne e-mail).

Le changement de profil via `/demo` conserve toutes les opérations. Nadia et Slimane accèdent aux deux établissements initiaux ; les autres profils sont affectés à Bernay. Les sessions utilisent un cookie HttpOnly, SameSite strict, avec jeton opaque haché en base et expiration de 12 heures. Cette sélection de personnages est uniquement une authentification de démonstration.

## Parcours principal

1. Sarah : Plan de salle → table 08 → ajouter deux Couscous royaux → Boissons → deux Thés à la menthe → envoyer.
2. Karim : ticket Table 8 → Commencer → Marquer prêt.
3. Youssef : ticket Table 8 → Commencer → Marquer prêt.
4. Sarah : servir chaque ligne → clôturer → confirmer le règlement déclaré. La table passe « À nettoyer », puis peut être marquée libre.
5. Amine : stocks et mouvements ; 400 g de semoule, 300 g de poulet, 4 merguez, 200 g de pois chiches, 200 g de carottes, 8 g de thé, 16 g de menthe et 20 g de sucre ont été consommés pour cette commande.
6. Nadia : indicateurs, commande réglée, journal d’activité.
7. Site public `/reservations` : choisir le nombre de convives, un jour sur le calendrier, une heure, puis une table libre sur le plan de salle ; retrouver la demande dans Réservations côté équipe. Plan de salle → « Aménager la salle » modifie les tables vues par les clients.

Le seed contient déjà des tickets aux tables 2 et 4. La table 8 est libre après réinitialisation. Les commandes historiques et leur stock consommé sont enregistrés dans la même base.

## Fonctions implémentées

- 9 profils, permissions serveur, filtrage des données financières et périmètre par établissement.
- Carte initiale de 38 produits par établissement : création avec recette, modification, archivage/restauration et suppression des produits jamais commandés (propriétaire, manager, admin). Prix figés dans les commandes.
- Sessions de table regroupant plusieurs commandes en une déclaration de règlement. Cuisine et bar accèdent aussi au plan de salle et peuvent prendre/servir/annuler des commandes sous leur identité ; les droits de règlement restent réservés aux profils habilités.
- Réservation de lots par date limite, consommation au début de préparation, libération avant préparation et pertes après consommation.
- Transactions, idempotence de création, états de préparation cuisine/bar indépendants, polling à 3 secondes.
- Réservations publiques, confirmation/affectation de table, contrôle de capacité et de chevauchement.
- Stocks, lots expirés exclus, corrections d’inventaire par lot et pertes motivées, historique.
- Fournisseurs, commandes d’un ingrédient, réceptions partielles créant des lots et mouvements.
- Planning simple avec détection de chevauchement, pointages contrôlés.
- Fiches clients, consentement fidélité, mouvements de points historisés. Codes promo nominatifs en % ou montant fixe, échange de points, expiration, usage unique au règlement et fiche privée partageable. Annulation d’un code inutilisé avec restitution des points.
- Règlements déclarés, dépenses, historique des ventes et export CSV.
- Notifications internes avec lecture individuelle, journal d’audit serveur.
- Site responsive : accueil illustré, carte partagée, réservation, demandes à emporter/QR, contact et pages d’information honnêtes.

## Vérifier

```sh
npm run typecheck
npm run lint
npm test
npm run build
# Serveur local démarré et Chromium installé :
npx playwright install chromium
npm run test:e2e
```

**Le test E2E réinitialise les données locales de démonstration.** Ne le lancer que sur cette démo. Il teste les profils via l’interface, le service complet, le rechargement, une réservation depuis un second onglet, les permissions HTTP et le responsive 390 px. Captures dans `docs/` ; traces d’échec dans `test-results/`.

Pour essayer le build : arrêter le serveur de développement puis `npm run start`. Le fichier `.env.local` doit rester présent. Ne pas déployer cette version telle quelle.

## Documentation et limites

- [Architecture](docs/ARCHITECTURE.md)
- [Base de données](docs/DATABASE.md)
- [Permissions](docs/ROLES_PERMISSIONS.md)
- [Scénarios](docs/DEMO_SCENARIOS.md)
- [Limites exactes](docs/KNOWN_LIMITATIONS.md)
- [Migration Supabase future](docs/SUPABASE_DEPLOYMENT.md)
- [Déploiement Vercel futur](docs/VERCEL_DEPLOYMENT.md)

Aucune infrastructure distante n’a été créée ou modifiée. Il s’agit d’une V0 locale opérationnelle, pas d’un logiciel de caisse certifié ni d’une application prête pour des données clients réelles.

## Évolution carte, fidélité et renfort salle

La migration additive `002_catalog_promotions.sql` est appliquée automatiquement aux bases locales existantes, sans seed ni réinitialisation. Le manager dispose de la permission `catalog`, séparée des paramètres techniques. Un produit archivé disparaît du site, de la prise de commande et de la liste de recettes actives, tout en conservant les commandes en cours et leur historique. Les produits déjà commandés ne sont pas supprimables.

Dans Clients & fidélité, créer un code pour un client consentant, définir sa remise, son coût en points (0 pour un cadeau) et sa validité. Partager la fiche privée depuis le code. Au règlement, sélectionner son titulaire et saisir le code : la remise est appliquée à toute l’addition de table et son montant net alimente le CA déclaré. Un seul code par addition, pas de reliquat. La fiche privée n’est pas un compte client authentifié et aucun e-mail/SMS n’est envoyé.

Pour des tests navigateur sans modifier la démo ouverte : compiler, lancer une seconde instance `DATTIER_DATA_DIR=.data/acceptance-demo DATTIER_DEMO=true npm run start -- --port 3100`, puis `E2E_URL=http://127.0.0.1:3100 npm run test:e2e`. Ne pas lancer plusieurs processus sur le même dossier de base.
