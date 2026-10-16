# Pilotage opérationnel — audit et plan (proposition, non implémentée)

Statut : plan validé le 15 octobre 2026 ; le chantier parallèle (rôles personnalisés, comptabilité, audit, taxes) n’a pas commencé. **Étapes 0, 1 et 4 livrées** (socle, notifications rangées par rubrique, historique opérationnel ; voir `NOTIFICATIONS.md`). Écart assumé : les notifications sont créées dans la transaction de l’événement (atomique) plutôt que par un dispatcher après commit ; le dispatcher arrivera avec les automatisations. Version initiale de l’audit : Audit réalisé le 15 octobre 2026 sur `d2a408c` (branche `claude/intelligent-notification-center-503c67`). Tests de référence : `npm test` 15/15, `tsc --noEmit` OK.

## 0. Constat bloquant : le chantier parallèle est introuvable

La mission indique qu’un chantier est en cours sur la comptabilité hybride, les rôles personnalisés, les journaux d’audit, la synchronisation inter-modules et les taxes. **Aucune trace dans le dépôt** : ni sur `main`, ni dans les worktrees (`restaurant-site-audit-00d39d` est propre et au même commit), ni dans les branches distantes, ni dans le stash.

Ce qui existe réellement :

| Sujet du chantier | État dans le code |
| --- | --- |
| Rôles personnalisés | Absents. 9 rôles figés (`src/lib/permissions.ts`), contrainte `CHECK` sur `profiles.role`. |
| Multi-rôle | Schéma prêt (`memberships` PK = profil+établissement+rôle) mais `scope()` (`src/lib/auth/session.ts`) prend `memberships[0].role` **sans ORDER BY** : rôle effectif non déterministe si plusieurs lignes. |
| Journal d’audit | Table `audit_logs` minimale (texte libre, sans module ni données). `perform()` écrit `Action : <nom>` après chaque action. |
| Comptabilité / taxes | Absentes. `expenses` = libellé + montant. Pas de TVA, pas de catégorie, pas de budget. |
| Remboursement, annulation d’une commande encaissée | **N’existent pas.** `pay()` passe la commande à `paid` ; `changeItem()` n’agit que sur les commandes `active`. |

Conséquence : soit ce chantier vit ailleurs (branche non poussée, autre machine), soit il n’a pas commencé. **Le plan ci-dessous est conçu pour s’y brancher par des points d’extension, mais l’ordre exact dépend de cette réponse.**

## 1. Fonctionnalités déjà disponibles

- **Notifications** : table `notifications` (établissement, message, date) + `notification_reads` (lu par profil). Émises par `notify()` (`src/features/orders/service.ts:41`) pour : nouvelle commande, plat/boisson prêt, livraison réceptionnée, planning modifié, demande de réservation publique. Cloche + panneau dans `workspace.tsx`, aperçu dans `overview.tsx`. Action `read` = tout marquer lu.
- **Temps réel** : polling du snapshot complet toutes les 3 s. Aucun SSE/WebSocket.
- **Permissions** : 13 permissions, contrôle serveur systématique via `requirePermission()`, snapshot filtré par permission (coûts masqués, etc.), isolation par `restaurant_id` vérifiée dans chaque requête.
- **Idempotence / concurrence** : clé d’idempotence unique sur `orders`, `SELECT … FOR UPDATE` sur les transitions, index uniques de règlement. Transaction unique par requête POST.
- **Historique** : `stock_movements` (stocks), `loyalty_transactions`, `audit_logs`. Le module « Activité » affiche `audit_logs` comme « Le fil du restaurant » — **l’audit sert aujourd’hui d’historique opérationnel**, c’est précisément la confusion à lever.
- **Vue d’ensemble** : une seule, réservée à la permission `finance` (serveurs, cuisine, stock n’y ont pas accès ; ils atterrissent sur leur premier module).
- **Tests** : `node:test` + PGlite en mémoire (`tests/*.test.ts`), Playwright (`tests/e2e`).

## 2. Fonctionnalités manquantes

