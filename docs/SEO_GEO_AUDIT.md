# Audit SEO & GEO — Phase 1

Date : 3 novembre 2026 · Branche : `main` @ `d850f6a` · Aucune modification de code dans cette phase.

Référence de départ : `npm test` → 34/34 tests verts. `npm run typecheck` échoue uniquement sur des types générés obsolètes dans `.next/types` (route `src/app/[[...page]]` supprimée) ; les sources compilent. À nettoyer avec `rm -rf .next/types`.

## 1. Stack réelle

| Élément | Constat |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript, Zod 4 |
| Rendu | SSR dynamique partout (`force-dynamic`), aucun SSG/ISR, aucun cache HTTP sur les pages publiques |
| Backend | Route handlers Next (`src/app/api/**`), services métier dans `src/features/**` |
| Base de données | PostgreSQL (prod, `pg`) ou PGlite (démo locale), migrations SQL `database/migrations/001…016` |
| Isolation | RLS PostgreSQL (`app.in_restaurant()`), rôle `dattier_app` sans BYPASSRLS (vérifié au démarrage), contexte tenant via `AsyncLocalStorage` (`src/lib/database/context.ts`) |
| Domaines | Table `restaurant_domains(hostname, restaurant_id, verified_at)`, résolution par `app.resolve_domain()` (SECURITY DEFINER, domaine vérifié + organisation active) dans `src/proxy.ts`, réécriture vers `/r/{restaurant}` |
| Vitrine tenant | `src/app/r/[restaurant]/[[...page]]/page.tsx` → `DonutStore` (`src/components/cms-site/store.tsx`, 2 028 lignes, `"use client"`) |
| Configuration tenant | CMS JSON versionné (`restaurant_cms`, `cms_versions`), schéma Zod `src/features/cms/schema.ts` (`seo`, `branding`, `legal`, `pages[*].seo`) + réglages boutique (`commerce.settings` : horaires, adresse, téléphone, URL Google Business) |
| Jobs | File `outbox_jobs` (dedupe_key unique, tentatives, verrou) + `scripts/worker.ts` — réutilisable pour l’automatisation SEO |
| Hébergement | Docker/compose auto-hébergé ; docs Vercel/Supabase présentes mais non actives. Pas de CDN configuré dans le dépôt |
| Dépendances SEO | Aucune (ni `next-sitemap`, ni `schema-dts`) — rien à ajouter, l’API Metadata de Next suffit |

## 2. Ce qui existe déjà (à réutiliser)

- **Séparation plateforme / tenants** : `/` (présentation Dattier OS) a ses propres métadonnées ; le `layout` racine est `noindex` par défaut, donc tout espace privé non configuré reste non indexable.
- **Métadonnées par page tenant** : `generateMetadata` dans la route tenant (title, description, canonical, robots, Open Graph, favicon), valeurs éditables dans le Studio (`seo.title` ≤ 70, `seo.description` ≤ 170, `ogImage`, `noIndex` par page).
- **Garde-fou d’indexation** : un site n’est indexable que si le propriétaire a explicitement mis `seo.noIndex = false`, **et** la publication l’exige seulement si l’identité légale (exploitant, e-mail, hébergeur) est remplie (`service.ts`, op `publish`). Démo et aperçus brouillon → `noindex`.
- **Sitemap par tenant** : `/r/{id}/sitemap.xml` (et `/sitemap.xml` sur domaine personnalisé via la réécriture du proxy) ; exclut pages masquées, protégées et `noIndex`.
- **Invalidation à la publication** : `revalidatePath('/r/{id}', 'layout')` dans `api/cms/[restaurant]/route.ts`.
- **Isolation des médias** : un média d’un autre restaurant est refusé à l’enregistrement du brouillon.

## 3. Problèmes identifiés

### Critiques (bloquent l’indexation ou créent un risque)

