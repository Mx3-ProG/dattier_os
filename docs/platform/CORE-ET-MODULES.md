# Core, modules et robustesse du monolithe

État au 10 novembre 2026, branche `codex/atacuisine-consolidation`. Ce document propose un découpage Core / Modules, établit un diagnostic (cache, files de tâches, indexation, IA, absence d'état local) et fixe un plan par lots. Les constats chiffrés viennent du code et d'une base PGlite vierge sur laquelle les migrations 001 à 080 ont été appliquées.

Aucun gros changement n'est engagé ici. Ce lot livre seulement trois éléments : la migration d'index 081, le vocabulaire « commerce » dans `src/core/tenant` et les tests de garde associés (voir [§ 10](#10-ce-lot)).

---

## 1. Principes de découpage

**Core.** C'est ce sans quoi aucun commerce ne peut exister ni être facturé, quel que soit son secteur. Le core démarre, isole et facture un commerce sans aucun module activé.

**Module.** Un module :
- s'active par commerce ;
- dépend du core par des contrats (registre, droits, jobs, stockage), jamais l'inverse ;
- se suspend sans perte de données (`lifecycle.preservesData`, déjà exigé par `src/core/modules/registry.ts`).

**Noyau partagé.** Quelques données métier sont utilisées par au moins quatre modules : fiche client, articles et prestations. Elles restent dans le core sous une forme minimale et neutre. Leurs usages avancés (fidélité, allergènes, recettes) vivent dans des modules.

Règle de dépendance à vérifier par lint dans un lot ultérieur : `src/core/**` n'importe jamais `src/features/**`.

## 2. Proposition Core vs Modules

### 2.1 Core (toujours présent)

| Domaine | Contenu actuel | Remarque |
|---|---|---|
| Identité | OIDC, sessions opaques, `profiles`, `sessions` (`src/lib/auth`) | Déjà indépendant du secteur |
| Locataires | `organizations`, `restaurants` (= commerces), `memberships`, `organization_memberships`, invitations, accès support | À renommer progressivement (§ 8) |
| Droits | RBAC `src/lib/permissions.ts`, RLS, `app.*` SECURITY DEFINER | 148/148 tables sous RLS |
| Facturation plateforme | Abonnement Studio (39 €), essai de 3 jours, boutique d'add-ons, licences, installations, crédits Studio | Le paiement et le droit sont du core ; le contenu vendu appartient aux modules |
| Runtime des modules | `src/core/modules/*`, `module_settings`, navigation composée (`src/core/navigation`) | Couvre aujourd'hui 2 modules sur ~25, voir § 2.3 |
| Socle technique | Contexte transactionnel RLS, outbox `outbox_jobs` + worker par groupes, stockage S3, limitation de débit en base, journal d'audit et de sécurité de base, notifications, santé | |
| Paramètres | Profil, apparence, accessibilité, tutoriel « Bien démarrer » | |
| Hébergement public | Résolution de domaine (`proxy.ts`), robots/sitemap plateforme | Le domaine personnalisé reste un add-on |
| Noyau partagé | Fiche client minimale (`customers`) et catalogue d'articles (`menu_items`, à généraliser en « articles ») | Neutre vis-à-vis du secteur |

Le parrainage (`referrals`) relève de la croissance de la plateforme. Il appartient au core plateforme, pas à un module de commerce.

### 2.2 Modules (optionnels, activables, facturables)

| Famille | Modules (identifiants existants) | Secteurs | Droit actuel |
|---|---|---|---|
| Restauration | `floor`, `table-booking`, commandes en salle, cuisine, bar, recettes, stocks et lots FEFO, outils métier `kitchen-display`, `recipe-cost`, `menu-allergens`, `service-pacing` | restaurant | `app.module_enabled` (salle, réservations), seuil `plan >= 39`, `trade_tools` |
| Vente | `online-orders` (boutique, panier, créneaux), paiements en ligne, codes promo, `qr` | tous | `app.addon_entitled`, `plan >= 39`, `paid_addon_entitled` |
| Site et visibilité | `website` (CMS, modèles), `domain`, add-ons de site, écrans de chargement, `estimation-studio`, analytics | tous | `addon_installed`, `analytics_licensed` |
| Relation client | `loyalty`, messages clients (email/SMS), segments, campagnes | tous | add-on payant |
| Finance | finance de base, `client-invoices`, `invoices` (fournisseurs), banque, FEC | tous | `app.fin_access`, `app.has_addon` |
| RH | `attendance`, planning, `payroll` | tous | `app.hr_access`, add-on |
| Exploitation | hors ligne, `offline-conflicts`, `connections` (intégrations), centre de sécurité complet | tous | add-on |
| IA (§ 5) | `ai-assistant` (moteur réflexe + IA générative), `ai-invoice-extraction`, observations SEO IA | tous | crédits IA, sans droit de module |
| Outils métier | `trade_tools` par secteur (BTP, coiffure, commerce…) | par secteur | installations gratuites ou payantes |

### 2.3 Constat : sept mécanismes de droits en parallèle

Pour savoir si un commerce peut utiliser une fonction, le code interroge aujourd'hui, selon le cas :

1. un seuil d'abonnement en dur : `plan >= 39` ou `plan < 39`, 19 occurrences en TypeScript et 19 en SQL ;
2. `addonCatalog.includedFrom` (`src/features/addons/catalog.ts`, 13 entrées) ;
3. le catalogue de la boutique (`addon_products`, licences, installations) ;
4. `addon_legacy_grants` et `app.paid_addon_entitled` (migrations 073 et 074) ;
5. `app.module_enabled`, limité à `floor` et `table-booking` ;
6. des fonctions dédiées : `app.has_addon`, `app.analytics_licensed`, `app.fin_access`, `app.hr_access` ;
7. les installations d'outils métier (077).

Le registre `src/core/modules/catalog.ts` ne décrit que 2 modules, alors que la navigation et la boutique en connaissent une vingtaine. **C'est la dette principale.** Elle empêche d'affirmer qu'un commerce sans module fonctionne, et chaque nouveau module ajoute un mécanisme.

**Cible.** Chaque module a un manifeste unique (`src/modules/<id>/manifest.ts` ou une entrée du registre). Ce manifeste porte l'identifiant, les dépendances, les secteurs, les capacités, la navigation, la correspondance commerciale (incluse dans Studio, add-on payant, crédits) et ses points d'entrée serveur. Une seule fonction SQL décide de l'accès : `app.module_available(business, module)`. Elle remplace progressivement les mécanismes 1 à 7, sous forme d'adaptateurs.

## 3. Cache

### Constat

- **Aucun cache applicatif.** Pas de `use cache`, ni d'`unstable_cache`, ni de `cacheTag`. 26 routes sont en `force-dynamic`, dont la page publique des sites CMS (`src/app/r/[restaurant]/[[...page]]/page.tsx`).
- **Coût d'une page publique.** Chaque affichage ouvre une transaction et enchaîne une dizaine de requêtes : plan, add-ons, configuration publiée, estimation, faits SEO, catalogue, add-ons de site, contexte, analytics. `React.cache` évite seulement le doublon entre `generateMetadata` et la page.
- **Proxy.** `proxy.ts` interroge la base à chaque requête d'un domaine personnalisé, y compris pour les assets non exclus par le matcher : `app.resolve_domain` + `app.primary_domain`.
- **Cache HTTP partiel.** `robots.txt`, `sitemap.xml` et `llms.txt` ont `s-maxage=300`. Les médias publiés ont `max-age=3600`, servis par l'application, sans CDN.
- **Invalidation.** Seul `revalidatePath('/r/{id}', 'layout')` est appelé à la publication CMS. Il n'a aucun effet tant que les pages sont dynamiques.
- **Points sains.** Les réponses privées sont en `private, no-store` et le service worker est en `no-cache`.

### Stratégie proposée

| Niveau | Quoi | Clé / étiquette | Invalidation |
|---|---|---|---|
| CDN / HTTP | Médias publiés immuables (clé contenant un UUID) | URL | Aucune : `public, max-age=31536000, immutable` |
| CDN / HTTP | robots, sitemap, llms | Host | TTL 300 s (existant) |
| Données Next (`use cache` + `cacheLife`) | Projection publique d'un site : configuration publiée, catalogue public, faits SEO, droits publics | `site:{business}`, `catalog:{business}`, `entitlements:{business}` | `revalidateTag` à la publication, à la modification du catalogue et au changement de plan ou d'add-on |
| Mémoire courte du processus | Domaine → commerce dans `proxy.ts` | `domain:{host}` | TTL 60 s ; une vérification DNS ou un changement de domaine principal n'est visible qu'après expiration |
| Jamais | Aperçu, brouillon, compte client, panier, back-office, tout ce qui dépend de `actor()` | — | — |

**Contraintes.**
- **Le cache ne doit jamais contourner la RLS.** La fonction mise en cache ouvre elle-même son contexte : `withDatabaseContext({restaurantId, public:true})` et `SET LOCAL ROLE atacuisine_app`. Elle ne prend en argument que l'identifiant du commerce, jamais une session. Les mêmes projections publiques qu'aujourd'hui restent servies.
- **`cacheComponents` est incompatible avec `export const dynamic`.** Next 16 impose de migrer tous les segments. Première étape sans risque : `unstable_cache` (modèle précédent, toujours documenté) sur la seule projection publique, ou `use cache` après activation de `cacheComponents` sur une branche dédiée.
- **Isolation par établissement (décision du 10 novembre 2026).** Chaque entrée de cache appartient à un seul établissement. Sa clé et ses étiquettes contiennent toujours l'identifiant du commerce (`site:{business}`, `catalog:{business}`…). Aucune entrée ne mélange les données de deux établissements, et une invalidation ne touche que l'établissement concerné. Une étiquette globale `platform` est posée en plus sur chaque entrée. Elle permet au super admin de tout rafraîchir d'un coup, par exemple après un déploiement ou une correction de modèle. Ce bouton est réservé à l'administration de la plateforme et journalisé.
- **Plusieurs serveurs (question technique distincte de l'isolation).** Quand l'application tournera sur plusieurs serveurs, chacun gardera sa propre copie du cache. Une invalidation faite sur un serveur ne vide pas les copies des autres. Deux réponses sont possibles :
  - *TTL court (choix par défaut, aucune brique nouvelle)* : chaque entrée expire après 60 s. Après une publication, un visiteur peut voir l'ancienne version au plus 60 s sur un autre serveur ;
  - *invalidation diffusée*, plus tard si ce délai gêne : un gestionnaire de cache (`cacheHandlers`, méthode `refreshTags`) lit les invalidations dans une table PostgreSQL ou dans Redis. Voir `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`, « Multi-Instance Cache Coordination ».

  Dans les deux cas, l'isolation par établissement reste identique.

## 4. Files de tâches (queues)

### Constat

La base est solide : `outbox_jobs` persistante, dédoublonnage par établissement, type et clé, `FOR UPDATE SKIP LOCKED`, bail renouvelé, 5 tentatives, trois groupes de workers, équité par tourniquet et plafond d'un job par commerce (`WORKER_GROUPS.md`). En revanche, peu de types de jobs passent par cette file :

| Traitement | Aujourd'hui | Risque |
|---|---|---|
| Stripe, versements, expiration de commande | Job `critical` | ✓ |
| Transcodage vidéo, scan et archive de sécurité, audit SEO | Job `media` / `maintenance` | ✓ |
| Assistant IA générative | Synchrone dans la requête HTTP (délai 45 s, `max_tokens` 8000) | Connexion HTTP longue, pas de reprise ; le coût est débité après la réponse |
| Extraction IA des factures | Synchrone à l'import (`src/features/invoices/service.ts`) | Même chose ; import bloqué si le fournisseur IA est lent |
| Email / SMS client | Appel Resend ou Twilio **à l'intérieur de la transaction** (`src/features/messaging/service.ts`) | Connexion du pool tenue pendant l'appel réseau ; double envoi possible si la transaction échoue après l'envoi |
| Exports CSV, FEC, RH, PDF de factures | Synchrones | Délai sur de longues périodes |
| Import clients | Synchrone | Idem |
| Réception des vidéos | En mémoire dans le processus web (100 Mo) | Pression mémoire, pas d'envoi direct vers S3 |
| Journal de sécurité non écrit | Tampon mémoire par processus (`ops-security/events.ts`) | Perdu au redémarrage |

### Proposition

1. **Envois.** Le job `customer_message` est inscrit dans la transaction avec le message en statut `queued`. L'envoi se fait dans le worker avec une clé d'idempotence fournisseur (`Idempotency-Key` Resend). Le statut est mis à jour après l'envoi. Groupe : `maintenance`, ou un nouveau groupe `outbound` si les volumes l'exigent.
2. **IA.** Jobs `ai_invoice_extract` et `ai_assistant_long` (§ 5). Les crédits sont réservés avant le job, puis ajustés au coût réel.
3. **Exports.** Job `export` qui écrit le fichier sur S3. Le téléchargement passe par une URL signée à durée courte, et une notification signale que le fichier est prêt.
4. **Médias.** Envoi direct vers S3 par URL présignée, puis job de validation et de transcodage. Le serveur web ne reçoit plus le fichier.
5. **Contrat inchangé.** `enqueue()`, test `worker-groups.test.ts` qui échoue si un type n'a pas de traitement, budget de connexions mis à jour dans `WORKER_GROUPS.md`.

Il n'y a pas besoin d'un courtier externe (Redis, SQS, Vercel Queues) tant que la file PostgreSQL tient la charge. La file est déjà équitable et transactionnelle avec les écritures métier, ce qu'un courtier externe ne garantit pas sans outbox. Un courtier externe se réévalue sur mesure : latence de réclamation, puis verrou de groupe sous plusieurs réplicas.

## 5. IA actuelle

### Intégration

- **Assistant « Cuisine IA » / STUDIO VOICE** (`src/features/assistant/*`, ~3 600 lignes). Il combine un moteur réflexe à règles, sans coût fournisseur, et Claude via `@anthropic-ai/sdk`. Les outils de Claude ne font que proposer des actions, et chaque action confirmée repasse par `perform` avec les droits revérifiés. Le contexte se limite au snapshot de l'utilisateur, donc à ses droits.
- **Extraction de factures fournisseurs** (`src/features/invoices/extract.ts`). Sortie JSON par schéma et débit des crédits IA.
- **Crédits.** Portefeuille par organisation (`026_ai_credits.sql`). Le débit est atomique et le coût réel du fournisseur est journalisé, avec une marge réglée par `ATACUISINE_AI_MARKUP`. Un second système, les crédits Studio (`051`), existe en parallèle.
- **Modèle.** `ATACUISINE_AI_MODEL`, Opus par défaut, pour l'assistant comme pour l'extraction.

### Évaluation

Les fondations sont bonnes : l'IA n'exécute rien seule et elle est déjà facturée à l'usage. Mais elle n'est pas un module :
- elle n'apparaît ni dans le registre ni dans `module_settings` ;
- son seul interrupteur est la présence de `ANTHROPIC_API_KEY`, global à la plateforme ;
- un commerce ne peut pas la désactiver ;
- le moteur réflexe et l'IA générative partagent le même portefeuille et le même point d'entrée ;
- le code de l'assistant est très orienté restauration (tables, cuisine, carte).

### Proposition

| Module | Contenu | Facturation | Dépendances |
|---|---|---|---|
| `ai-assistant` | Moteur réflexe (navigation, aide) | Inclus (coût nul) ou 1 crédit, comme aujourd'hui | core |
| `ai-assistant-generative` | Réponses Claude, outils `propose_*` | Crédits au coût réel × marge | `ai-assistant` |
| `ai-invoice-extraction` | Lecture des factures | Crédits par document | `invoices` |
| `ai-site-studio` (futur) | Rédaction et SEO assistés du CMS | Crédits | `website` |

**Règles.**
- Chaque module IA a un état par commerce et un plafond de dépense mensuel (`ai_budget_monthly`), contrôlé dans `app.ai_consume`.
- **Fournisseur derrière un port** (`src/core/ai/provider.ts`) : choix du modèle par cas d'usage (extraction → Haiku/Sonnet, assistant → Sonnet, Opus en option), journalisation du coût, coupe-circuit global. Les clés et modèles sont configurés par environnement.
- **Les outils de l'assistant viennent des modules actifs.** Le module Restauration apporte `propose_order` et `table_status`, le module Vente ses outils, etc. L'assistant devient neutre vis-à-vis du secteur.
- **Crédits IA et crédits Studio restent séparés** (décision du 10 novembre 2026), car ils n'ont pas le même rôle :
  - **crédits IA** : ils se consomment à l'usage pour la voix et les fonctions IA. Ils se rechargent par packs et alimentent les modules `ai-*` ;
  - **crédits Studio** : c'est un portefeuille en euros dans la plateforme. Il sert à acheter des add-ons et à régler les abonnements récurrents au fil du temps, à l'image d'un solde prépayé.

  Une recharge de crédits IA payée avec des crédits Studio reste possible, comme pour n'importe quel achat. Les deux registres restent alors distincts.

## 6. Indexation

### 6.1 Base de données

Mesures sur le schéma complet appliqué à une base vierge :
- 148 tables, toutes sous RLS ;
- 107 tables portent `restaurant_id` ;
- **26 de ces tables n'avaient aucun index commençant par `restaurant_id`**, dont `customers`, `menu_items`, `stock_movements`, `memberships`, `suppliers`, `purchase_orders` et `notifications`. Les politiques RLS et les services filtrent tous par établissement : chaque lecture parcourait donc les lignes de tous les commerces ;
- 121 clés étrangères n'ont pas d'index en tête, par exemple `orders.session_id`, `order_items.menu_id`, `stock_reservations.lot_id` et `sessions.profile_id`.

**Corrigé dans ce lot :** migration `081_tenant_indexes.sql`, 44 index additifs, avec un retour arrière dans `down/081`. Le test `tests/tenant-indexes.test.ts` échoue désormais si une nouvelle table portant `restaurant_id` n'a pas d'index à ce nom, ou si une table échappe à la RLS.

**À suivre :**
- passer les 121 clés étrangères en revue selon leur usage réel. Les colonnes d'audit (`created_by`, `updated_by`, `actor`) n'ont pas besoin d'index tant qu'on ne supprime pas de profils ;
- relever `pg_stat_statements` en préproduction avec une charge représentative (`npm run test:load`) ;
- index partiels pour les listes à statut, par exemple les commandes actives et les réservations à venir ;
- index du journal de sécurité par période.

### 6.2 SEO des sites CMS et `noindex`

**Déjà correct :**
- URL canonique tirée de la base (domaine principal) et non de l'en-tête `Host` ;
- redirection 308 des domaines secondaires ;
- miroir `/r/{id}` d'un site doté d'un domaine : canonique vers le domaine et sitemap vide ;
- `noindex` sur l'aperçu, les brouillons, les pages protégées, la démo, les 404 et le back-office ;
- sitemap limité aux pages visibles et indexables ;
- choix explicite pour les robots d'IA (recherche et entraînement) ;
- `robots.txt` qui ne masque pas les pages en `noindex`, ce qui est la bonne pratique : un robot doit pouvoir lire le `noindex`.

**Écarts relevés :**

| Écart | Effet | Correction proposée |
|---|---|---|
| `app.platform_sites()` et le sitemap d'un site ne vérifient pas `addon_installed(website)`, contrairement à la page | Des URL listées répondent en 404 (erreurs dans la Search Console) | Ajouter la même condition que `loadSite` |
| Pendant l'essai de 3 jours, un site publié est indexable | Indexation de sites éphémères, puis 404 à l'expiration | **Accepté tel quel** (décision du 10 novembre 2026) : pas de blocage pendant l'essai |
| Pas de `X-Robots-Tag: noindex` sur `/api/*` et sur les médias privés | Faible, mais une API peut être indexée via un lien | En-tête dans `next.config.ts` pour `/api/:path*`, sauf `/api/media` publié |
| Commerce archivé ou organisation suspendue | `notFound()` via le plan ; vérifier le code renvoyé (404 ou 410) | Répondre 410 pour accélérer la désindexation |
| Domaine personnalisé non vérifié | Résolu par la base, à vérifier | Ne servir qu'après vérification DNS (existant à confirmer par un test) |
| Pages produit sans `lastmod` | Recrawl moins ciblé | `updated_at` du produit |

Le `noindex` effectif d'une page doit dépendre d'une seule fonction pure, `indexability(context)`. Elle remplacerait le calcul en ligne de `generateMetadata`, `indexablePages` et `platform_sites`. Elle couvrirait le site entier, la page, l'aperçu, la démo, l'essai, l'add-on, le miroir et le statut du commerce, avec un test par cas.

## 7. Absence d'état local et multi-région (préparer sans implémenter)

| Point | État | Action |
|---|---|---|
| Sessions | En base, cookies opaques | ✓ |
| Limitation de débit | En base (`app.consume_rate_limit`) | ✓ |
| Fichiers | S3 en production ; disque local seulement en démo (`ATACUISINE_DATA_DIR` doit contenir « demo ») | ✓ Factoriser les 5 copies de `new S3Client(...)` dans `src/core/storage` |
| Cache Next | Disque et mémoire de chaque instance | Gestionnaire partagé (§ 3) |
| Clés de déploiement | — | Fixer `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` et `deploymentId` pour plusieurs instances et les déploiements progressifs |
| Tampon du journal de sécurité | Mémoire du processus | Acceptable en secours, à documenter ; sinon écriture dans `outbox_jobs` |
| Pools PostgreSQL créés par appel | `addons/service.ts`, `addons/purchases.ts`, `credits/studio.ts` : `new Pool()` puis `end()` à chaque opération | Pool unique paresseux par URL |
| Configuration | Variables d'environnement, `APP_URL` | Ajouter `APP_REGION` et un `organization_placements.cluster_key` réellement lu par la couche de connexion, sans encore router |
| Données par région | Registre `organization_placements` présent, inutilisé | La règle « une organisation = une région » garde la RLS intacte ; une seule résolution `organization → DATABASE_URL` à prévoir dans `getDb()` |

## 8. Renommage Restaurant → Commerce (Business)

### Étendue

- Base : `restaurant_id` apparaît 1 037 fois dans les migrations, dans 107 tables.
- Code : `restaurant_id` apparaît 691 fois dans `src`, et `restaurant(s)` 1 941 fois.
- Réglage RLS `app.restaurant_id`.
- Routes `/restaurant/[restaurant]` (administration) et `/r/[restaurant]` (sites publics, **URL indexées**).

Un renommage d'un seul tenant serait risqué pour la RLS et le SEO.

### Stratégie par couches

| Étape | Contenu | Risque |
|---|---|---|
| **A. Vocabulaire (fait dans ce lot)** | `src/core/tenant/business.ts` : `BusinessId`, `isBusinessId`, `industries` (déplacé du module d'accueil vers le core, réexporté). `legacyBusinessModules` (ancien nom gardé comme alias `@deprecated`). `enqueue(db, business, …)`. Le registre de modules type ses secteurs avec `Industry`. | Nul : alias et types uniquement |
| B. Frontières TypeScript | Les services exposent `business` dans leurs signatures publiques ; `DatabaseContext.businessId` est lu en priorité, avec `restaurantId` en repli | Faible, mécanique, à faire par domaine |
| C. SQL compatible | `app.business_id()` en alias de `app.restaurant_id`. Vue `businesses` en `security_invoker = true` sur `restaurants`. Les nouvelles tables utilisent `business_id`. | Moyen : tests d'isolation obligatoires (`npm run test:isolation`) |
| D. Routes d'administration | `/business/[business]` en route principale, redirection 308 depuis `/restaurant/...` | Faible (non indexé) |
| E. Renommage physique | `ALTER TABLE restaurants RENAME TO businesses` puis colonnes, avec des vues de compatibilité le temps d'une version | Élevé : seulement après B à D, sur une fenêtre de maintenance |
| — Sites publics | `/r/[restaurant]` **reste tel quel** : c'est une URL publique et indexée, et le nom du segment de route n'est pas visible | — |

Les libellés visibles (« établissement », « commerce ») se traitent à part, avec `industryLabels`.

## 9. Plan priorisé

| Lot | Contenu | Pourquoi maintenant | Vérification |
|---|---|---|---|
| **P0-a** ✓ | Index locataires (081) et vocabulaire Business, étape A | Coût linéaire en nombre de clients, sans risque | `npm test` + `tenant-indexes.test.ts` |
| **P0-b** | Messages client hors transaction, via job idempotent | Connexion tenue pendant un appel réseau, risque de double envoi | Test d'échec après envoi, `test:isolation` |
| **P0-c** | Corrections SEO : add-on site dans sitemap et `platform_sites`, `X-Robots-Tag` sur l’API, 410 pour les commerces archivés, fonction `indexability` | Erreurs dans la Search Console | `seo.test.ts` étendu |
| **P1-a1** ✓ | Manifeste unique : chaque module et add-on du périmètre final (§ 9) déclaré dans le registre (identifiant, dépendances, inclus Studio / add-on mensuel / crédits IA). Fonction `app.module_available(business, module)` branchée sur les mécanismes existants par adaptateurs, **sans changer aucun accès** | Base du modèle « core + modules payants » | Test d'équivalence : pour chaque commerce de test, ancienne décision = nouvelle décision |
| **P1-a2** ✓ | Droits hérités pour les abonnés actuels (site, boutique, et ce que vous confirmerez), puis bascule de la décision d'accès vers `module_available` | Protège les clients en place avant tout changement d'offre | Test : un abonné actuel garde tous ses écrans |
| **P1-a3** ✓ | Découplages : réservation sans salle, commande sans cuisine ni bar, séparation Équipe / RH, séparation Finance de base / add-ons | Rend le core utilisable sans add-on | Test « commerce sans module » : connexion, commande, réservation, chiffre d'affaires, réglages, aucune erreur 500 |
| **P1-a4** | Stock simple (quantité par article, décrément à la vente) ; le moteur lots/recettes passe derrière les add-ons Recettes et Fournisseurs | Nouveau besoin produit, plus gros chantier de la phase | Tests stock simple + non-régression du moteur lots existant |
| **P1-a5** | Boutique en add-on mensuel dépendant du Site ; Site désactivable | Nouvelle offre | Parcours d'achat Stripe test, désactivation sans perte de données |
| **P1-b** | IA en modules (§ 5) : état par commerce, port fournisseur, modèle par usage, plafond mensuel ; extraction de factures en job | Rend l'IA désactivable, facturable et moins coûteuse | `assistant.test.ts`, `invoices.test.ts`, test de plafond |
| **P1-c** | Cache de la projection publique des sites, isolé par établissement (étiquettes `{type}:{business}` + `platform` pour le super admin), et cache du domaine dans le proxy | Charge base des sites publics | Mesure avant/après avec `test:load`, test « aperçu jamais en cache » |
| **P2-a** | Exports et imports en jobs, envoi direct des médias vers S3 | Mémoire et délais du serveur web | `worker-groups.test.ts` |
| **P2-b** | Préparation multi-instances : gestionnaire de cache partagé, clés de déploiement, pools uniques, `src/core/storage` | Mise à l'échelle horizontale | 2 instances derrière un proxy, invalidation croisée |
| **P2-c** | Renommage, étapes B à D | Généralisation | `test:isolation`, redirections 308 |
| **P3** | Renommage physique (E) ; routage par région via `organization_placements` | Seulement si le besoin est avéré | Répétition sur une copie de production |

**Décisions prises le 10 novembre 2026 :**

#### Périmètre de l'abonnement Studio (décisions des 10 novembre 2026, version finale)

| Inclus dans Studio | Ce que ça couvre, et seulement ça |
|---|---|
| Vue d'ensemble, activité | Tableau de bord et journal d'activité |
| Commandes | Prise de commande, encaissement, statuts simples (en cours → payée / annulée), **sans écran cuisine ni bar** |
| Réservations | Demandes, confirmation, arrivée. **Le plan de salle n'est plus requis** : l'affectation d'une table devient optionnelle et n'existe que si l'add-on Salle est actif |
| Stock simple | Pour chaque produit, aliment ou service : une quantité en stock, ajustée à la main et décrémentée par les ventes. Rien d'autre : ni lots, ni recettes, ni fournisseurs, ni réceptions |
| Outils métier | Tous les outils de tous les secteurs |
| Équipe | Équipiers, utilisateurs et rôles de chacun. Ni planning détaillé, ni présences, ni pointage |
| Finance et rapports | Commandes générées et chiffre d'affaires |
| Banque | Rapprochement bancaire (reste une fonction de base) |
| Versements | Versements des paiements en ligne (reste une fonction de base) |
| Configuration, sécurité opérationnelle | Réglages de l'établissement, centre de sécurité |
| **Site internet** | **Module inclus dès le départ**, désactivable : un site vitrine sans boutique est un cas normal |

| Add-ons | Remarque |
|---|---|
| **Boutique en ligne** | **Payante, au mois.** Elle s'ajoute au module Site et en dépend (panier, créneaux, commande en ligne) |
| Salle (plan de salle) | Permet d'affecter une table aux commandes et aux réservations |
| Cuisine, Bar | Écrans de préparation et statuts par poste (en attente → en préparation → prête → servie) |
| Recettes | Fiches recettes ; décrément des ingrédients par recette |
| Fournisseurs, Réceptions | Fournisseurs, commandes d'achat, réceptions et lots (FEFO) |
| Présences et pointage, Planning détaillé, Paie | RH avancée |
| Factures clients, Factures fournisseurs, Dépenses | Finance avancée |
| Domaine personnalisé, add-ons de site, écrans de chargement | Site |
| Fidélité, messages clients | Relation client |
| QR codes, analytics, estimation, hors ligne, connexions | Divers |
| Modules IA | Payés avec les crédits IA |

**Abonnés actuels.** Ils gardent le site **et** la boutique sans surcoût, par un droit hérité (`addon_legacy_grants`, mécanisme déjà utilisé en 073). Les nouveaux abonnés ont le site inclus et la boutique en add-on mensuel. **Seuls le site et la boutique sont conservés** (décision du 10 novembre 2026). Les autres modules qui deviennent payants (salle, cuisine, bar, recettes, fournisseurs, réceptions, comptabilité, dépenses) devront être souscrits.

**Autres décisions :**
- Les **crédits IA et les crédits Studio restent séparés** (§ 5).
- Le **cache est isolé par établissement**. Le super admin dispose d'une invalidation globale. Entre serveurs, les entrées expirent après un délai court (§ 3).
- L'**indexation n'est pas bloquée pendant l'essai**.

#### Conséquences techniques à traiter en phase 1

| Sujet | Aujourd'hui | Cible |
|---|---|---|
| Réservations sans salle | `reservations.table_id` est déjà facultatif, mais le registre impose `table-booking → floor` | Retirer la dépendance obligatoire (Salle devient `optional`). Sans Salle : pas de choix de table, capacité globale par créneau |
| Commandes sans cuisine ni bar | `menu_items.station` et `order_items.station` sont obligatoires (`kitchen`/`bar`). Les lignes passent par `waiting → … → served` | Poste facultatif. Sans add-on Cuisine/Bar, une ligne est servie dès sa saisie ; les écrans de préparation et leurs statuts n'existent que si l'add-on est actif |
| Stock simple | Le stock est porté par des ingrédients en lots (`stock_lots`), consommés par les recettes (FEFO, réservations de stock) | Nouvelle quantité par article (`menu_items.stock_quantity`, vide = non suivi), décrémentée à la vente. Le moteur lots/recettes/FEFO actuel devient le cœur des add-ons Recettes et Fournisseurs/Réceptions, sans réécriture. Les deux modes ne s'appliquent jamais au même article |
| Équipe | Équipe, planning, présences, RH et paie sont regroupés dans `features/hr` | Séparer `team` (core) des écrans planning, présences et paie (add-ons) |
| Finance | Un seul espace finance couvre chiffre d'affaires, comptabilité, dépenses, factures et banque | Core : commandes, chiffre d'affaires, banque, versements. Add-ons : factures clients, factures fournisseurs, dépenses, paie |
| Site et boutique | Le seuil `plan >= 39` ouvre la page publique ; le panier dépend de `online-orders` | Site = module inclus et désactivable. Boutique = add-on mensuel dépendant du Site. Les pages `commander`, `checkout` et `panier` n'existent que si la boutique est active (déjà le cas) |
## 10. Lots livrés

### P0-a — Index et vocabulaire Business

- `database/migrations/081_tenant_indexes.sql`, `down/081_tenant_indexes.sql`, enregistrement dans `src/lib/database/migrate.ts`.
- `src/core/tenant/business.ts` ; `src/features/onboarding/catalog.ts` réexporte `industries` ; `src/core/modules/{registry,runtime}.ts` ; `src/features/modules/service.ts` ; `src/features/platform/jobs.ts` ; commentaire de `DatabaseContext`.
- Tests : `tests/tenant-indexes.test.ts`, `tests/business-vocabulary.test.ts`.
- Ce lot ne contient aucun changement de comportement, de politique RLS ou de route.
- La migration n'a été exécutée que sur PGlite (tests). Elle n'a été vérifiée ni sur un PostgreSQL 16 réel ni avec `npm run test:isolation`, ce qui reste à faire avant déploiement.

### P1-a1 — Manifeste unique et décision d'accès (sans changement d'accès)

- **[`src/core/modules/manifest.ts`](../../src/core/modules/manifest.ts)** : les 36 modules du périmètre final (§ 9). Pour chacun :
  - l'offre cible (`included`, `included-optional`, `addon-monthly`, `ai-credits`) ;
  - les dépendances cibles (`requires` obligatoires, `enhancedBy` facultatives) ;
  - les écrans qu'il porte ;
  - la **règle appliquée aujourd'hui** (`legacy`).

  La validation refuse les dépendances inconnues ou circulaires, un écran porté par deux modules, et un module inclus qui exigerait un add-on payant.
- **Migration `090_module_available.sql`** : `app.module_available(commerce, module)` applique `legacy` en SQL.
  - Elle est numérotée 090 parce que des migrations 082 à 085 (décorations de fin d'année) ont été ajoutées en parallèle.
  - Elle renvoie NULL pour un module inconnu et FALSE pour un commerce non visible dans le contexte courant (même garde que `app.restaurant_plan`).
  - Retour arrière : `down/090`.
- **[`src/features/modules/availability.ts`](../../src/features/modules/availability.ts)** : `moduleAvailable` et `availableModules` (une seule requête).
- **[`tests/module-availability.test.ts`](../../tests/module-availability.test.ts)** : pour chaque module et chaque commerce, la nouvelle décision est comparée à l'écran que le poste de travail affiche aujourd'hui, ou à défaut à l'add-on dont le module dépend. Le contexte du poste est recalculé comme `src/lib/snapshot.ts`. La comparaison est faite dans 7 états successifs :
  - données de départ ;
  - add-ons désinstallés ;
  - licences actives, expirées et désinstallées ;
  - droits hérités retirés ;
  - plan de salle suspendu ;
  - autre secteur que la restauration ;
  - abonnement inactif.

  Le test a été vérifié par mutation : une règle SQL volontairement faussée (QR codes hors restauration) le fait échouer sur le cas exact.
- **Aucun écran ni service n'utilise encore cette décision.** La bascule et les droits hérités des abonnés actuels relèvent de P1-a2.
- **Écart connu, laissé tel quel :** `src/core/modules/catalog.ts` (suspension de Salle et Réservations) impose toujours Réservations → Salle. Le manifeste cible ne l'impose plus. Les deux seront alignés en P1-a3.
- **À confirmer :** la **comptabilité** (journal, FEC) n'est pas citée dans le périmètre Studio. Elle est marquée add-on par défaut (`pending` dans le manifeste).

### P1-a2 — Droits hérités et bascule de la navigation

- **Migration `091_module_legacy_grants.sql`** :
  - table `module_legacy_grants`, isolée par la RLS et en lecture seule pour l'application ;
  - `app.record_module_legacy_grants()`, réservée aux migrations et à l'exploitation, idempotente ;
  - `app.module_legacy_granted(commerce, module)`, avec la même garde que `module_available`.
- **Bénéficiaires :** les abonnés **payants** actuels (plan payé ou bonus de parrainage), sur leurs établissements actifs. Un essai gratuit en cours ne donne aucun droit.
- **Périmètre (décision du 10 novembre 2026) : le site et la boutique seulement** (`grandfatheredModules`), pour tous les secteurs. Les autres modules qui deviennent payants ne sont pas conservés. Les add-ons déjà vendus à part (factures, présences, paie…) gardent leurs droits hérités de 073.
- **Migration `092_module_legacy_grants_scope.sql`** : sans effet sur une base neuve. Elle aligne une base qui avait appliqué la version préliminaire de 091 à dix modules (cas de la base de démonstration locale) : elle retire les droits en trop et resserre la contrainte. Elle est couverte par un test dédié.
- **Calendrier :** la table n'ouvre encore aucun accès. La migration qui activera l'offre cible rappellera `record_module_legacy_grants()` juste avant, pour inclure les abonnés arrivés entre-temps.
- **Bascule de la navigation :**
  - `NavigationContext.modules` (`src/core/navigation/registry.ts`) remplace à lui seul plan, add-ons, licences, installations et modules actifs ;
  - une entrée est visible si son module est disponible et si le rôle le permet ;
  - le snapshot (`src/lib/snapshot.ts`) fournit `modules` via `availableModules`, et le poste de travail le transmet ;
  - un ancien snapshot sans `modules`, par exemple en cache hors ligne, repasse par l'ancien calcul.
- **Preuve d'équivalence :** `tests/module-availability.test.ts` compare, dans les 7 états commerciaux et pour chaque rôle seul puis pour tous les rôles cumulés, les écrans calculés depuis `modules` à l'ancien calcul. `tests/module-legacy-grants.test.ts` couvre les bénéficiaires, l'essai, le secteur, l'idempotence et l'isolation.
- **Non basculé, volontairement :** les contrôles côté serveur (`app.module_enabled`, `app.addon_installed`, seuils de plan dans les services et la RLS). `module_available` les appelle déjà ; ils seront remplacés service par service avec P1-a3, quand la règle cible changera réellement.

### P1-a3 — Réservations sans plan de salle, commandes sans cuisine ni bar

- **Migration `100_booking_without_floor.sql`** (retour arrière : `down/100`). Elle est numérotée 100 parce que 093 et 094 ont été prises en parallèle par les add-ons Pilotage.
  - `app.module_enabled('table-booking')` ne dépend plus du plan de salle.
  - L'installation (`addon_installation_set`) et l'activation (`apply_module_state`) n'imposent plus d'ordre entre les deux modules.
  - Le plan de salle ne peut être retiré que sans service de table en cours, ni réservation à venir avec une table.
  - Les réservations ne peuvent être retirées que sans réservation à venir.
  - Un déclencheur (`reservation_table_floor`) refuse l'attribution d'une table si le plan de salle n'est pas actif.
- **Sans plan de salle :**
  - la page publique n'expose aucune table, et les créneaux ouverts restent réservables (même chemin que les groupes trop grands pour une table) ;
  - une demande avec une table est refusée ;
  - l'équipe confirme et enregistre l'arrivée sans table, et l'écran « Gérer la réservation » masque le choix de table.
- **Avec plan de salle :** rien ne change. La confirmation exige toujours une table.
- **Commandes sans cuisine ni bar :**
  - si le module Cuisine (ou Bar pour une boisson) n'est pas disponible, une ligne passe directement de « en attente » à « servie » (`changeItem`) ;
  - le stock réservé est consommé comme au début de préparation, avec le motif « Service direct » ;
  - le bouton « Servir » apparaît alors dès la saisie (`src/components/operations.tsx`) ;
  - avec la Cuisine, le saut d'étape reste refusé.

  Avec les règles actuelles, Cuisine et Bar sont disponibles pour tout restaurant : ce chemin servira dès la bascule de l'offre.
- **Équipe / RH et Finance :** la séparation est faite dans le registre et la navigation.
  - Équipe : `team`. RH en add-ons : `attendance` (écrans Présences et Heures & absences) et `payroll`.
  - Finance de base : `finance`, `bank`, `payouts`. Add-ons : `accounting`, `expenses`, `client-invoices`, `invoices`.

  Le découpage des services eux-mêmes (tableau de bord financier qui agrège les dépenses, par exemple) se fera avec la bascule de l'offre, quand ces modules pourront réellement être absents.
- **Tests :**
  - `tests/booking-without-floor.test.ts` : parcours public et équipe sans plan de salle, et table toujours exigée avec plan de salle ;
  - `tests/orders-without-kitchen.test.ts` : saut refusé avec Cuisine, service direct et consommation unique du stock sans Cuisine ;
  - `addon-installations`, `module-registry` et `module-runtime` sont mis à jour selon la nouvelle règle.
- **Reste à faire pour un commerce non restaurant :** les commandes, le catalogue et le stock sont encore réservés au secteur restauration (`restaurantOnly`), et un article a toujours un poste cuisine ou bar (`menu_items.station`). Ces deux points relèvent de P1-a4 (stock simple et catalogue neutre).

### Opérations modulaires par métier (12 novembre 2026)

Décision du 12 novembre 2026, qui remplace le §9 pour ces trois modules : **Commandes, Cuisine et Bar sont des modules gratuits**, et non plus un socle Studio (commandes) ni des add-ons payants (cuisine, bar).

- **Migration 121** : plus aucun module n'est réservé au secteur restauration. Les gardes `requireRestaurantIndustry` de l'API ont été retirées ; seul l'assistant Cuisine IA reste propre à la restauration.
- **Migration 140** : produits gratuits `ops-orders`, `ops-kitchen` et `ops-bar` (catégorie « Opérations », `kind='operations'`). `app.module_available` lit leur licence pour `orders`, `kitchen` et `bar`. Les droits existants sont convertis en licences :
  - les trois pour la restauration ;
  - `ops-orders` pour le commerce, « autre » et tout établissement ayant déjà des commandes ;
  - agenda et devis pour « services » et « autre ».
- **Modules installés au choix du métier** (`freeTradeTools`, src/features/onboarding/catalog.ts) : opérations et outils métier. Un changement de métier désinstalle ceux de l'ancien et installe ceux du nouveau ; tout reste activable depuis la boutique d'add-ons.
- **Navigation** : chaque outil métier installé a sa propre entrée `tool-<id>` dans OPÉRATIONS (src/features/trade/navigation.ts), portée par le module `trade-tools` via `navigationPrefix`. L'ancienne entrée unique « Outils métier » de GESTION a disparu ; `resolve()` exige la licence de l'entrée.
- **Vue d'ensemble modulaire** (src/features/pilotage/catalog.ts) : chaque bloc déclare sa source de données et les métiers pour lesquels il est conseillé. Un bloc dont la source manque n'est pas proposé ; les autres s'activent ou se masquent dans « Personnaliser mon pilotage ». Les chiffres métier viennent de `tradePilotage` (src/features/trade/service.ts).


### Incident du 10 novembre 2026 — base de démonstration et fermeture propre

- **Cause :** l'arrêt du serveur `next dev` a laissé la base PGlite de démonstration sans point de contrôle valide (« could not locate a valid checkpoint record »). PGlite n'écrit ce point qu'à `close()`. De son côté, Next ne ferme pas la base et tue son processus enfant 100 ms après le signal.
- **Rétablissement :**
  - restauration de la sauvegarde `before-075` (00:04), puis migrations rejouées ;
  - les changements de démonstration faits entre 00:05 et 05:21 sont perdus ;
  - la base endommagée est conservée dans `.data/atacuisine-demo-broken-2026-11-10-0521`.
- **Correctif ([`src/lib/database/demo-shutdown.ts`](../../src/lib/database/demo-shutdown.ts)) :**
  - fermeture de PGlite à la réception de SIGINT, SIGTERM ou SIGHUP ;
  - tout `process.exit` (celui de Next) attend la fin de la fermeture, dans la limite de 4 s ;
  - l'enregistrement se fait depuis `getDb()`, une seule fois par processus ;
  - `npm run dev` passe `NEXT_EXIT_TIMEOUT_MS=5000`.
- **Vérification :**
  - `tests/demo-shutdown.test.ts` envoie un vrai SIGTERM à un processus qui imite la sortie immédiate de Next, puis rouvre la base. Il vérifie aussi l'ordre fermeture → sortie.
  - En conditions réelles, l'arrêt du serveur depuis l'app donne « database system was shut down … shutdown true », alors que l'incident affichait « interrupted ».
- **Limites :**
  - un SIGKILL ou une coupure brutale ne peuvent pas être protégés ;
  - la contre-épreuve sans correctif n'a pas reproduit la corruption sur une charge courte : le test prouve la fermeture, pas l'inévitabilité de la panne.
