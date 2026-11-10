# Outils métier

Vingt add-ons de la boutique, répartis en cinq catégories : Restauration, BTP, Coiffure, Commerce et Tous métiers. Ils s'installent gratuitement, établissement par établissement, et se désinstallent sans perte de données. Le prix se règle dans l'administration de la boutique (`/platform/boutique`), sans toucher au code. Une fois installés, ils sont réunis dans le menu Gestion · Outils métier, avec un onglet par outil.

## Architecture

- **Définitions** (`src/features/trade/definitions.ts`) : nom, métier, fonctionnalités, permission requise, et types de fiches avec leurs champs. Ce fichier est partagé par le serveur, l'interface et les tests.
- **Moteur commun** : une seule table, `trade_records` (migration 077), stocke les fiches de tous les outils dans un objet JSON validé côté serveur (`model.ts`), avec des montants en centimes entiers. La RLS limite les lectures et écritures à l'établissement ouvert et à un outil installé, et le site public n'y a aucun accès. Un quota de 5 000 fiches par outil et par établissement s'applique, et une fiche ne peut jamais changer d'établissement.
- **Indicateurs** (`service.ts`) : calculés côté serveur à partir des fiches et des données existantes (commandes, recettes, carte, clients, boutique en ligne, mesure d'audience). Le client n'envoie jamais de calcul.
- **Interface** (`src/components/trade/trade-center.tsx`) : formulaires générés depuis les définitions, plus quatre vues dédiées : l'écran cuisine, la grille d'allergènes, l'agenda et les devis imprimables. Le simulateur de livraison et l'export CSV des segments complètent l'ensemble.

## Branchements sur l'existant

| Outil | Données réelles utilisées |
| --- | --- |
| Écran cuisine, Cadence du service | Commandes et préparations en cours ; « Lancer » et « Prêt » utilisent l'action cuisine existante |
| Coût des recettes, Lots de produits | Carte, fiches recettes et prix d'achat des ingrédients |
| Allergènes avancés | Écrit `menu_items.allergens`, affiché sur la boutique en ligne |
| Suivi des pertes | Ingrédients et leur coût |
| Paniers abandonnés | Commandes en ligne payées par Stripe restées impayées entre 30 minutes et 30 jours |
| Segments, Campagnes | Clients, commandes en ligne et points de fidélité |
| Parcours de conversion | Pages vues (mesure d'audience), commandes en ligne, réservations |

## Permissions

| Outils | Permission |
| --- | --- |
| Écran cuisine | `kitchen` |
| Coût des recettes, Allergènes, Variantes, Livraison, Lots | `catalog` |
| Cadence, Paniers abandonnés | `orders` |
| Pertes, Stocks salon | `stock` |
| Agenda, Occupation | `reservations` |
| Fiches prestations, Segments, Campagnes | `customers` |
| Devis | `finance` |
| Conversion | `analytics` |
| Planning, Rapport de chantier, Matériel | Tout membre de l'établissement |

Installer ou désinstaller un outil reste réservé au super admin de l'établissement.

## Limites connues

- Les variantes, les zones de livraison et les lots ne s'appliquent pas encore au panier de la boutique publique. Ils servent pour l'instant d'outils de gestion et de calcul.
- Les campagnes de fidélité planifient et mesurent la portée, mais n'envoient pas encore les messages.
- Les paniers abandonnés ne concernent que les paiements en ligne démarrés : un panier jamais validé n'est pas enregistré côté serveur.
- Le rapport de chantier accepte un lien de photo, pas encore un envoi de fichier.