| # | Problème | Où | Effet |
| --- | --- | --- | --- |
| C1 | **Contenu dupliqué plateforme ↔ domaine personnalisé** : un tenant avec domaine vérifié est servi à la fois sur `https://plateforme/r/{id}/…` et `https://domaine/…`, chacun avec une canonical **auto-référente** (calculée depuis l’en-tête `Host`). Même chose dans le sitemap. | `page.tsx` `generateMetadata`, `sitemap.xml/route.ts` | Deux copies indexables ; dilution, mauvaise URL choisie par Google |
| C2 | **robots.txt identique sur tous les domaines** : le proxy laisse passer `/robots.txt` sans réécriture → un domaine tenant reçoit le robots de la plateforme, sans ligne `Sitemap:`. En démo il interdit tout (normal). | `src/proxy.ts`, `src/app/robots.ts` | Sitemaps tenants non déclarés ; aucune règle par tenant (robots IA) |
| C3 | **La carte/les produits ne sont pas dans le HTML initial** : `DonutStore` charge le catalogue via `fetch('/api/shop/catalog')` après hydratation. | `store.tsx:186` | Le contenu principal d’un restaurant (plats, prix) est invisible pour les robots qui n’exécutent pas JS — la plupart des crawlers IA — et retardé pour Google |
| C4 | **Aucune donnée structurée** (zéro JSON-LD dans le projet). | — | Pas de `Restaurant`/`LocalBusiness`, `Menu`, `BreadcrumbList`, `FAQPage` ; identité de l’entreprise peu lisible par les machines |

### Importants

| # | Problème | Effet |
| --- | --- | --- |
| I1 | `<html lang="fr">` codé en dur dans le layout racine ; aucun champ langue/pays par tenant | Impossible de servir un tenant non francophone ; hreflang impossible |
| I2 | Pas de `Twitter/X Card`, pas d’`og:url`, `og:type`, `og:locale` ; pas de fallback image sociale (logo) | Partages pauvres |
| I3 | Sitemap sans `<lastmod>` alors que `cms_versions.published_at` existe ; `Cache-Control: no-cache` | Signal de fraîcheur perdu |
| I4 | Sitemap de la plateforme limité à `/` ; robots plateforme sans `Sitemap:` | SaaS lui-même sous-référencé |
| I5 | Aucune page/fiche produit individuelle (pas d’URL par plat) | Pas de cible pour `Product`/`MenuItem`, pas de longue traîne |
| I6 | Modèle d’identité incomplet pour le SEO : pas de type d’activité/cuisine, pas de `sameAs` (réseaux), pas de coordonnées GPS, pas de zone desservie, pas de domaine **principal** explicite (plusieurs domaines vérifiés possibles) | JSON-LD et canonical incomplets |
| I7 | `load()` exécuté deux fois par requête (`generateMetadata` + `Page`) → deux transactions DB | TTFB inutilement doublé |
| I8 | Erreurs : page inconnue → 404 générique de Next ; pas de 410 pour pages supprimées ; pas de gestion de redirections (changement de slug) | Liens cassés après refonte |

### Performance (Core Web Vitals — non mesurés à ce stade)

- Polices servies en **TTF** (Inter 860 Ko, Fraunces 352 Ko, Playfair 296 Ko) sans `font-display` vérifié ; à convertir en WOFF2 (gain ~50–70 %) et précharger seulement la police de titres du thème actif.
- 17 `<img>` bruts dans la vitrine (pas de `next/image`, pas de `srcset`/dimensions → risque CLS et LCP).
- Vitrine 100 % client (bundle unique de 2 000 lignes + lucide) → INP/hydratation à surveiller.
- Aucune mise en cache HTTP des pages publiques ; tout est `force-dynamic`.
- Aucune donnée terrain (CrUX/RUM) disponible ; il faudra une mesure Lighthouse locale avant/après.

### Sécurité / isolation (points à préserver pendant les travaux)