| Besoin | Manque |
| --- | --- |
| Notifications | Type, priorité, module/lien, destinataires filtrés par permission (aujourd’hui **diffusion à tout l’établissement** : la cuisine voit tout), lu unitaire, préférences, dédoublonnage, alertes stock faible / péremption / retard. |
| Validation | Inexistante (tables, statuts, politiques, exécution différée). |
| Tableaux de bord | Un seul, gated `finance` ; pas de composition par permissions effectives ; multi-rôle non exploité. |
| Historique opérationnel | Pas de modèle d’événement typé (type, module, lien, données). |
| Automatisations | Inexistantes ; pas de planificateur pour les déclencheurs temporels (retard, péremption). |
| Données manquantes pour certaines règles | Pas d’horodatage de début/fin de préparation sur `order_items` (« commande en retard » impossible à calculer finement) ; pas de seuil de dépense ni de budget ; pas de remboursement. |
| Migrations | `migrate.ts` ne connaît que la version 2 en dur : toute nouvelle migration impose de modifier le runner. |

## 3. Composants à réutiliser

- `getDb`, `rows`, `one`, transactions PGlite (`src/lib/database/db.ts`).
- `actor()` / `scope()` pour l’identité et l’appartenance ; `can()` / `requirePermission()` — **à étendre, pas à dupliquer**.
- `perform()` + `actionSchema` (Zod discriminé) : point d’entrée unique des mutations, idéal pour brancher la validation.
- `notify()` et `log()` : conservés comme façades, réécrits pour s’appuyer sur la nouvelle infrastructure sans changer leurs appels existants.
- `snapshot()` : déjà filtré par permission, sert de base aux widgets.
- UI : `Form`, `Badge`, `Button`, `card`, `timeline`, `notification-panel` (CSS existant), modale Radix, Lucide.
- Patrons de test de `tests/integration.test.ts` et `tests/extensions.test.ts`.

## 4. Architecture recommandée

Principe : **un journal d’événements métier (outbox) commun**, et quatre consommateurs aux règles d’accès distinctes. L’audit de sécurité reste à part.

```
Service métier (transaction)
  ├─ écrit la donnée
  ├─ log()   → audit_logs        (sécurité, inchangé, accès "audit")
  └─ emit()  → domain_events     (même transaction, atomique)
                 │  après commit : dispatcher (idempotent, par event_id)
                 ├─ historique opérationnel (lecture filtrée par permission du module)
                 ├─ règles de notification  → notifications (+ destinataires)
                 └─ automatisations         → automation_runs (+ actions)
```

### 4.1 Modèles (migration additive `003_operations.sql`, aucune colonne supprimée)

- `domain_events(id, restaurant_id, type, module, actor, object_type, object_id, summary, data jsonb, visibility_permission, created_at, processed_at)` — `type` ex. `order.created`, `stock.below_threshold`, `expense.created`, `approval.decided`.
- `notifications` **étendue** : `type`, `priority` (`low|normal|high|critical`), `module`, `link`, `permission` (permission requise pour voir), `recipient` (profil ciblé, nullable), `event_id`, `dedup_key UNIQUE`. Valeurs par défaut pour les lignes existantes (`priority='normal'`, `permission=NULL` = visible par tous, comportement actuel conservé).
- `notification_preferences(profile_id, restaurant_id, type, muted, min_priority)`.
- `approval_policies(id, restaurant_id, operation, threshold jsonb, approver_permission, expires_after, active)`.
- `approval_requests(id, restaurant_id, operation, payload jsonb, summary, requested_by, status pending|approved|rejected|cancelled|expired, decided_by, decided_at, reason, expires_at, executed_at, result jsonb, idempotency_key UNIQUE)` + index unique partiel « une demande en attente par objet/opération ».
- `automation_rules(id, restaurant_id, name, trigger, conditions jsonb, actions jsonb, active, created_by, updated_at)`.
- `automation_runs(id, rule_id, event_id, status success|skipped|failed, error, created_at, UNIQUE(rule_id,event_id))`.
- `order_items.started_at`, `order_items.ready_at` (nullable) pour mesurer les temps de préparation.
- RLS activée sur chaque nouvelle table, comme les précédentes.

### 4.2 Services (`src/features/<module>/service.ts`, convention existante)

- `features/events/service.ts` : `emit(db, r, event)` (dans la transaction), `dispatch(db)` (après commit, verrouille les événements non traités, idempotent), `sweep(db, r)` (déclencheurs temporels : retards, péremptions, demandes expirées ; exécuté au plus une fois par minute lors du polling, avec `dedup_key`).
- `features/notifications/service.ts` : catalogue typé `type → {permission, priority par défaut, module, lien, rendu du message}` ; lecture filtrée **côté serveur** par permissions effectives + destinataire + préférences ; lu unitaire et « tout lu ».
- `features/approvals/service.ts` : `requiresApproval(user, action)`, `submit`, `decide`, `cancel`, `expire`.
- `features/dashboard/widgets.ts` : registre `{id, permissions requises, sélecteur de données}`.
- `features/automations/service.ts` : catalogue fermé de déclencheurs, conditions (comparateurs whitelistés sur champs déclarés), actions (`notify`, `request_approval`, `set_menu_availability` via le service catalogue existant).

