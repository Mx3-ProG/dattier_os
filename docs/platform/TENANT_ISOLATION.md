# Isolation des tenants

Deux clients ne doivent jamais voir les données l'un de l'autre. Cette page dit ce qui le garantit, comment le vérifier et quoi faire quand on ajoute une table.

Elle complète [ISOLATION-ETABLISSEMENT.md](studio-os/ISOLATION-ETABLISSEMENT.md), centré sur les modules sécurité, SEO, prestataires et hors ligne.

## Modèle

Une organisation (le client) possède un ou plusieurs établissements (restaurants). Il y a donc deux frontières :

- entre organisations ;
- entre établissements d'une même organisation.

« Espace » n'est qu'un terme d'interface : il ne correspond à aucune table.

## Ce qui protège les données

| Couche | Garantie | Où |
|---|---|---|
| Rôles | Le web et le worker se connectent sans droit de propriétaire, sans superutilisateur et sans `BYPASSRLS`. Ils refusent de démarrer sinon. | `assertLeastPrivilege`, `src/lib/database/db.ts` |
| RLS | Chaque table tenant a sa politique, évaluée avec le contexte posé par transaction. | `database/migrations/` |
| Canal public | Un visiteur anonyme n'atteint que les tables de la liste publique, et seulement pour le restaurant de son contexte. Tout le reste est refusé par une politique `RESTRICTIVE`. | `app.not_public()`, `src/lib/database/public-tables.ts` |
| Liens | Une ligne ne peut pas pointer vers la ligne d'un autre établissement. | `app.guard_same_tenant()`, `app.guard_links()` |
| File de jobs | Le canal public dépose par `app.enqueue_job`, pour son seul restaurant, et ne relit jamais la file. | migration 060 |
| Droits SQL | Les migrations accordent le strict nécessaire. `scripts/migrate.ts` n'accorde plus rien. | migration 060 |
| Stockage | Les clés d'objet sont préfixées par le restaurant et lues depuis une ligne protégée par la RLS. | `src/features/cms/media.ts`, `src/features/site/media.ts` |
| Rate limit | Les compteurs du store sont par restaurant et par adresse IP. Une requête refusée compte aussi. | `src/app/api/store/[restaurant]/[action]/route.ts` |

## Entre établissements d'une organisation

- Le propriétaire de l'organisation accède à tous ses établissements. Quatre tables d'administration lui restent visibles quel que soit l'établissement ouvert : `invitations`, `support_grants`, `addon_subscriptions` et `studio_credit_ledger`.
- Un employé ne voit que les comptes clients connus de son établissement.
- Un simple membre de l'organisation ne voit aucun compte client par défaut.
- L'historique de l'assistant est propre à chaque établissement.
- Le solde de points n'est écrit que par `app.loyalty_delta`.

## Vérifier

Le test crée deux clients, A (établissements A1 et A2) et B (B1), et se connecte avec les vrais logins web et worker. Il faut une base Postgres locale et jetable, créée avec `infra/postgres/init.sh`, puis migrée.

```sh
export MIGRATION_DATABASE_URL=postgresql://atacuisine_migrator:...@127.0.0.1:5432/atacuisine
export ISOLATION_WEB_URL=postgresql://atacuisine_web:...@127.0.0.1:5432/atacuisine
export ISOLATION_WORKER_URL=postgresql://atacuisine_jobs:...@127.0.0.1:5432/atacuisine
export CONFIRM_ISOLATED_DATABASE=true
npm run build
ISOLATION_HTTP=true npm run test:isolation
```

Avec `S3_BUCKET` et les variables S3 d'un stockage de test, il exécute aussi le parcours média complet. Sans `ISOLATION_HTTP`, il s'en tient aux vérifications SQL et worker.

| Section | Ce qui est vérifié |
|---|---|
| Catalogue | RLS, politiques, liste publique identique en base et dans le code, liens gardés, rôles, droits |
| Contrôle positif | Le propriétaire voit bien ses données : un test qui refuse tout échouerait ici |
| Matrice | Pour chaque table tenant et 11 scénarios d'accès : SELECT, UPDATE, DELETE et INSERT sur les lignes de l'autre |
| Régressions | Comptes clients entre établissements, historique IA, solde de points, liens et dépôts de job forgés |
| HTTP | Toutes les routes tenant, ID valides demandés depuis l'autre espace, webhook signé, rate limit, parcours publics |
| Worker groups | Voir [WORKER_GROUPS.md](WORKER_GROUPS.md) |
| Médias | Envoi, lecture, plages d'octets, accès d'un autre client, reprise après plantage |

Le test prouve l'isolation sur les chemins testés, pas l'absence de toute faille. Il ne remplace pas un audit de sécurité indépendant.

## Ajouter une table

1. Créez la table avec RLS et sa politique, puis accordez explicitement ses droits à `atacuisine_app`. `scripts/migrate.ts` ne le fait plus.
2. Ajoutez une politique `public_denied`, sauf si le canal public en a besoin :

   ```sql
   CREATE POLICY public_denied ON ma_table AS RESTRICTIVE USING(app.not_public()) WITH CHECK(app.not_public());
   ```

3. Si le canal public en a besoin, ajoutez-la à `src/lib/database/public-tables.ts` au lieu de créer cette politique.
4. Pour chaque clé étrangère vers une autre table tenant, ajoutez un trigger `tenant_fk_<colonne>` sur `app.guard_same_tenant()`.
5. Lancez `npm run test:isolation`. La nouvelle table est couverte automatiquement, et le test échoue si une étape manque ou si le jeu de données ne sait pas la remplir. Dans ce dernier cas, complétez `overrides` dans `scripts/isolation/seed.ts`.

`INSERT ... ON CONFLICT` est refusé sur une table que le canal public ne peut pas relire : PostgreSQL applique alors la politique de lecture à la nouvelle ligne. Passez par une fonction `SECURITY DEFINER` qui vérifie le tenant, comme `app.enqueue_job`.

## Limites connues

- **Tentatives d'accès non journalisées.** Quand un client tente d'accéder à un autre tenant, l'écriture de l'événement de sécurité est elle-même refusée par la RLS : l'accès est bien bloqué, mais la tentative n'apparaît pas dans le journal du tenant visé.
- **Tables du canal public.** `customers`, `customer_sessions` et les autres tables de la liste publique restent protégées par le code applicatif en plus de leur restaurant de contexte : le canal public y a accès pour le restaurant demandé.
- **Origine partagée.** Les sites publics et le tableau de bord partagent une origine sur le domaine de la plateforme. Une faille XSS sur un site tenant y atteindrait les sessions du personnel. La CSP à nonce réduit ce risque une fois passée en `CSP_MODE=enforce`, sans le supprimer. La séparation complète est prévue dans [SITE_ORIGIN_PLAN.md](SITE_ORIGIN_PLAN.md).
- **`FORCE ROW LEVEL SECURITY`** n'est pas activé : sans effet tant que le migrateur est superutilisateur. Ce compte et les scripts d'exploitation contournent la RLS.
- **Un seul bucket et une seule clé S3.** La séparation repose sur les préfixes et les lignes protégées, pas sur des identifiants distincts.