- L’isolation repose sur la RLS — solide. **Aucune fuite constatée.**
- Aujourd’hui il n’y a **aucun cache partagé** des pages tenant, donc aucun risque de mélange. Dès qu’un cache sera ajouté (ISR, CDN), la clé devra inclure l’hôte/le tenant : c’est le risque n°1 de la suite.
- La canonical s’appuie sur l’en-tête `Host`. En production le proxy refuse les hôtes non vérifiés (404), mais il faut construire la canonical depuis **la base** (domaine principal vérifié), jamais depuis `Host`.
- `robots.txt` n’est pas un mécanisme de sécurité : les espaces privés restent protégés par l’authentification et `noindex` (déjà le cas).

### Non applicable / absent

- Multilingue : aucune version linguistique n’existe → **pas de hreflang** tant qu’il n’y a pas de vraies traductions.
- Avis : il existe des avis clients produits avec `verified_purchase`. Ils sont réels mais **auto-hébergés** : Google n’accorde pas d’étoiles enrichies aux avis « self-serving » sur `LocalBusiness`. On ne les mettra en JSON-LD qu’au niveau produit, et seulement s’ils sont visibles sur la page.
- Search Console / Bing Webmaster : aucune connexion ; aucune donnée d’impressions/positions ne doit être affichée tant qu’elles ne sont pas branchées.

## 4. Priorités

| Priorité | Lot | Contenu | Migration SQL |
| --- | --- | --- | --- |
| **P0** | Canonical & domaines | Domaine principal par tenant (colonne `is_primary` additive), canonical et `og:url` construits depuis la base ; pages `/r/{id}/…` de la plateforme → canonical vers le domaine principal + exclues du sitemap (pas de 301 global : le compte client et le panier passent volontairement par la plateforme) | Oui, additive |
| **P0** | robots.txt par hôte | Route robots dynamique : plateforme vs tenant, `Sitemap:` absolu, règles robots IA par tenant (recherche / entraînement séparés) | Non |
| **P0** | Contenu indexable | Catalogue chargé côté serveur et passé en props initiales à `DonutStore` (le polling client reste) ; `cache()` React pour ne charger qu’une fois par requête | Non |
| **P0** | JSON-LD | Moteur `src/features/seo/` : `Restaurant` (+ `Organization` en fallback), `WebSite`, `BreadcrumbList`, `Menu`/`MenuItem`/`Offer` (prix publiés), `FAQPage` si section FAQ visible ; uniquement des données présentes et visibles | Non |
| **P1** | Métadonnées complètes | Twitter Card, `og:type/url/locale`, fallback logo, `lang` par tenant, `lastmod` sitemap, 404/410 propres | Non (champs optionnels dans le JSON CMS, schéma v1 compatible) |
| **P1** | Identité SEO tenant | Champs optionnels CMS : type d’activité, cuisine, gamme de prix, `sameAs`, zone desservie, langue, pays, préférences robots IA | Non |
| **P1** | Tests | Suite `tests/seo.test.ts` : 3 tenants fictifs (domaines, langues, secteurs différents), unicité des métas, canonicals, sitemaps, robots, JSON-LD, **non-fuite inter-tenant** | — |
| **P2** | Performance | WOFF2, `next/image`/dimensions, mesure Lighthouse avant/après | Non |
| **P2** | GEO | `llms.txt` facultatif par tenant (désactivé par défaut), modèles de pages FAQ/infos pratiques, dates de mise à jour visibles | Non |
| **P3** | Automatisation | Événements publication/domaine/produit → jobs `outbox_jobs` (dedupe) : invalidation ciblée, contrôle canonical, vérification liens | Non |
| **P3** | Dashboard « SEO & visibilité IA » | Santé technique calculée réellement ; métriques organiques / IA affichées « non disponibles » tant que GSC/Bing ne sont pas connectés | Éventuellement |

Ordre recommandé : P0 dans un premier lot testable, puis P1, puis le reste. Aucune étape n’implique de migration destructive ni de déploiement.

## 5. Lot P0 — réalisé (3 novembre 2026)

