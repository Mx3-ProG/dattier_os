# Données

Migration PostgreSQL versionnée : `database/migrations/001_core.sql`. Migration additive `002_catalog_promotions.sql` : archivage des produits, codes nominatifs, client/remise liés aux déclarations. Migration additive `003_operations_notifications.sql` : journal `domain_events`, colonnes de type/priorité/visibilité/dédoublonnage sur `notifications` (lignes existantes conservées, visibles par tous), `notification_preferences`. Migration `004_activity_categories.sql` : `module` des événements et notifications = rubrique d’activité, reclassement des lignes existantes. Versions enregistrées dans `schema_versions`. Seed transactionnel : `src/lib/database/seed.ts`. L’initialisation est automatique et atomique à la première requête.

## Relations

- restaurants → memberships → profiles ; sessions → profiles.
- restaurants → dining_tables → table_sessions → orders → order_items.
- menu_items → recipe_ingredients → ingredients → stock_lots.
- order_items → stock_reservations → stock_lots → stock_movements.
- table_sessions / orders → payment_declarations.
- reservations → tables avec capacité et créneaux contrôlés côté service.
- suppliers → purchase_orders → receipts → stock_lots.
- profiles → shifts / time_entries ; customers → loyalty_transactions.
- notifications → notification_reads ; notifications → domain_events ; notification_preferences par profil/établissement/type ; toutes les actions critiques → audit_logs.

Les prix de vente et règlements sont des entiers en centimes. Les coûts d’achat sont des euros par unité de référence. Le coût matière unitaire est figé sur la ligne commandée. Aucun taux de TVA n’est inventé : les écarts prix/coût sont des estimations, pas des marges HT officielles.

Les stocks utilisent `numeric` et les unités `g`, `ml`, `unit`. Conversion explicite kg→g et l→ml dans le domaine. Une recette utilise l’unité de référence de son ingrédient. Disponible = somme physique moins réservé sur les lots dont la date limite n’est pas passée. Le physique conserve les lots périmés jusqu’à leur déclaration en perte ; les écrans les distinguent.

Contraintes : quantités positives, stock réservé ≤ physique, unicité de session active par table, unicité de déclaration par session/commande, unicité d’idempotence, clés étrangères et index de filtrage. Le service vérifie les appartenances croisées à l’établissement avant mutation. Les changements directs en SQL ne doivent pas contourner ces services.

Le stock historique du seed est consommé et historisé, les ventes viennent des déclarations liées aux commandes. Les horodatages historiques sont fictifs. L’horloge de PostgreSQL gouverne la validité des lots ; dates financières affichées Europe/Paris.

## Réinitialisation et sauvegarde

Paramètres → Réinitialiser, confirmation obligatoire, propriétaire/admin seulement. La route est désactivée hors démo. Elle vide exclusivement la base locale dédiée et recharge le seed dans une transaction ; elle révoque les sessions locales. Aucun connecteur distant n’est appelé.

Pour sauvegarder localement : arrêter le processus serveur, copier le dossier `.data/dattier-demo`, puis redémarrer. Ne pas copier une base ouverte pour une sauvegarde fiable. Un export/restauration SQL interopérable PostgreSQL devra être ajouté avant migration réelle.

Le runner applique dans l’ordre chaque migration de sa liste absente de `schema_versions`, transactionnellement, y compris sur une base ouverte avant la mise à jour. Ajouter une migration = un nouveau fichier + une ligne dans `migrations` (`src/lib/database/migrate.ts`). Ne pas modifier la migration initiale sur une installation contenant des données à conserver.

## Promotions

`promo_codes` relie un code unique par établissement à un client. Montant fixe en centimes ou pourcentage entier, coût en points, expiration, état actif/utilisé/annulé, jeton privé aléatoire de 256 bits. Les jetons ne sont exposés qu’aux profils autorisés à gérer les clients. La lecture publique par jeton ne renvoie ni contact, ni autres avantages, ni solde de points. RLS est activée sur cette nouvelle table. Les points sont débités à l’attribution et restitués une seule fois en cas d’annulation avant utilisation.

Le règlement vérifie établissement, titulaire, date et état, puis consomme le code et écrit le montant net dans la même transaction. `payment_declarations.promo_id` est unique. Une remise de 100 % peut créer une déclaration de montant nul ; elle clôture bien la commande comme réglée.
