# Studio OS

Le logiciel de gestion des commerçants : commandes, catalogue, stock, équipe, finance, clients, site internet et boutique en ligne, dans un seul outil. Restauration, beauté, commerce de détail, BTP, services : chaque commerce n’active que les modules utiles à son activité.

**Version 1.0.0** · **AGPL-3.0-only** · France en premier · installation auto-hébergeable.

## V1 lancée le 14 novembre 2026

Studio OS 1.0.0 est officiellement lancé. Depuis le **samedi 14 novembre 2026**, la V1 est opérationnelle et fonctionnelle en production. Elle fait gagner un temps réel au quotidien : une information saisie une fois est à jour partout, sans ressaisie entre plusieurs logiciels. Une mise à jour importante sort ensuite tous les 6 mois. [Versions et calendrier](docs/RELEASES.md) · [Journal des versions](CHANGELOG.md).

## Un monolithe modulaire

Une seule application et une seule base de données, découpées en modules indépendants :

- un **core** toujours présent : comptes, commerces, équipe et rôles, droits, abonnement, sécurité ;
- des **modules compris** dans l’abonnement (commandes, réservations, catalogue, stock simple, finance, site internet…), dont certains sont désactivables ;
- des **add-ons** à ajouter ou retirer à tout moment, commerce par commerce, selon votre activité et vos besoins : plan de salle, recettes, fournisseurs, paie, comptabilité, fidélité, CRM, mode hors ligne, assistant IA…

Retirer un module ne supprime pas ses données. Une organisation peut gérer plusieurs commerces ; chacun a ses propres modules et ses données cloisonnées par PostgreSQL (RLS). L’offre hébergée coûte 39 € TTC par mois et par établissement, avec 7 jours d’essai. [Comprendre le monolithe modulaire](docs/MONOLITHE-MODULAIRE.md) · [Core et modules, détail technique](docs/platform/CORE-ET-MODULES.md) · [Facturation](docs/platform/BILLING.md).

## Essayer localement

```sh
npm ci
# Créer .env.local à partir de .env.example seulement s’il n’existe pas déjà.
npm run dev
```

La démonstration est sur `/demo`, le poste de travail sur `/dashboard`, le guide d’utilisation complet sur `/guide`. Dans le poste, le bouton « Guide » ouvre la visite interactive (parcours adaptés au rôle et au métier, contenu partagé avec `/guide` dans `src/features/guide/content.ts`) ; `/dashboard?tour=all` ou `?tour=<parcours>` la lance directement. Les données sont fictives et conservées dans un dossier explicitement nommé `demo`. Un seul processus peut ouvrir ce dossier. [Guide de la démonstration](docs/LOCAL_DEMO.md).

## Nouvelle plateforme

- `/platform` : organisations et commerces, création guidée, boutique d’add-ons et accès aux modules.
- `/restaurant/<id>` : administration d’un commerce (équipe, boutique, avis, site, domaines, achats, inventaires et journal). Le nom de route est historique : il désigne tout type de commerce.
- `/r/<id>` : vitrine, commande, réservations et espace client du commerce.
- `/offline?restaurant=<id>` : appareils, quotas de stock et tickets conservés sur chaque appareil.
- `/source` : accès au code de la version distribuée.
- `/guide` : guide d’utilisation et point d’entrée de la visite guidée.

L’authentification de production utilise OIDC/Keycloak. Les identités clients sont rattachées séparément à chaque organisation. Les profils de démonstration ne sont pas utilisables en production.

## Auto-héberger

```sh
npm run setup:env
# Renseigner domaines, SMTP de l’identité et URL des sources exactes.
docker compose --env-file .env.production up --build -d
```

[Installation et exploitation](docs/platform/SELF_HOSTING.md) · [Architecture et API](docs/platform/ARCHITECTURE.md) · [Reprise Donuts](docs/platform/FEATURE_MATRIX.md) · [Migration et import](docs/platform/MIGRATION.md).

La composition fournie est une installation sur un seul hôte. Elle n’est pas une topologie haute disponibilité pour 500 commerces. Les migrations utilisent un rôle dédié ; l’application refuse une connexion propriétaire ou dotée de BYPASSRLS. PostgreSQL, identité et stockage ne sont pas exposés directement sur Internet.

## Vérifier

```sh
npm run typecheck
npm run lint
npm test
npm run build -- --webpack
```