| Point | Statut | Fichiers |
| --- | --- | --- |
| C1 Canonical unique | Implémenté + testé. Canonical, `og:url` et `@id` JSON-LD construits depuis `app.primary_domain()` (base), jamais depuis `Host`. Miroir plateforme d’un site à domaine propre → canonical vers le domaine, sitemap vide. | `017_seo_primary_domain.sql`, `src/features/seo/urls.ts`, `src/features/seo/server.ts`, route tenant |
| Domaine principal | Implémenté + testé. Action `primaryDomain` (domaine vérifié du restaurant uniquement), index unique partiel, bouton « Définir comme principal » dans l’onglet domaines. | `src/features/site/service.ts`, `restaurant-hub.tsx` |
| C2 robots.txt par hôte | Implémenté + testé. Plateforme : `src/app/robots.txt/route.ts` (+ `Sitemap:`, pages de session `/r/*/…`). Domaine restaurant : le proxy réécrit vers `/r/{id}/robots.txt`. Préférences robots IA (recherche / entraînement) via `seo.aiCrawlers` (facultatif, sans interface pour l’instant). | `src/features/seo/robots.ts`, `src/proxy.ts` |
| C3 Contenu dans le HTML | Implémenté + vérifié en local : le catalogue est chargé côté serveur et passé à `DonutStore` (`initialData`) ; plats et prix présents dans le HTML initial. Chargement mémoïsé (`cache`) : une seule transaction par requête au lieu de deux. | route tenant, `store.tsx`, `commerce/service.ts` |
| C4 JSON-LD | Implémenté + testé : `WebSite` + `Restaurant` (accueil, contact), `Menu`/`MenuItem`/`Offer` (carte, prix et stock réels), `FAQPage` (si FAQ visible), `BreadcrumbList` (hors accueil). Aucun avis/note/distinction généré. Sérialisation protégée contre l’injection `</script>`. | `src/features/seo/jsonld.ts` |
| I2/I3 | Twitter Card, `og:type/url/locale`, image de partage de repli (logo) ; `<lastmod>` dans le sitemap. | route tenant, `src/features/seo/sitemap.ts` |

Tests : `tests/seo.test.ts` (8 tests, 3 restaurants fictifs + base PGlite avec RLS) ; suite complète 42/42. E2E Playwright : 4/5 ; l’échec « PWA : redémarrage hors ligne » est préexistant (reproduit à l’identique sur le code d’origine, sous `next dev`).

Non vérifié : rendu en mode production avec un vrai domaine (nécessite PostgreSQL + DNS) ; validation Google Rich Results Test (nécessite une URL publique).

## 6. Lot P1 — réalisé (3 novembre 2026)

| Point | Statut | Fichiers |
| --- | --- | --- |
| Langue et pays par site | Implémenté + testé + vérifié en local. `seo.locale` (BCP 47 + ISO 3166, facultatif, défaut fr/FR). `<html lang>` posé par le layout racine à partir de l’en-tête interne `x-dattier-site`, que seul le proxy positionne (tout en-tête client du même nom est retiré). `og:locale` et `inLanguage` suivent. | `src/features/seo/locale.ts`, `src/app/layout.tsx`, `src/proxy.ts`, `siteLanguage()` |
| Identité de l’établissement | Implémenté + testé. `business` facultatif : type schema.org (restauration, commerce, établissement local ou activité en ligne), cuisines, gamme de prix, profils officiels `sameAs` (https), zones desservies, coordonnées GPS. Activité en ligne → ni adresse, ni horaires, ni position ; types non alimentaires → ni `hasMenu` ni `servesCuisine`. | `schema.ts`, `jsonld.ts` |
| Robots IA | Interface ajoutée (recherche / entraînement) dans Studio › Référencement. | `site-editor/seo-identity.tsx` |
| Redirections | Implémenté + testé + vérifié (308 permanente / 307 temporaire). Une seule étape, uniquement pour une adresse qui n’existe plus, cible interne ou https ; `//`, `javascript:`, `http:` et boucles refusés. Saisie « /ancienne -> /nouvelle » ou « ~> ». | `locale.ts`, route tenant, `seo-identity.tsx` |
| Domaines secondaires | Implémenté (non testé automatiquement : nécessite PostgreSQL + domaine) : un domaine vérifié non principal redirige en 308 vers le domaine principal (hors `/api/`). | `src/proxy.ts` |
| Sitemap de la plateforme | Implémenté + testé. `/sitemap.xml` devient un index : pages de la plateforme (`/sitemap-platform.xml`) + sitemaps des sites publiés sous `/r/{id}` (indexation activée, sans domaine propre, organisation active) via `app.platform_sites()` (migration 018, additive). | `018_seo_platform_sites.sql`, `src/app/sitemap.xml/`, `src/app/sitemap-platform.xml/` |

