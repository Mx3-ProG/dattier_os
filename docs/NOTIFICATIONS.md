# Notifications, historique opérationnel et rubriques

Porté le 10/11/2026 depuis la branche `claude/intelligent-notification-center-503c67` (commits `69e5edf` et `1ff3aca`) sur le code consolidé : migrations renumérotées 161 et 162, RLS du modèle 060, permissions de `src/lib/permissions.ts`.

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

La cloche de la barre du haut ouvre la page (avec le nombre de non lues) ; « Toutes les notifications » depuis la vue d’ensemble y mène aussi, ainsi que `?module=notifications`. Ce ne sont pas des entrées du menu latéral : elles ne dépendent d’aucun module ni add-on. Les notifications des **7 derniers jours** y sont rangées par rubrique, de la plus récente à la plus ancienne, avec : priorité, résumé, auteur (« Par Sarah ») ou « Automatique », date. Filtres : rubrique, non lues seulement. Clic = lue + ouverture du module. Au-delà de 7 jours, elles quittent le centre et restent consultables dans l’Historique.

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
| `system.info` | Général | normale | messages antérieurs à la migration 161 et `notify()` des autres services (paiements en ligne, sécurité, plan de salle) |

Les alertes calculées (`sweep()`) sont idempotentes (`dedup_key`) et exécutées dans leur propre transaction après chaque action et au plus toutes les 30 s lors du polling. Seuils : `alertSettings` (catalogue).

## Historique (page « Historique »)

Ouverte par le bouton « Historique complet » de la page Notifications (ou `?module=history`).

`GET /api/v1/history?restaurant=&category=&days=&q=&before=` (`listHistory`). Chaque profil voit les événements des rubriques couvertes par ses permissions effectives, plus ses propres actions (ex. ses pointages). Un serveur voit Cuisine, Bar, Commandes, Plan de salle, Réservations ; la cuisine voit Cuisine, Commandes, Stocks, Recettes ; la comptabilité voit Finances, Dépenses et les encaissements ; propriétaire et super admin voient tout. Les montants encaissés ne sont visibles qu’avec `payments` ou `finance`.

Filtres : rubrique, période (aujourd’hui, 7, 30, 90 jours, tout), recherche dans le résumé et le nom de l’auteur. Regroupement par jour, auteur sur chaque ligne. Pagination « Afficher plus ancien » par curseur exact (date en microsecondes + identifiant), stable même quand plusieurs événements partagent le même instant.

## Préférences

`notification_preferences` : sourdine par profil, établissement et type, depuis le bouton « Préférences » de la page. Les alertes critiques ne peuvent pas être désactivées.

## Permissions effectives

Modèle actuel de `src/lib/permissions.ts` et `scope()` (`src/lib/auth/session.ts`) :

- `scope()` renvoie toutes les affectations du profil dans l’établissement (`roles`) et un rôle principal (`role`) : OWNER, puis MANAGER, puis ordre alphabétique. `can`, `requirePermission`, `hasRole` et `permissionsOf` travaillent sur l’union des rôles (`user.roles ?? user.role`).
- SUPER_ADMIN est un rôle d’établissement comme les autres. L’accès plateforme (support) passe par `support_grants` : le support et les administrateurs d’organisation sont vus comme OWNER de l’établissement, donc reçoivent ce que reçoit un propriétaire.
- Formule unique (Studio 39 €) : le centre de notifications et l’historique sont inclus, sans add-on.

## Migrations

`161_operations_notifications.sql` : journal `domain_events`, colonnes de type/priorité/visibilité/dédoublonnage sur `notifications` (lignes existantes conservées, visibles par tous), `notification_preferences`. `162_activity_categories.sql` : index par rubrique et reclassement des notifications existantes dans « Général ». Les deux sont idempotentes (base de démonstration partagée).

Isolation (modèle 060, rôle `atacuisine_app`) :

- `domain_events` : lecture et écriture limitées à l’établissement du contexte (`app.in_restaurant`), en ajout seul (`GRANT SELECT,INSERT`). Le canal public (réservation, commande en ligne) peut déposer un événement mais jamais le relire : la table figure dans `PUBLIC_INSERT_ONLY_TABLES`.
- `notification_preferences` : chaque profil ne lit et n’écrit que les siennes (`profile_id=app.user_id()`), fermée au canal public.
- `notifications.event_id` est gardé par `app.guard_same_tenant` : une notification ne peut pas citer l’événement d’un autre établissement.

En production `npm run db:migrate` est manuel. Tant que la migration 161 n’est pas appliquée, le code déployé garde le comportement d’origine (`eventsReady()`) : liste simple des notifications, « tout marquer comme lu », pas d’historique, d’alertes calculées ni de préférences.
