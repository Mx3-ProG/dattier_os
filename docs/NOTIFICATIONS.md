# Notifications, historique opérationnel et rubriques

## Rubriques

Toute l’activité est rangée par rubrique, alignée sur les modules de l’espace de travail (`src/features/events/categories.ts`) : Cuisine, Bar, Commandes & encaissements, Plan de salle, Réservations, Stocks & inventaire, Recettes, Fournisseurs, Livraisons, Équipe & planning, Présences, Finances & rapports, Dépenses, Clients & fidélité, La carte, Établissement, Général.

Chaque rubrique fixe :

- sa **visibilité** par défaut : au moins une des permissions de la rubrique (ex. Cuisine = `kitchen` ou `orders`, donc cuisine, salle et direction ; Stocks = `stock` ou `purchases`) ;
- le **module ouvert au clic**, avec un repli si le profil n’a pas accès au module (ex. un serveur qui clique une notification Cuisine arrive dans Commandes).

## Événements (`domain_events`)

`emit()` (`src/features/events/service.ts`) écrit un événement dans la transaction de l’opération : un rollback n’en laisse aucune trace. Champs : type, rubrique (`module`), auteur, objet, résumé lisible, données, permissions de visibilité.

Sources :

- services métier : commande créée (un événement par poste, cuisine et bar), chaque changement d’état d’une ligne, règlement, réception, pertes et inventaires, dépenses, planning, réservation publique ;
- toutes les autres actions du poste de travail via `describeAction()` (`src/features/events/history.ts`) : produits, carte, recettes, codes promo, clients, fidélité, tables, réservations, fournisseurs, commandes fournisseurs, pointages, établissement. Le libellé est calculé **avant** l’action (un produit supprimé garde son nom) et l’événement n’est émis que si l’action réussit.

`audit_logs` reste le journal de sécurité (module « Journal d’audit », permission `audit`), distinct de l’historique.

## Centre de notifications (page « Notifications »)

La cloche ouvre la page. Les notifications des **7 derniers jours** y sont rangées par rubrique, de la plus récente à la plus ancienne, avec : priorité, résumé, auteur (« Par Sarah ») ou « Automatique », date. Filtres : rubrique, non lues seulement. Clic = lue + ouverture du module. Au-delà de 7 jours, elles quittent le centre et restent consultables dans l’Historique.

Règles de diffusion (filtrage serveur, `listNotifications`) :

- permissions de la rubrique, ou destinataires plus restreints : une nouvelle commande ne notifie que le poste qui la prépare (`kitchen` ou `bar`) ;
- destinataire nominatif (planning : l’employé concerné uniquement) ;
- un profil n’est jamais notifié de sa propre action (elle reste dans l’historique) ;
- préférences de sourdine par type, sauf alertes critiques ;
- `read` ne peut marquer que des notifications visibles.

| Type | Rubrique | Priorité | Source |
| --- | --- | --- | --- |
| `order.created` | Cuisine / Bar | normale | commande du personnel, une par poste |
| `order.pending` | Commandes | haute | demande QR / à emporter |
| `order.ready` | Cuisine / Bar | haute | plat ou boisson prêt |
| `order.late` | Cuisine / Bar | haute | calculée : lignes non prêtes après 20 min |
| `menu.unavailable` | La carte | haute | calculée : produit actif sans portion (visible salle, cuisine, bar, carte) |
| `reservation.requested` | Réservations | normale | demande publique |
| `stock.low` / `stock.out` | Stocks | haute / critique | calculées : disponible ≤ seuil / ≤ 0 |
| `stock.expiring` | Stocks | normale | calculée : lot expirant sous 2 jours |
| `stock.inventory_gap` | Stocks | normale | correction d’inventaire avec écart |
| `purchase.received` | Livraisons | normale | réception fournisseur |
| `finance.unusual_expense` | Dépenses | haute | dépense > 3 × moyenne des 90 derniers jours |
| `team.shift` | Équipe & planning | normale | créneau ajouté ou supprimé (employé concerné) |
| `system.info` | Général | normale | messages antérieurs à la migration 3 |

Les alertes calculées (`sweep()`) sont idempotentes (`dedup_key`) et exécutées dans leur propre transaction après chaque action et au plus toutes les 30 s lors du polling. Seuils : `alertSettings` (catalogue).

## Historique (page « Historique »)

`GET /api/v1/history?restaurant=&category=&days=&q=&before=` (`listHistory`). Chaque profil voit les événements des rubriques couvertes par ses permissions effectives, plus ses propres actions (ex. ses pointages). Un serveur voit Cuisine, Bar, Commandes, Plan de salle, Réservations ; la cuisine voit Cuisine, Commandes, Stocks, Recettes ; la comptabilité voit Finances, Dépenses et les encaissements ; propriétaire et super admin voient tout. Les montants encaissés ne sont visibles qu’avec `payments` ou `finance`.

Filtres : rubrique, période (aujourd’hui, 7, 30, 90 jours, tout), recherche dans le résumé et le nom de l’auteur. Regroupement par jour, auteur sur chaque ligne. Pagination « Afficher plus ancien » par curseur exact (date en microsecondes + identifiant), stable même quand plusieurs événements partagent le même instant.

## Préférences

`notification_preferences` : sourdine par profil, établissement et type, depuis le bouton « Préférences » de la page. Les alertes critiques ne peuvent pas être désactivées.

## Permissions effectives

`scope()` renvoie toutes les affectations du profil dans l’établissement (`roles`) et un rôle principal déterministe. `can`, `requirePermission`, `hasRole` et `permissionsOf` travaillent sur l’union des rôles.

## Migrations

`src/lib/database/migrate.ts` applique dans l’ordre chaque migration de sa liste absente de `schema_versions`. `004_activity_categories.sql` reclasse les événements et notifications existants dans les rubriques.