### 4.3 Validation : déroulé et garanties

1. `perform()` appelle `requiresApproval()` **avant** le `switch`. Si une politique active s’applique et que l’auteur n’a pas lui-même la permission d’approbation : insertion `approval_requests` (payload = action Zod déjà validée), événement + notification aux approbateurs, retour `{ pending: id }`. Rien n’est exécuté.
2. Décision (`action: "decideApproval"`) dans une transaction : `SELECT … FOR UPDATE`, statut `pending` et non expiré, décideur ≠ demandeur, permission d’approbation vérifiée, appartenance à l’établissement.
3. Si acceptée : **ré-exécution de `perform()` avec le payload stocké, dans la même transaction**, avec un contexte « approuvé » qui court-circuite uniquement le contrôle de validation (les permissions du demandeur sont revérifiées). `executed_at` + `result` écrits, statut `approved`. Échec de l’opération → rollback complet, la demande reste en attente avec l’erreur affichée.
4. Double décision impossible (verrou + transition conditionnelle) ; double soumission bloquée par `idempotency_key`.
5. Décision tracée par `log()` dans `audit_logs` (sécurité) **et** par un événement `approval.decided` (historique).

Opérations couvertes en V1 : dépense au-delà d’un seuil ; correction d’inventaire au-delà d’un écart ; modification des données de l’établissement. Remboursement, annulation encaissée, correction comptable : **points d’extension prévus, branchés quand le chantier comptable les livrera** (ces opérations n’existent pas encore).

### 4.4 Permissions effectives et multi-rôle

- `scope()` doit retourner `roles: Role[]` et `permissions: Set<Permission>` = union des rôles de l’établissement ; `can()` accepte cet ensemble. Nouvelles permissions : `approvals` (décider), `automations` (configurer), `history` (historique opérationnel global), `platform` (supervision super-admin).
- **C’est exactement le périmètre « rôles personnalisés » du chantier parallèle.** Si ce chantier existe : on consomme son API de permissions effectives, on n’en crée pas. S’il n’existe pas : on fait cette évolution minimale (union des rôles fixes), en gardant la signature compatible.

### 4.5 API

Conserver le routeur unique `/api/v1/[...path]` et l’action discriminée :
- `GET /api/v1/notifications?restaurant=&since=` (léger, évite le snapshot complet), `GET /api/v1/history?restaurant=&module=&before=`, `GET /api/v1/approvals?status=`.
- Actions POST : `readNotification`, `readAllNotifications`, `notificationPreferences`, `decideApproval`, `cancelApproval`, `approvalPolicy`, `automationRule`, `toggleAutomation`.
- Temps réel : maintien du polling (3 s) sur l’endpoint léger. SSE possible sur l’instance locale unique ; à ne pas promettre en déploiement multi-instance sans Supabase Realtime (cf. `ARCHITECTURE.md`).

### 4.6 UI (cohérente avec `globals.css`)

- Cloche : compteur non lus, filtres (tous / à traiter / priorité haute), clic → navigation vers le module + objet ; lu unitaire. Page « Notifications » avec historique et préférences.
- Module « À valider » (badge de compteur) : cartes résumées, Accepter / Refuser (motif) en un clic, mobile-first.
- Vue d’ensemble = grille de widgets selon permissions effectives ; plus réservée à `finance`. Widgets : mes tables, commandes prêtes, file cuisine + temps d’attente, produits indisponibles, stocks faibles, péremptions, réceptions, recettes/dépenses, demandes en attente, activité équipe ; super-admin : état des établissements, erreurs d’automatisation, volume d’événements.
- « Activité » séparé en **Historique** (domain_events, filtres module/période) et **Journal d’audit** (audit_logs, permission `audit`).
- Automatisations : liste de règles « SI … ALORS … » à partir de modèles prédéfinis, interrupteur actif/inactif, dernières exécutions et erreurs.

## 5. Plan de développement (étapes indépendantes, une PR chacune)

