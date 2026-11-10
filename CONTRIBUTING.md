# Contribuer à Studio OS

Le code applicatif est sous AGPL-3.0-only. En proposant une contribution, vous confirmez disposer des droits nécessaires et acceptez sa distribution sous cette licence. Les notices tierces restent applicables.

Installez Node.js 22.13+ et les dépendances avec `npm ci`. Pour le développement local, utilisez exclusivement la démonstration et des données fictives : voir [le guide local](docs/LOCAL_DEMO.md). Ne réinitialisez jamais une base partagée pour lancer un test.

Avant une proposition : `npm run typecheck`, `npm run lint`, `npm test`, `npm run build -- --webpack`. Les changements de droits, transactions ou migrations nécessitent aussi un test sous un rôle PostgreSQL non propriétaire ; voir [la validation plateforme](docs/platform/VALIDATION.md).

Privilégiez les migrations additives, les données historisées, les opérations idempotentes et des changements ciblés. Toute nouvelle table, tâche, URL de média ou entrée de cache doit avoir un périmètre d’organisation/établissement vérifié. Une clé fournie par le navigateur ne constitue jamais une autorisation.

Les tests doivent couvrir un parcours observable et les refus d’accès. Ne présentez pas une intégration simulée comme un prestataire connecté, ni un scénario de charge synthétique comme une capacité commerciale acquise.

N’ajoutez pas de secrets, dumps de production, fichiers clients, captures contenant des données réelles ou médias sans droits. Décrivez les limites de votre changement et fournissez les étapes de vérification dans la proposition.
