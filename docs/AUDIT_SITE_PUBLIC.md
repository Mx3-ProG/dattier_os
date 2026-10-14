# Audit du site public — intervention 1

Date : 14 octobre 2026 · Branche : `claude/restaurant-site-audit-00d39d` · Point de retour : commit `6e5b7d2` (état initial, arbre propre).

Périmètre : site vitrine public uniquement. Le CRM (`/dashboard`), l’authentification, les permissions, les services métier, l’API et le schéma de base de données n’ont pas été modifiés.

## 1. Audit technique et fonctionnel

### 1.1 Architecture et technologies

| Élément | Constat |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Styles | Tailwind 4 importé, mais l’essentiel est du CSS sur mesure dans `src/app/globals.css` (≈ 2 000 lignes partagées entre CRM et site) |
| Composants | Radix Dialog (modales), primitives `Button` (cva), Lucide, Recharts (CRM) |
| Données | PGlite (PostgreSQL embarqué, monoprocessus) via `/api/v1/*`, validation Zod |
| Polices | Georgia / Arial (polices système, aucune police web chargée) |
| Animations | Aucune bibliothèque ; transitions CSS minimales |
| Tests | `node --test` (15 tests domaine/intégration), Playwright (3 parcours E2E dont réservation publique et responsive 390 px) |

Routage public : une seule route attrape-tout `src/app/[[...page]]/page.tsx` qui accepte une liste fermée de pages (`""`, `histoire`, `carte`, `reservations`, `commander`, `galerie`, `avis`, `contact`, `compte`, `mentions-legales`, `confidentialite`, `cookies`, `qr`) et rend `PublicSite`, un composant client unique qui interroge `/api/v1/public` toutes les 5 s.

### 1.2 Homepage, header, footer, navigation (état initial)

- Homepage : hero (titre, accroche, adresse, illustration CSS décorative), bandeau de valeurs, bloc « L’esprit de la maison ». Pas de section carte, avis, réservation, FAQ ni informations pratiques.
- Header : statique (non sticky), 4 liens (Notre maison, La carte, À emporter, Nous trouver) + bouton « Réserver une table ». Sur mobile, les liens passent sous le logo en 10 px, sans menu dédié.
- Footer : logo + 6 liens (galerie, avis, compte, mentions, confidentialité, cookies), pas d’adresse ni de plan de site.
- Pas d’élément `<main>`, pas de lien d’évitement, aucun `aria-current`.

### 1.3 Carte

`/carte` et `/commander` partagent la même vue : onglets Entrées/Plats/Desserts/Boissons, prix et disponibilité calculée depuis les stocks du CRM (`menu()` dans `src/lib/snapshot.ts`). Un produit archivé dans le CRM disparaît du site. Photos, allergènes validés et descriptions réelles absents (descriptions seed génériques).

### 1.4 Réservations (fonctionnement actuel)

1. Le public envoie `POST /api/v1/reservation` (nom, contact, couverts 1–20, date/heure future, note).
2. `requestReservation` (`src/lib/actions.ts`) insère une ligne `requested`, durée fixe 2 h, puis notifie l’équipe et journalise.
3. Dans le CRM (module Réservations), un profil ayant la permission `reservations` (SUPER_ADMIN, OWNER, MANAGER, WAITER) confirme en affectant une table. Le serveur vérifie capacité, état de la table et chevauchement avec les réservations `confirmed`/`arrived` de cette table.
4. Transitions autorisées : `requested → confirmed/declined/cancelled`, `confirmed → arrived/cancelled/no_show`, `arrived → cancelled`.

Limites : aucun horaire d’ouverture en base, aucun contrôle de capacité globale lors de la demande, pas de clé d’idempotence sur les demandes publiques (double clic = doublon), pas de limitation de débit, aucune notification client.

### 1.5 Connexions site ↔ CRM

- Lecture : `GET /api/v1/public` (restaurants : id, nom, adresse, téléphone ; carte avec disponibilités). Aucune donnée privée exposée.
- Écriture : `POST /api/v1/reservation` et `POST /api/v1/public-order` (à emporter / QR), contrôlés par origine locale, taille de corps et Zod.

### 1.6 Espace client

Inexistant. `/compte` est une page d’information honnête. Les seules données « client » sont la table `customers` (fidélité, gérée par l’équipe) et la fiche privée `/avantage?token=…` (accès par possession du lien, pas une authentification). Les réservations ne sont pas reliées aux clients (`contact` est un texte libre).

### 1.7 Pages légales

`/mentions-legales`, `/confidentialite`, `/cookies` existent mais ne contiennent que la liste de ce qui reste à fournir. **Bloquant avant toute mise en ligne** : identité de l’exploitant, hébergeur, directeur de publication, politique de confidentialité RGPD (finalités, durées, droits), politique cookies.

### 1.8 Avis

