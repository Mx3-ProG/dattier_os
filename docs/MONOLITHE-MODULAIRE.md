# Un monolithe modulaire : un seul logiciel, des modules à la carte

Studio OS est un **monolithe modulaire**. Concrètement, c’est une seule application, déployée d’un bloc, avec une seule base de données. À l’intérieur, les fonctions sont découpées en **modules indépendants**. Chaque commerce active ceux dont il a besoin et désactive les autres, selon son activité.

Une boutique, un salon de coiffure, un artisan du BTP, un prestataire de services ou un restaurant utilisent donc le même logiciel. Chacun n’en voit que la partie utile à son métier.

> Document de référence pour les commerçants et les contributeurs. Le détail technique (contrats, droits SQL, plan de migration) est dans [platform/CORE-ET-MODULES.md](platform/CORE-ET-MODULES.md). La liste des modules est dans [`src/core/modules/manifest.ts`](../src/core/modules/manifest.ts).

## Pourquoi un monolithe modulaire

| Choix | Ce que ça apporte au commerçant |
| --- | --- |
| **Un seul logiciel** plutôt qu’une pile d’outils séparés | Une information saisie une fois est à jour partout : catalogue, stock, site, caisse, équipe. Un seul abonnement et une seule connexion. |
| **Des modules** plutôt qu’un bloc figé | Vous payez et vous voyez seulement ce qui sert votre activité. Les écrans ne sont pas encombrés de fonctions inutiles. |
| **Un seul déploiement** plutôt que des micro-services | Mises à jour simples et fiables, coûts d’hébergement contenus, auto-hébergement possible sur un seul serveur. |
| **Une base cloisonnée par commerce** | Les données d’un commerce ne sont jamais visibles depuis un autre. L’isolation est appliquée par PostgreSQL lui-même (RLS), à chaque requête. |

## Les trois étages

```
┌────────────────────────────────────────────────────────────────┐
│ Add-ons et outils métier  ← activables / désactivables à volonté │
├────────────────────────────────────────────────────────────────┤
│ Modules compris dans l’abonnement  (certains désactivables)      │
├────────────────────────────────────────────────────────────────┤
│ Core : comptes, commerces, droits, facturation, sécurité, socle  │
└────────────────────────────────────────────────────────────────┘
```

### 1. Le core (toujours présent)

C’est ce sans quoi aucun commerce ne peut exister : comptes et connexion, organisations et commerces, équipe et rôles, droits d’accès, abonnement et boutique d’add-ons, journal de sécurité, notifications, stockage des fichiers et file de tâches. Le core fonctionne sans aucun module activé. Il ne dépend jamais d’un module ; ce sont les modules qui s’appuient sur lui.

### 2. Les modules compris dans l’abonnement

Ils sont inclus dans l’abonnement Studio (39 € TTC par mois et par établissement, 7 jours d’essai gratuits) :

- **Pilotage** : vue d’ensemble, activité.
- **Opérations** : commandes, réservations, outils métier de votre famille d’activité. Commandes, cuisine et bar sont gratuits et désactivables.
- **Gestion** : catalogue (produits ou prestations), stock simple.
- **Équipe** : membres, invitations, rôles.
- **Finance** : rapports de ventes, rapprochement bancaire, versements.
- **Configuration** : réglages, sécurité opérationnelle.
- **Site internet et boutique en ligne** : compris. Le site est désactivable si vous n’en voulez pas.

### 3. Les add-ons (à la carte)

Ils s’ajoutent depuis la boutique d’add-ons de votre espace, commerce par commerce, et se retirent à tout moment. Exemples :

| Famille | Add-ons |
| --- | --- |
| Opérations | Plan de salle |
| Gestion | Recettes et compositions, fournisseurs, réceptions et lots |
| Équipe | Présences et pointage, paie |
| Finance | Comptabilité, dépenses, factures clients, factures fournisseurs |
| Relation client | Clients et fidélité, QR codes |
| Site et visibilité | Domaine personnalisé, add-ons de site, audience, estimation |
| Croissance | Scanner de prospects, pipeline CRM, suivi de la santé client |
| Exploitation | Mode hors ligne et conflits, connexions à d’autres outils |
| IA | Assistant IA, lecture automatique des factures (payés à l’usage avec les crédits IA) |

Le prix de chaque add-on est affiché TTC dans la boutique avant l’achat. Les **crédits Studio** (portefeuille en euros pour régler add-ons et abonnements) et les **crédits IA** (consommés par les fonctions d’intelligence artificielle) sont deux soldes distincts.

## Activer et désactiver selon son activité

- **À la création du commerce**, vous choisissez sa famille d’activité : restauration, beauté, commerce de détail, BTP, services ou autre. Les outils métier de cette famille s’installent automatiquement, et le vocabulaire des écrans s’adapte : « catalogue » plutôt que « carte », « préparation » plutôt que « cuisine »…
- **Ensuite, à tout moment**, la boutique d’add-ons permet d’ajouter ou de retirer un module. Les dépendances sont gérées pour vous : la boutique en ligne demande le site internet, la paie demande l’équipe, etc.
- **Désactiver ne supprime rien.** Un module retiré est suspendu : ses données sont conservées et réapparaissent si vous le réactivez.
- **Chaque commerce a ses propres modules.** Dans une organisation à plusieurs adresses, un salon peut avoir l’agenda et un autre commerce la boutique en ligne, sans que l’un voie les données de l’autre.
- **Les rôles restent la deuxième barrière.** Un module actif n’est visible que par les membres dont le rôle le permet.

## Pour les contributeurs

- Un module = une entrée du manifeste (`src/core/modules/manifest.ts`) : identifiant, famille, offre (`included`, `included-optional`, `addon-monthly`, `ai-credits`), dépendances, navigation et règle d’accès.
- L’accès est décidé côté serveur et en base par `app.module_available(commerce, module)`. L’interface n’est jamais la seule barrière.
- Un module se suspend sans perte de données (`lifecycle.preservesData`).
- `src/core/**` n’importe jamais `src/features/**`.
- Ajouter un add-on payant : suivre [platform/studio-os/BOUTIQUE-ADDONS.md](platform/studio-os/BOUTIQUE-ADDONS.md) et compléter toutes les listes SQL et TypeScript concernées.
