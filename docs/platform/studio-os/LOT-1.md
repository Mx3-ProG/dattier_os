# Lot 1 — Contrats et registre initial

8 novembre 2026. Registre descriptif ajouté, sans branchement dans les contrôles d'accès, la navigation ou la facturation. Les règles actuelles restent seules exécutoires. Ce lot ne corrige pas les six écarts navigateur du lot zéro.

## Contrat commun

`src/core/modules/registry.ts` définit identité stable, version du contrat, portée, capacités, métiers, dépendances obligatoires/facultatives et politique de suspension. Le registre valide identifiants, versions, dépendances inconnues et cycles. Il calcule une proposition de configuration avec dépendances obligatoires, sans activer ni facturer quoi que ce soit. Les lectures retournent des copies indépendantes.

Les dépendances facultatives déclarent une intégration orientée ; ne pas créer de dépendances réciproques pour représenter une collaboration. Le socle identité/établissement/permissions est un prérequis transversal, pas un add-on à acheter.

## Premier produit : Salle

Portée : établissement ; bénéfice partagé par l'équipe selon ses droits. Fonctions : visualisation, zones, placement, rotation, capacité, états, archivage. Les fonctions existantes restent dans `features/floor` ; aucune extraction de leurs transactions dans ce lot.

| Capacité cible | Autorité actuelle conservée |
| --- | --- |
| floor.view | Projections et navigation historiques ; leurs règles ne sont pas remplacées |
| floor.arrange | `requireArrange`, permission `floor`, décision individuelle `floor_layout_access`, privilèges propriétaire |
| floor.status | Actions métier existantes et leurs vérifications |

`table-booking` représente exclusivement la réservation de tables existante et dépend de Salle. Il ne représente pas un calendrier universel. Horaires, disponibilités, affectation et arrivées restent dans `features/reservations` et les actions historiques.

## Suspension à implémenter ultérieurement

- L'arrêt de Salle doit signaler les réservations de tables dépendantes.
- Ne pas supprimer tables, sessions, réservations, historique ou paramètres.
- Prévoir clôture des services engagés et lecture de l'historique avec droits dédiés.
- Distinguer suspension du produit, accès à l'éditeur et masquage personnel.
- L'arrêt d'une intégration facultative ne doit pas retirer le produit principal.

Le registre fournit les dépendants obligatoires à examiner ; il ne vérifie pas les commandes en cours et n'autorise jamais à suspendre directement.

## Frontières des prochains branchements

Chaque module pourra contribuer navigation, guides, indicateurs, événements et outils IA par contrats spécialisés. Ne pas stocker secrets ou exécutants serveur dans les métadonnées partagées. Les règles d'accès effectif combineront abonnement, état du module, configuration, permissions et périmètre serveur. Un prix n'est pas un identifiant de capacité.

Le catalogue commercial et les descriptions/démos de boutique seront distincts du registre technique. Une configuration résolue n'est jamais une commande payante. Les dépendances obligatoires sont incluses ; les options facultatives nécessitent une sélection explicite. L'activation est organisationnelle ou par établissement, pas une licence achetée par chaque salarié.

## Validation et suite

Trois tests couvrent erreurs de graphe, résolution des dépendances sans options ajoutées, dépendants de Salle et protection contre les mutations externes. Aucun test navigateur n'est revendiqué pour ce lot sans changement visuel.

Prochaine étape : moteur de capacités en comparaison avec les règles 39/69/99, puis branchement progressif du registre. Avant de modifier la navigation, corriger/qualifier les écarts navigateur documentés au lot zéro. Ajouter une activation persistante exige une migration additive et des tests d'isolation ; elle n'est pas livrée ici.
