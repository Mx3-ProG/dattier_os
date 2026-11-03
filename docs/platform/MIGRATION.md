# Migration et import

Les migrations 001–003 Dattier restent en place. Les migrations 004 et suivantes reprennent les schémas commerce Donuts et ajoutent la plateforme. Aucun script de seed ou de nettoyage des établissements Donuts n’a été repris. Les numéros de migration du projet Donuts ne sont pas utilisés comme preuve de compatibilité.

Sur une ancienne démonstration Dattier, les migrations sont appliquées à l’ouverture, sans réinitialiser les commandes, lots, recettes ou réservations. Les établissements historiques sont rattachés à une organisation `legacy`. Leur boutique est initialement fermée. Les nouveaux établissements reçoivent une configuration vide, sans produits, clients ou stocks fictifs.

## PostgreSQL neuf

`npm run db:migrate` nécessite `MIGRATION_DATABASE_URL`. Il crée les tables sous le propriétaire de migration, applique les versions manquantes sous verrou de migration et accorde au rôle applicatif uniquement l’usage nécessaire. Il ne crée aucune identité ni restaurant de démonstration.

## Ancien snapshot PGlite

1. Arrêter le processus source et réaliser une copie froide complète du répertoire. Ne pas copier une base en cours d’écriture.
2. Conserver cette sauvegarde intacte. Préparer une base PostgreSQL neuve et migrée.
3. Se connecter avec le futur propriétaire via OIDC, sans créer de restaurant ; relever son identifiant.
4. Exécuter `scripts/import-snapshot.ts` avec `IMPORT_SNAPSHOT_DIR`, `MIGRATION_DATABASE_URL`, `IMPORT_OWNER_ID` et `CONFIRM_COLD_SNAPSHOT=true`.

Le script travaille sur une seconde copie temporaire du snapshot et refuse une cible contenant déjà des restaurants. Il importe les tables métier connues, conserve leurs identifiants et ajuste la séquence des commandes boutique. Les profils historiques sont suspendus ; sessions et mots de passe ne sont pas réutilisés. Le propriétaire OIDC reçoit les droits sur les établissements importés.

Les contenus CMS, archives de sécurité, médias et tables non converties restent dans le snapshot source. Leur reprise exige une conversion contrôlée ; ils ne sont pas supprimés. Le rapport d’import énumère les exclusions. N’importez pas des données de démonstration comme de vraies ventes.

Avant bascule : comparer les comptes par table, les commandes et montants, les quantités physiques/réservées, les réservations futures et les droits. Rejouer un service complet et vérifier le rechargement. Le script ne constitue pas une migration en ligne ni une synchronisation bidirectionnelle.