Tests : `tests/seo.test.ts` 14 tests ; suite complète 48/48. E2E : 4/5 (échec PWA préexistant, inchangé).

Limites connues : devise des prix fixée à l’euro (`money()` et JSON-LD) ; pas de hreflang (aucun modèle de traduction) ; pas de 410 (Next ne permet pas ce statut depuis une page : une page supprimée renvoie 404, ou une redirection si elle est configurée) ; les liens `sameAs` sont déclarés par le propriétaire, leur propriété n’est pas vérifiée.

## 7. Lot P2 — réalisé (3 novembre 2026)

### Mesures (laboratoire, avant / après)

Méthode : build de production (`next build` + `next start`, mode démo), Playwright/Chromium, mobile 412×823, réseau 4G lente simulée (150 ms, 1,6 Mbit/s), processeur ralenti ×4, médiane de 5 chargements à froid (première visite, sans consentement enregistré). Ce sont des mesures de laboratoire : les seuils Core Web Vitals s’évaluent au 75e centile des visites réelles, non disponibles ici.

| Page | Mesure | Avant | Après |
| --- | --- | --- | --- |
| `/carte` (thème Playfair + Inter) | LCP | 2 244 ms | **644 ms** |
| `/` (thème Playfair + Inter) | LCP | 672 ms | 692 ms (inchangé, bruit de mesure) |
| toutes | Polices transférées | 581 Ko (TTF, gzip) | **447 Ko** (WOFF2) |
| toutes | CLS | 0,002–0,009 | 0,002–0,009 |
| toutes | Temps bloquant (tâches > 50 ms) | 10–19 ms | 16–20 ms |
| toutes | JavaScript | 223 Ko | 223 Ko |

Thème par défaut (polices système) avant P2 : LCP 688 ms (`/`) et 1 796 ms (`/carte`), aucune police téléchargée.

### Changements

| Point | Statut | Fichiers |
| --- | --- | --- |
| LCP tardif dû au bandeau cookies | Corrigé + testé + mesuré. Le bandeau était rendu après hydratation et devenait l’élément LCP (1,8–2,2 s). Il fait désormais partie du HTML serveur ; un script en ligne le masque avant affichage si un choix est déjà enregistré (vérifié : aucun flash pour un visiteur connu, aucune erreur d’hydratation). | `cookie-consent.tsx` |
| Polices WOFF2 | Fait + testé. 7 polices converties (−60 % sur disque, −23 % transféré car le TTF était déjà compressé par le serveur). TTF conservés en repli. `font-display: swap` était déjà en place. | `public/fonts/*.woff2`, `fonts.css`, `THIRD_PARTY_NOTICES.md` |
| Images | Déjà correctes pour l’essentiel (héros en `fetchPriority="high"`, listes en `lazy` avec dimensions). Ajout de `lazy`/`async` sur 3 images sous la ligne de flottaison. | `store.tsx` |
| llms.txt par site | Implémenté + testé. Désactivé par défaut, publié seulement si l’indexation est active et sur l’hôte canonique ; reprend uniquement les informations, pages et prix déjà publiés ; texte saisi neutralisé (pas d’injection Markdown). Interrupteur dans Studio › Référencement avec mention honnête (« proposition, pas un standard »). | `src/features/seo/llms.ts`, `src/app/r/[restaurant]/llms.txt/` |
| Fraîcheur | « Site mis à jour le … » visible en pied de page et `dateModified` dans le JSON-LD `WebSite`, d’après la date de publication. | `store.tsx`, `jsonld.ts` |

