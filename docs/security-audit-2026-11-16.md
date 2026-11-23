# Audit de sécurité — 16 novembre 2026

Référence : https://www.crowdstrike.com/en-us/cybersecurity-101/cyberattacks/sql-injection-attack/

## Résumé

- **Build (`next build`)** : ✅ passe (exit 0).
- **Typecheck (`tsc --noEmit`)** : ✅ passe.
- **Layers (`check-layers`)** : ✅ passe.
- **Modules (`check-module-boundaries`)** : ❌ échec — nombreuses violations non autorisées (voir section).
- **npm audit** : 7 vulnérabilités modérées, toutes dans les dépendances de développement (`typescript-eslint` via `minimatch`). Aucune high/critical.
- **Tests unitaires** : 389/390 passaient ; 1 échec corrigé (`tenant-indexes`).
- **SQL injection** : pas de vulnérabilité directe détectée (requêtes paramétrées `$1…`, fonctions RPC `app.*`).
- **RLS / isolation tenant** : faille corrigée — 2 tables 2FA sans RLS (`profile_two_factor`, `auth_two_factor_challenges`).

## Corrections appliquées

1. **Migration `178_two_factor_rls.sql`** : activation de RLS + policies par profil sur les deux tables 2FA.
2. **Mise à jour de `migrate.ts`** : enregistrement de la migration 178.
3. **Refactor des routes `src/app/auth/totp/*`** : utilisation de `authenticated()` pour définir `app.user_id()` (contexte RLS) au lieu de `getDb().query()` direct.
4. Suppression du fichier temporaire `scripts/_q.ts`.

## Points d'attention

### SQL injection
- Toutes les requêtes applicatives utilisent des paramètres positionnels (`$1`, `$2`, …) ou des fonctions RPC `app.*`.
- Quelques interpolations contrôlées : `LIMIT ${f.limit}` (entier borné par zod), savepoint `nested_<uuid>`, `SET LOCAL ROLE` (rôle fixe). Pas d'injection utilisateur.
- Fonctions PL/pgSQL avec `EXECUTE format(... %I ...)` utilisent uniquement des identifiants issus du catalogue système, pas d'entrée utilisateur.
- Recommandation : éviter toute interpolation dans les requêtes même validée ; préférer des paramètres.

### RLS / isolation tenant
- Toutes les tables public ont RLS activé après correction.
- Le test `tenant-indexes` vérifie l'index et le RLS pour chaque table portant `restaurant_id`.
- Les tests d'isolation complets (`test:isolation`) nécessitent une infra Postgres (`MIGRATION_DATABASE_URL`, etc.) non disponible en local démo.

### Dépendances
- `npm audit` : 7 moderate (DoS minimatch, dev only). Lancer `npm audit fix` pour corriger.

### Frontières de modules
- `modules:check` échoue avec de nombreuses violations non autorisées. À corriger ou à mettre à jour la baseline de gouvernance.

### XSS / CSRF
- `dangerouslySetInnerHTML` utilisé uniquement pour JSON-LD échappé (`serializeJsonLd`), QR SVG et scripts statiques.
- Les routes mutantes principales appellent `assertOrigin()`.

### Secrets
- Aucun secret hardcodé détecté dans le code tracké (`release-audit`).
- Historique Git contient des faux positifs (exemples de connexion dans la doc).

## Recommandations prioritaires

1. Corriger ou accepter les violations de frontières de modules.
2. Exécuter `npm audit fix` (dev deps).
3. Valider l'isolation tenant sur une vraie instance Postgres (`npm run test:isolation`).
4. Vérifier que le rôle applicatif n'est ni superuser, ni BYPASSRLS, ni propriétaire (déjà `assertLeastPrivilege`).
5. Désactiver l'affichage des erreurs SQL en production (déjà masquées dans `fail()`).
6. Continuer à utiliser des requêtes paramétrées et des fonctions RPC pour tout nouvel endpoint.