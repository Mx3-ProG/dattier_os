# Dattier OS

OS open source pour les restaurateurs : commandes, salle, cuisine, bar, stocks, achats, équipes, clients, fidélité, boutique et sites par établissement.

**AGPL-3.0-only** · France en premier · installation auto-hébergeable. Une organisation peut gérer plusieurs restaurants et plusieurs rôles par utilisateur. L’abonnement hébergé de 20–30 € est une hypothèse économique, pas une offre activée.

## Essayer localement

```sh
npm ci
# Créer .env.local à partir de .env.example seulement s’il n’existe pas déjà.
npm run dev
```

La démonstration est sur `/demo`, le poste de travail sur `/dashboard`. Les données sont fictives et conservées dans un dossier explicitement nommé `demo`. Un seul processus peut ouvrir ce dossier. [Guide de la démonstration](docs/LOCAL_DEMO.md).

## Nouvelle plateforme

- `/platform` : organisations et établissements, création guidée et accès aux modules.
- `/restaurant/<id>` : équipe, boutique, avis, site, domaines, achats, inventaires et journal.
- `/r/<id>` : vitrine, commande, réservations et espace client du restaurant.
- `/offline?restaurant=<id>` : appareils, quotas de stock et tickets conservés sur chaque appareil.
- `/source` : accès au code de la version distribuée.

L’authentification de production utilise OIDC/Keycloak. Les identités clients sont rattachées séparément à chaque organisation. Les profils de démonstration ne sont pas utilisables en production.

## Auto-héberger

```sh
npm run setup:env
# Renseigner domaines, SMTP de l’identité et URL des sources exactes.
docker compose --env-file .env.production up --build -d
```

[Installation et exploitation](docs/platform/SELF_HOSTING.md) · [Architecture et API](docs/platform/ARCHITECTURE.md) · [Reprise Donuts](docs/platform/FEATURE_MATRIX.md) · [Migration et import](docs/platform/MIGRATION.md).

La composition fournie est une installation sur un seul hôte. Elle n’est pas une topologie haute disponibilité pour 500 restaurants. Les migrations utilisent un rôle dédié ; l’application refuse une connexion propriétaire ou dotée de BYPASSRLS. PostgreSQL, identité et stockage ne sont pas exposés directement sur Internet.

## Vérifier

```sh
npm run typecheck
npm run lint
npm test
npm run build -- --webpack
```

Les scénarios PostgreSQL réels et de charge utilisent exclusivement des bases jetables. Les tests navigateur historiques réinitialisent la démonstration : [instructions et résultats](docs/platform/VALIDATION.md).

## État et limites

Les parcours locaux et les contrôles SQL sont vérifiables ; leur présence ne vaut pas lancement commercial. Paiements en ligne, caisse, paie, comptabilité et livraison ne sont pas raccordés à des comptes prestataires. Les exports de ventes/pointages sont des données à rapprocher, sans prétention de conformité comptable ou de paie.

Le mode hors ligne fonctionne par appareils indépendants : aucun transfert automatique de ticket pendant une coupure. Quotas et opérations locales doivent être réconciliés avant de retirer un appareil. Un navigateur effacé peut perdre ses opérations non synchronisées.

[État détaillé](docs/platform/IMPLEMENTATION_STATUS.md) · [Hypothèses de coûts](docs/platform/COSTS.md) · [Contribuer](CONTRIBUTING.md) · [Sécurité](SECURITY.md) · [Notices tierces](THIRD_PARTY_NOTICES.md).

### Studio du site et sécurité

Après connexion, « Mon site web » ouvre l’éditeur complet repris des Temps des Donuts. Il permet d’ajouter des sections et pages, de personnaliser Ma story, l’identité, les polices et le référencement, puis de prévisualiser, publier et restaurer une version. « Sécurité opérationnelle » ouvre le journal, les incidents, corrections et archives, avec accès limité au restaurant courant. Voir [l’état détaillé](docs/platform/IMPLEMENTATION_STATUS.md).