Tests : 52/52 unitaires (22 SEO/GEO/performance) ; E2E 5/5 sur le build de production — y compris « PWA hors ligne », qui n’échoue que sous `next dev` (service worker), pas en production.

Non traité : le JavaScript de la vitrine (223 Ko, composant client unique de 2 000 lignes) — le découper serait le prochain gain, mais c’est une refonte au-delà de ce lot ; pas de modèles de pages éditoriales supplémentaires (la section FAQ existante et `FAQPage` couvrent le besoin immédiat).

## 8. Lot P3 — réalisé (3 novembre 2026)

| Point | Statut | Fichiers |
| --- | --- | --- |
| Automatisation événementielle | Implémenté + testé. Déclencheurs PostgreSQL (transactionnels : un événement annulé ne déclenche rien, aucun chemin d’écriture ne peut l’oublier) sur la création d’établissement, la publication / restauration du site, les produits (ajout, modification, archivage, suppression), les réglages boutique (horaires, adresse) et les domaines. Ils programment un job `seo_audit` dans la file `outbox_jobs` existante (bail, reprise après échec avec attente exponentielle, 5 tentatives). Regroupement : au plus un job en attente + un job de suite si une analyse est en cours, avec 20 s d’anti-rebond ; aucun événement perdu, aucune croissance illimitée. | `019_seo_automation.sql`, `scripts/worker.ts` |
| Analyse SEO/GEO | Implémenté + testé. ~20 contrôles factuels sur les données publiées : publication, indexation (et ce qui manque pour l’activer), domaines, langue, titres en double ou trop longs, descriptions, image de partage, redirections cassées ou inactives, informations pratiques, type d’activité, carte, FAQ, présentation de l’activité, profils officiels, robots IA, llms.txt, poids des polices. **Aucun score global**, aucune estimation de classement ou de citation. Rapports écrits uniquement via `app.record_seo_audit` (contexte de l’établissement vérifié), 20 derniers conservés, jamais lisibles en contexte visiteur. | `src/features/seo/audit.ts` |
| Tableau de bord « SEO & visibilité IA » | Implémenté + testé + vérifié dans le navigateur (desktop et 390 px). Onglet dans l’administration du restaurant, permission `website` (super-admin, propriétaire, manager). Sections : dernière analyse et tâches programmées, recommandations (priorité, nouveau / toujours ouvert / résolu par rapport à l’analyse précédente), configuration, santé technique, données structurées, GEO, performance, visibilité organique, visibilité IA, historique. | `src/features/seo/admin.ts`, `src/components/platform/seo-dashboard.tsx`, `src/app/restaurant/[restaurant]/seo/` |
| Visibilité organique | Affichée « Non disponible » : Search Console et Bing Webmaster ne sont pas connectés. Rien n’est estimé. | — |
| Visibilité IA | Journal d’observations saisies par l’équipe (date, assistant, question, cité ou non, preuve), avec méthode et avertissement de non-représentativité. Jamais généré automatiquement. | `seo_ai_observations` |

Corrections trouvées pendant ce lot :
- **Titres en double** (défaut du lot P0) : une page sans titre propre héritait du titre de l’accueil. Elle reçoit désormais « Page · Nom du site », comme l’aperçu du Studio (`src/features/seo/meta.ts`).
- **Objet partagé dans la configuration par défaut** : toutes les pages de toutes les configurations par défaut partageaient le même objet `seo` en mémoire. Aucun code actuel ne le modifiait, mais une modification aurait touché toutes les pages et tous les établissements sans site publié. Corrigé (`defaults.ts`) et couvert par un test.
- Date de publication normalisée en ISO 8601 quel que soit le pilote (PGlite renvoyait un `Date`).

Tests : 57/57 unitaires (27 SEO/GEO/performance/automatisation) ; E2E 5/5 sur le build de production.

