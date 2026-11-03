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
