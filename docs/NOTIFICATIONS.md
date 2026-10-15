# Événements métier et centre de notifications

## Événements (`domain_events`)

`emit()` (`src/features/events/service.ts`) écrit un événement typé dans la transaction de l’opération : un rollback n’en laisse aucune trace. Champs : type, module, auteur, objet, résumé, données JSON, permissions de visibilité. C’est le socle de l’historique opérationnel et des automatisations à venir (`processed_at` est réservé au futur dispatcher). `audit_logs` reste le journal de sécurité, alimenté par `log()` comme avant.

Si le type figure dans le catalogue de notifications, `emit()` crée aussi la notification correspondante. Les événements hors catalogue (ex. `expense.created`) sont seulement historisés.

## Catalogue

`src/features/notifications/catalog.ts` définit pour chaque type : libellé, groupe, permissions requises (au moins une ; `null` = tout l’établissement), priorité par défaut, module ouvert au clic.

| Type | Visible avec | Priorité | Source |
| --- | --- | --- | --- |
| `order.created` | orders, kitchen, bar | normale | création de commande personnel |
| `order.pending` | orders | haute | demande QR / à emporter |
| `order.ready` | orders | haute | plat ou boisson prêt |
| `order.late` | orders, kitchen, bar | haute | calculée : commande active non prête après 20 min |
| `menu.unavailable` | orders, kitchen, bar, catalog | haute | calculée : produit actif sans portion disponible |
| `reservation.requested` | reservations | normale | demande publique |
| `stock.low` / `stock.out` | stock, purchases | haute / critique | calculées : disponible ≤ seuil / ≤ 0 |
| `stock.expiring` | stock | normale | calculée : lot disponible expirant sous 2 jours |
| `stock.inventory_gap` | stock | normale | correction d’inventaire modifiant la quantité |
| `purchase.received` | stock, purchases | normale | réception fournisseur |
| `finance.unusual_expense` | finance | haute | dépense > 3 × moyenne des 90 derniers jours (≥ 3 dépenses) |
| `team.shift` | employé concerné uniquement | normale | créneau ajouté ou supprimé |
| `system.info` | tous | normale | messages existants avant la migration 3 |

Les seuils sont dans `alertSettings` (catalogue). Les montants n’apparaissent que dans des notifications réservées à la permission `finance`.

## Alertes calculées

`sweep()` détecte les situations d’état (stocks, péremptions, retards, indisponibilités). Il est idempotent grâce à `dedup_key` (unique par établissement) : une alerte par ingrédient et par jour, par lot, par commande, par produit et par jour. `runSweep()` l’exécute dans sa propre transaction après chaque action (une erreur d’alerte n’annule jamais l’opération) et au plus toutes les 30 s lors du polling, uniquement pour un établissement auquel l’utilisateur appartient.

## Lecture et sécurité

Le filtrage est fait côté serveur (`listNotifications`) : établissement, destinataire, recoupement avec les permissions effectives, préférences. `read` (avec ou sans `id`) ne peut marquer que des notifications visibles ; un identifiant forgé est ignoré.

## Préférences

`notification_preferences` : sourdine par profil, établissement et type. Les types de priorité critique ne peuvent pas être désactivés (refus serveur) et une notification critique s’affiche toujours.

## Interface

Cloche avec compteur de non lues, onglets Toutes / Non lues / Préférences, étiquette de priorité, clic = lu + ouverture du module si le profil y a accès, « Tout marquer comme lu ». Temps réel : polling existant de 3 s.

## Permissions effectives

`scope()` renvoie désormais `roles` (toutes les affectations de l’établissement) et un rôle principal déterministe (`primaryRole`, ordre de `roles`). `can`, `requirePermission`, `hasRole` et `permissionsOf` travaillent sur l’union des rôles. Les appels existants passant un rôle seul restent valides.

## Migrations

`src/lib/database/migrate.ts` applique dans l’ordre toute migration listée dans `migrations` et absente de `schema_versions`. Ajouter une migration = ajouter un fichier et une ligne dans cette liste.