**Déploiement** : la migration 019 et le nouveau `scripts/worker.ts` doivent être déployés ensemble. Un ancien worker marquerait les jobs `seo_audit` en échec (« Connecteur indisponible »), ce que le centre de sécurité signale. En mode démo il n’y a pas de worker : les analyses automatiques restent « programmées », le bouton « Lancer l’analyse maintenant » fonctionne.

## 9. Bilan du moteur SEO/GEO

### Architecture

```
Requête ─► src/proxy.ts ── domaine personnalisé ? ─► app.resolve_domain() ─► réécriture /r/{id}/…
               │                                   └─ domaine secondaire ─► 308 vers le principal
               └─ en-tête interne x-dattier-site (jamais accepté du client) ─► <html lang>

/r/{id}/[[...page]]   métadonnées (canonical depuis app.primary_domain), JSON-LD, catalogue SSR, redirections
/r/{id}/sitemap.xml   /r/{id}/robots.txt   /r/{id}/llms.txt      (servis à la racine d’un domaine propre)
/sitemap.xml          index plateforme : /sitemap-platform.xml + sites sous /r/{id} (app.platform_sites)

src/features/seo/     urls · robots · sitemap · jsonld · locale · meta · llms · audit · admin · server
                      (fonctions pures testées ; accès base limité à server.ts, audit.ts, admin.ts)

Écritures métier ─► déclencheurs SQL ─► outbox_jobs(seo_audit) ─► worker ─► app.record_seo_audit ─► tableau de bord
```

Toute la configuration par établissement vit dans le JSON versionné du Studio (champs facultatifs, schéma v1 compatible) ; l’isolation repose sur la RLS existante et sur des fonctions `SECURITY DEFINER` qui n’exposent que des données publiques (nom d’hôte vérifié, liste des sites indexables).

### Migrations (toutes additives)

| N° | Contenu |
| --- | --- |
| 017 | `restaurant_domains.is_primary`, index unique partiel, `app.primary_domain()` |
| 018 | `app.platform_sites()` |
| 019 | `seo_audits`, `seo_ai_observations`, `app.record_seo_audit()`, `app.queue_seo_audit()`, déclencheurs |

### Intégrations externes restant à connecter

- Google Search Console et Bing Webmaster Tools (impressions, clics, positions ; soumission du sitemap). Nécessite OAuth par établissement et le stockage chiffré des jetons (le module `integration_connections` existant peut servir de base).
- Données terrain Core Web Vitals (API CrUX, ou mesure RUM avec `web-vitals`) pour remplacer les mesures de laboratoire.
- Validation Google Rich Results Test sur une URL publique réelle.

### Limites connues

- Devise des prix fixée à l’euro ; pas de hreflang (aucun modèle de traduction) ; pas de statut 410.
- Les liens `sameAs` sont déclarés par le propriétaire, non vérifiés.
- La redirection des domaines secondaires et l’ensemble du rendu sur un vrai domaine n’ont pas été testés de bout en bout (PostgreSQL + DNS nécessaires).
- Invalidation de cache : les pages publiques sont rendues à chaque requête, il n’y a donc rien à invalider aujourd’hui ; sitemap, robots.txt et llms.txt ont un `s-maxage` de 5 minutes avec `Vary: Host`. Si un CDN ou de l’ISR est ajouté, la clé de cache devra inclure l’hôte et l’invalidation se brancher sur le job `seo_audit`.
- Assistant éditorial (génération de titres, descriptions, FAQ par IA) non réalisé : il demande un fournisseur de modèle, un circuit brouillon → validation, et la garantie de ne s’appuyer que sur des données vérifiées.

### Recommandations

1. Connecter Search Console / Bing (plus forte valeur ajoutée restante).
2. Découper le composant vitrine (`store.tsx`, 223 Ko de JS) pour réduire le JavaScript des pages publiques.
3. Mesurer les Core Web Vitals réels avant toute autre optimisation de performance.
4. Assistant éditorial avec validation obligatoire avant publication.
