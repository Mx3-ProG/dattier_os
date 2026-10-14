# Migration future vers Supabase — non exécutée

Ce document décrit une étape future d’ingénierie et de configuration. Il ne suffit pas de fournir une URL Supabase pour déployer cette V0.

1. Après autorisation, créer un projet de préproduction dédié. Ne jamais réutiliser une base existante sans inventaire et sauvegarde.
2. Installer et vérifier la version CLI (`supabase --help`), initialiser un environnement local et créer une migration via `supabase migration new initial_schema`. Reporter le schéma PostgreSQL de `database/migrations/001_core.sql`, sans seed de démonstration en production. Tester une installation vierge et le rollback de l’initialisation.
3. Remplacer `getDb()` par un adaptateur PostgreSQL serveur à pool de connexions. Conserver les transactions et verrous de lots ; traiter les retries de transactions sérialisables. Aucun accès direct du navigateur aux mutations sensibles. Les identifiants textuels du modèle actuel peuvent être conservés ; relier explicitement chaque profil à un UUID Auth.
4. Ajouter Supabase Auth : variables publiques URL/publishable key, cookie SSR validé côté serveur, inscription/invitation sous contrôle. Vérifier l’utilisateur et ses affectations en base sur chaque action. Retirer les routes login/profile/reset de démonstration du produit public.
5. Bootstrap technique hors route publique avec UUID explicite, garde « aucun admin existant », transaction et audit. OWNER et SUPER_ADMIN restent distincts. Ni nom, ni e-mail, ni `user_metadata` modifiable ne doivent autoriser un rôle.
6. RLS : conserver RLS sur toutes les tables exposées ; retirer les grants publics inutiles. Ajouter une relation Auth→profil et des politiques par opération. Un SELECT doit exiger une affectation à l’établissement ; UPDATE nécessite USING et WITH CHECK. Les finances/coordonnées demandent des permissions plus restrictives qu’une simple appartenance. Les tables enfant doivent hériter du périmètre de leur parent via EXISTS. Les sessions techniques ne sont jamais exposées. Ne pas ajouter une politique universelle `true` pour résoudre une erreur.
7. Créer des tests RLS allow/deny pour anon, serveur, chef, propriétaire, utilisateur d’un autre établissement. Tester les insertions avec identifiants croisés. Exécuter advisors et les tests avant publication. La migration actuelle active RLS sans ouvrir les données : elle ne fournit pas encore ces politiques finales.
8. Storage : bucket privé pour les documents fournisseurs avec MIME/taille bornés et URLs signées ; bucket public séparé pour médias validés. Politiques par établissement et uploader autorisé. Aucun document n’est téléversé aujourd’hui.
9. Realtime : publier uniquement les tables nécessaires. Souscrire avec l’identité Auth et les filtres d’établissement, recharger les projections via le serveur. Ne pas publier les sessions ou données financières à tous les rôles.
10. Créer backups, restauration testée, gestion des erreurs, limitation de débit persistante et observabilité. Vérifier le scénario complet sur deux navigateurs, les accès interdits et le rechargement.

Secrets serveur futurs : `DATABASE_URL`, éventuelles clés privilégiées, clé du fournisseur mail, clés VAPID. Ne jamais les préfixer `NEXT_PUBLIC_`. Ne pas inclure de secret dans les journaux ou le dépôt.

Références officielles consultées : https://supabase.com/docs/guides/database/postgres/row-level-security ; https://pglite.dev/docs/ . Les API exactes et réglages devront être revalidés à la réalisation de cette migration.