Les scénarios PostgreSQL réels et de charge utilisent exclusivement des bases jetables. Les tests navigateur historiques réinitialisent la démonstration : [instructions et résultats](docs/platform/VALIDATION.md).

## État et limites

Caisse, paie, comptabilité et livraison ne sont pas raccordées à des comptes prestataires. Le paiement en ligne est développé mais fermé sans clé Stripe, et n’a été vérifié qu’avec Stripe simulé ([détails](docs/platform/ONLINE_PAYMENTS.md)). Les exports de ventes/pointages sont des données à rapprocher, sans prétention de conformité comptable ou de paie.

Le mode hors ligne fonctionne par appareils indépendants : aucun transfert automatique de ticket pendant une coupure. Quotas et opérations locales doivent être réconciliés avant de retirer un appareil. Un navigateur effacé peut perdre ses opérations non synchronisées.

[Versions et calendrier](docs/RELEASES.md) · [Journal des versions](CHANGELOG.md) · [Monolithe modulaire](docs/MONOLITHE-MODULAIRE.md) · [État détaillé](docs/platform/IMPLEMENTATION_STATUS.md) · [Hypothèses de coûts](docs/platform/COSTS.md) · [Contribuer](CONTRIBUTING.md) · [Sécurité](SECURITY.md) · [Notices tierces](THIRD_PARTY_NOTICES.md).

### Studio du site et sécurité

Après connexion, « Mon site web » ouvre l’éditeur complet repris des Temps des Donuts. Il permet d’ajouter des sections et pages, de personnaliser Ma story, l’identité, les polices et le référencement, puis de prévisualiser, publier et restaurer une version. « Sécurité opérationnelle » ouvre le journal, les incidents, corrections et archives, avec accès limité au commerce courant. Voir [l’état détaillé](docs/platform/IMPLEMENTATION_STATUS.md).

### Démo publique

La démo tourne sur une instance Docker dédiée, accessible via un proxy HTTPS sur
un sous-domaine distinct. Elle utilise les profils fictifs et une base locale
partagée par les visiteurs. Les modifications disparaissent quand le conteneur
est recréé.

Dans cette instance, les add-ons payants visibles dans la boutique et les
abonnements mensuels sont ouverts à l’essai, avec leur prix TTC toujours affiché.
Aucun achat ni abonnement Stripe n’est créé. Cette ouverture s’applique seulement
à l’instance de démonstration ; les établissements du site commercial conservent
leurs droits payants habituels.

```sh
DEMO_APP_URL=https://demo.example.com \
ATACUISINE_PURCHASE_URL=https://app.example.com/#offres \
docker compose -f compose.demo.yaml up -d --build
```

Sur l’hôte Docker, dirigez le proxy HTTPS vers `127.0.0.1:3100`. Sur
l’instance commerciale, configurez
`ATACUISINE_PUBLIC_DEMO_URL=https://demo.example.com/demo` pour afficher le
lien « Essayer la démo ». Gardez les paramètres de production (PostgreSQL,
identité, paiement et messagerie) sur l’instance commerciale.

### Démo publique sur Vercel (lecture et essai, remise à zéro)

La démo publique tourne sur un **projet Vercel séparé** (ex. `demo.studio-os.digital`),
branché sur le même dépôt. Elle charge en mémoire l’instantané
`database/demo-snapshot/studio-demo.tar.gz` : rien n’est écrit sur disque, les
modifications des visiteurs disparaissent au redémarrage de chaque instance.

1. Figer la démo locale : `npm run demo:snapshot` (lit une copie de
   `.data/atacuisine-demo`, efface sessions et journaux techniques), puis commiter l’instantané.
2. Variables du projet démo : `ATACUISINE_DEMO=true`, `ATACUISINE_PUBLIC_DEMO=true`,
   `ATACUISINE_DATA_DIR=/tmp/atacuisine-demo`, `SESSION_SECRET` (32 caractères ou plus),
   `APP_URL=https://demo.studio-os.digital`, `ATACUISINE_PURCHASE_URL=https://www.studio-os.digital/#offres`.
   Ne définir **aucune** clé Stripe, Anthropic, Resend, Twilio, S3 ni `DATABASE_URL`.
3. Sur le site commercial : `ATACUISINE_PUBLIC_DEMO_URL=https://demo.studio-os.digital`
   affiche « Me projeter dans la démo » sur la Home et « Explorer la démo » sur `/guide`.
