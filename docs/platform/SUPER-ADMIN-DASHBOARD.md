# Dashboard Super-Admin (`/platform/admin`)

Tableau de bord réservé au compte Super Admin désigné (`mat75.deff@gmail.com`).
Il centralise la supervision de la plateforme : santé des sous-systèmes, cohérence
inter-modules, utilisateurs, établissements, incidents de sécurité et logs.

## Accès

- Route : `/platform/admin` (alias `/admin` redirige vers `/platform/admin`).
- Gatekeeper : `assertSuperAdmin` dans `src/features/admin/service.ts`, basé sur
  `isSuperAdminEmail`.
- Navigation : lien « Super Admin » affiché dans `AccountWorkspace` uniquement si
  `isSuperAdmin` est vrai.

## API

- `GET /api/platform/admin` → `getSuperAdminDashboard(db, user)`.
- `POST /api/platform/admin` → `performSuperAdminAction(db, user, body)`.

Actions supportées :
- `resolveIncident` : acquitte un incident (`ops_security_incidents`).
- `toggleUserStatus` : active/suspend un profil (protège les Super Admins).
- `refreshDiagnostics` : ré-exécute le probe base de données.

## Données affichées

- **Métriques** : utilisateurs (total/actifs/suspendus), établissements, organisations,
  incidents ouverts/critiques, état global.
- **Sous-systèmes** : base de données, auth, Stripe, email, stockage, file d'attente (outbox).
- **Modules & cohérence** : contrôles d'intégrité inter-modules (commandes ↔ établissements,
  membres ↔ profils, établissements ↔ organisations, lignes ↔ carte, paiements ↔ commandes,
  réservations de stock ↔ lots, profils inactifs, échecs sécurité 24h).
- **Utilisateurs** : liste, recherche, suspension/activation.
- **Sites & établissements** : liste, métriques, accès direct.
- **Sécurité & incidents** : incidents non résolus, acquittement.
- **Logs & audit** : flux unifié audit + sécurité, filtres (tout/audit/sécurité/erreurs) et recherche.

## Fichiers clés

- UI : `src/components/platform/admin/dashboard.tsx`
- Service : `src/features/admin/service.ts`
- Route page : `src/app/platform/admin/page.tsx`
- API : `src/app/api/platform/admin/route.ts`
- Styles : `src/components/platform/admin/admin.css`

## Tests

- Unit : `tests/super-admin.test.ts` (reconnaissance email, permissions, scope, gatekeeper).
- Pas encore de test e2e dédié.

## Limites connues

- Pagination côté serveur absente (LIMIT 50).
- `refreshDiagnostics` se limite au probe base de données.
- Pas d'historique de probes ni d'alertes temps réel.
- Gestion des sites/organisations en lecture seule.