Aucun modèle de données, aucune intégration, aucune administration. `/avis` affiche honnêtement l’absence d’avis.

### 1.9 Responsive (état initial)

- Nombreux textes à 6–10 px sur mobile (sous-titre du logo 6 px, bandeau 7 px, eyebrows 8 px, liens 10 px).
- Navigation mobile sur une ligne serrée sans menu.
- Pas de débordement horizontal (vérifié à 375 et 390 px).
- Message de confirmation de réservation affiché en haut de page, hors écran après envoi du formulaire sur mobile.

### 1.10 Accessibilité et performance

- Accessibilité : pas de `<main>` ni de lien d’évitement ; tailles de texte trop petites ; onglets de carte sans état annoncé ; bouton « Accéder aux réservations » implémenté en `button` + `router.push` au lieu d’un lien ; contrastes globalement corrects sur les tons verts, faibles sur certains gris (#8c907c sur #f8f5ed).
- Performance : tout le site public est un composant client ; le contenu (carte, adresse) n’existe qu’après un `fetch` côté navigateur → mauvais pour le SEO et le premier affichage. Le polling de 5 s tourne sur toutes les pages, y compris légales. Aucun visuel lourd (positif). Métadonnées identiques sur toutes les pages ; sitemap pointant vers `localhost` ; `robots` interdit l’indexation (volontaire pour la démo).

### 1.11 Intégration future 3D / vidéo / ScrollTrigger

Faisable sans changer l’architecture : composants client déjà en place, aucune bibliothèque d’animation concurrente. Points d’attention : charger GSAP/Three.js en `dynamic import` uniquement sur l’accueil, respecter `prefers-reduced-motion` (déjà respecté globalement), prévoir des posters/fallbacks statiques, et fournir de vrais médias (aucune photo/vidéo officielle n’existe). Les sections de l’accueil exposent désormais des attributs `data-scene` comme points d’accroche.

## 2. Synthèse

**Fonctionne** : carte synchronisée avec le CRM, demandes de réservation et de commande à emporter, confirmation avec contrôle de chevauchement, permissions serveur, isolation des données privées, tests unitaires et E2E.

**Manque** : contenus réels (histoire, photos, horaires, spécialités, FAQ, avis), pages légales, espace client, horaires en base, disponibilités publiques, SEO par page, rendu serveur du contenu public.

**À améliorer** : lisibilité mobile, navigation, structure de l’accueil, accessibilité de base (fait dans cette intervention, voir §3).

**Dépendances techniques** : PGlite monoprocessus (pas de déploiement Vercel en l’état), migration Supabase documentée mais non réalisée, CSS global partagé CRM/site (risque d’effet de bord).

**Risques de régression** : (1) CSS global partagé — toute règle non préfixée peut toucher le CRM ; (2) tests E2E dépendants de libellés précis (titre H1 « Le goût du partage », champs « Votre nom », « Téléphone ou e-mail », « Date et heure », bouton « Demander une réservation », message `role=status`) ; (3) la route attrape-tout refuse toute page non listée.

## 3. Améliorations réalisées

1. **Header sticky** (`src/components/public/site-header.tsx`) : `position: sticky` (ne recouvre pas le contenu), se compacte au défilement, bouton « Réserver » toujours visible, navigation complète au-delà de 1150 px, menu mobile accessible (Radix Dialog : piège du focus, Échap, fermeture au clic), `aria-current` sur la page active.
2. **Navigation** (`src/components/public/navigation.ts`) : source unique pour header, menu mobile et footer. Cibles = routes existantes ou ancres de l’accueil ; aucun lien vers une page inexistante. Les adresses existantes sont conservées (`/histoire`, `/carte`, `/commander`, `/contact`, `/reservations`, pages légales).
3. **Accueil structuré** (`src/components/public/home-sections.tsx`) : introduction (hero existant, CTA réservation en premier), spécialités, histoire, aperçu de carte (données live du CRM), avis, appel à la réservation, FAQ, informations pratiques, footer complet. Chaque section a un `id`, un titre `h2` relié par `aria-labelledby` et un `data-scene`. Les contenus manquants sont signalés par un encadré « À fournir par le restaurant ».
4. **Design et accessibilité** (`src/app/public-site.css`, ajustements dans `globals.css`) : tokens limités à `.public-site`, tailles de texte minimales relevées (11 px pour les surtitres, 14–16 px pour le texte courant), boutons homogènes (primaire, contour, clair), lien d’évitement, `<main>`, `scroll-margin` sous le header, défilement doux désactivé si `prefers-reduced-motion`, icônes alignées, `aria-pressed` sur les onglets de carte, message de confirmation ramené à l’écran.

Contenus non inventés : les spécialités reprennent les trois familles déjà citées (couscous, tajines, thé à la menthe) sans prix ni description ; la FAQ ne décrit que le fonctionnement réel du site ; aucun avis, photo ou horaire n’a été créé.

## 4. Diagnostic des fonctionnalités futures (sans implémentation)

### A. Réservation par calendrier connecté aux disponibilités

Données existantes : `dining_tables(capacity, status)`, `reservations(starts_at, ends_at, guests, status, table_id)`, index `reservations_time`.

Manques et propositions (toutes nécessitent une **migration à valider**) :

- **Horaires** : aucune table. Ajouter `service_periods(restaurant_id, weekday, opens_at, closes_at, slot_minutes, turn_minutes)` et `closures(restaurant_id, date, reason)`.
- **Capacité** : calculer par créneau la capacité disponible = tables non `unavailable` dont la capacité ≥ couverts et sans chevauchement `confirmed/arrived`. Décider si les demandes `requested` bloquent provisoirement (recommandé : oui, avec expiration).
- **Endpoint public** : `GET /api/v1/availability?date=…&guests=…` renvoyant uniquement des créneaux agrégés (jamais de noms ni de contacts).
- **Droits de validation** : inchangés (`reservations` : SUPER_ADMIN, OWNER, MANAGER, WAITER). Option future : confirmation automatique sous un seuil, désactivable par le propriétaire.
- **Double réservation** : le contrôle actuel (SELECT de chevauchement puis UPDATE) est sûr avec PGlite (écritures sérialisées), **pas** sur un PostgreSQL multi-connexions (Supabase) en READ COMMITTED. Ajouter une contrainte d’exclusion `EXCLUDE USING gist (table_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status IN ('confirmed','arrived'))` (extension `btree_gist`) ou verrouiller la ligne `dining_tables` (`FOR UPDATE`) avant le contrôle.
- **Doublons publics** : ajouter une clé d’idempotence côté client (comme pour les commandes) et une limitation de débit.

### B. Agrégateur d’avis

- **Google** : l’API Places (Place Details) ne renvoie qu’un petit nombre d’avis « les plus pertinents », impose l’attribution et encadre la mise en cache ; l’API Google Business Profile donne accès à tous les avis de l’établissement vérifié mais requiert une demande d’accès. **Conditions à vérifier avant tout développement.**
- **Tripadvisor** : Content API soumise à approbation, nombre d’avis limité, règles d’affichage et d’attribution strictes. **À vérifier.**
- Alternative sans risque juridique : simple lien/badge vers les pages publiques de chaque plateforme.
- Modèle proposé (après validation) : `review_sources(restaurant_id, platform, external_id, enabled, display_order)` et, si les conditions le permettent, `featured_reviews(source_id, external_review_id, pinned)`. Récupération et cache côté serveur uniquement (clés API jamais exposées). Gestion réservée à une permission existante (`settings`, donc OWNER et SUPER_ADMIN) ou à une nouvelle permission dédiée.
- Pas de formulaire de dépôt d’avis interne (conforme à la demande).

### C. Espace client

Disponible aujourd’hui : route `/compte` (page d’information), table `customers`, fiche privée par jeton. Aucun compte client, aucune session client, aucun lien entre réservation et client.

Fonctionnalités proposées : consulter ses demandes et réservations (statut, date, couverts, table non exposée), annuler une demande `requested` ou une réservation `confirmed` avant un délai fixé par le restaurant, redemander un créneau, gérer son consentement fidélité.

Prérequis : authentification client de production (lien magique ou code par e-mail/SMS, donc un fournisseur d’envoi), table `customer_accounts` séparée des `profiles` du personnel (le RBAC du CRM ne doit pas être étendu aux clients), rattachement des réservations par contact vérifié, politique de conservation RGPD.

## 5. Problèmes restant à résoudre

- Contenus réels à fournir : histoire, photos/vidéos, spécialités, horaires, FAQ complète, plateformes d’avis.
- Pages légales et RGPD (bloquant pour la mise en ligne).
- Contenu public rendu uniquement côté client (SEO, premier affichage) ; polling sur toutes les pages.
- Métadonnées par page, données structurées `Restaurant`, sitemap avec la vraie origine.
- Demandes de réservation sans idempotence ni limitation de débit.
- CSS global de 2 000 lignes partagé avec le CRM.
- Onglets de carte sans sémantique complète de `tablist`.

## 6. Recommandations pour la prochaine intervention

1. Recueillir les contenus réels et rédiger les pages légales.
2. Passer le contenu public en Server Components (lecture directe de la carte et du restaurant), garder le polling uniquement là où il sert (carte, commande).
3. Métadonnées par page et données structurées.
4. Valider le modèle horaires/disponibilités puis développer le calendrier de réservation, avec contrainte d’exclusion anti-double réservation.
5. Choisir la typographie et la direction artistique définitives (polices web via `next/font`), puis introduire GSAP/ScrollTrigger sur les `data-scene` existants, chargés à la demande.
6. Vérifier les conditions Google/Tripadvisor avant tout développement de l’agrégateur d’avis.