| # | Étape | Contenu | Dépend de |
| --- | --- | --- | --- |
| 0 | Socle | Runner de migrations générique (liste ordonnée de fichiers, version par fichier) ; `domain_events` + `emit`/`dispatch` ; `scope()` déterministe + permissions effectives (ou adaptateur vers le chantier rôles). | Réponse sur le chantier parallèle |
| 1 | Notifications | Extension de la table, catalogue typé, filtrage serveur, lu unitaire, préférences, `sweep` (stock faible, péremption, retard), UI cloche + page. `notify()` existant conservé en façade. | 0 |
| 2 | Validation | Tables, politiques configurables, branchement dans `perform()`, décision atomique, expiration, UI « À valider ». | 0, 1 |
| 3 | Tableaux de bord | Registre de widgets, vue d’ensemble pour tous les rôles, composition multi-rôle. | 0 (1, 2 pour les widgets d’alertes) |
| 4 | Historique opérationnel | Émission d’événements depuis les services existants, vue chronologique filtrée, séparation de l’audit. | 0 |
| 5 | Automatisations | Règles déclencheur/conditions/actions, 4 modèles de la mission, historique d’exécution, isolation des erreurs (une règle en échec n’annule jamais l’opération métier). | 0, 1, 2 |

Chaque étape : tests unitaires/intégration verts, `typecheck`, `lint`, e2e du parcours touché, mise à jour de `docs/` (`DATABASE.md`, `ROLES_PERMISSIONS.md`, `KNOWN_LIMITATIONS.md`).

Aucune nouvelle dépendance n’est nécessaire (Zod, PGlite, Radix, Lucide, Recharts suffisent).

## 6. Risques de conflit avec les chantiers en cours

| Fichier | Pourquoi c’est un point chaud | Mitigation |
| --- | --- | --- |
| `src/lib/permissions.ts`, `src/lib/auth/session.ts` | Cœur des rôles personnalisés. | Ne rien toucher tant que le statut du chantier rôles n’est pas connu ; sinon modification minimale et rétrocompatible. |
| `database/migrations/*`, `migrate.ts`, `db.ts` | Collision de numéros de migration, runner codé en dur. | Réserver un numéro / convention de nommage ; fusionner le runner générique en premier. |
| `src/lib/actions.ts` (`perform`, `log`) | Switch monolithique modifié par toute fonctionnalité ; `log()` = audit. | Un seul point d’insertion (avant/après le switch) ; ne pas changer la signature de `log()`. |
| `src/features/orders/service.ts` | `notify`/`log`/`pay` ; le chantier compta touchera `pay` (taxes, remboursements). | Ajouter des `emit()` sans réécrire la logique ; ne pas toucher `pay` au-delà d’un événement. |
| Table `expenses`, module Dépenses (`management.tsx`) | Domaine de la comptabilité hybride. | Seuils de validation stockés dans `approval_policies`, pas dans `expenses`. |
| `audit_logs` | Domaine « journaux d’audit ». | Ne pas modifier la table ; historique sur `domain_events`. |
| `src/lib/types.ts`, `snapshot.ts`, `workspace.tsx`, `overview.tsx` | Fichiers partagés par tous les modules. | Ajouts en fin de type/objet ; widgets dans des fichiers nouveaux. |

Risques de régression : changement du rôle effectif (`scope`) sur les profils multi-rôles ; volume du snapshot si on y ajoute trop de données (d’où les endpoints légers) ; notifications existantes devenues invisibles si le filtrage est trop strict (valeur par défaut = visibles par tous).

## 7. Tests nécessaires

- **Isolation** : aucun événement, notification, demande ou règle d’un autre établissement n’est lisible ni modifiable, y compris par identifiant forgé.
- **Permissions** : la cuisine ne reçoit pas les notifications financières ; un serveur ne peut ni décider ni configurer ; contournement par appel API direct refusé (403).
- **Validation** : dépense au-delà du seuil → demande et aucune dépense créée ; acceptation → exactement une dépense ; double acceptation concurrente → une seule exécution ; refus/annulation/expiration → rien exécuté ; demandeur ≠ décideur ; décision tracée dans l’audit.
- **Notifications** : dédoublonnage (`dedup_key`), lu unitaire/global, préférences, `sweep` idempotent sur plusieurs passages.
- **Multi-rôle** : union des permissions et widgets correspondants ; rôle effectif déterministe.
- **Historique** : événement écrit dans la même transaction que l’opération (rollback = pas d’événement) ; filtrage par module.
- **Automatisations** : règle inactive ignorée ; exécution unique par (règle, événement) ; une action en échec est journalisée sans annuler l’opération métier.
- **Migration** : base existante (v2 avec données) migrée vers v3 sans perte, notifications existantes conservées.
- **E2E** : cloche → clic → module ; parcours de validation sur mobile (390 px) et desktop.
