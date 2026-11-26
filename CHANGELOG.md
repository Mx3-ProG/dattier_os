# Journal des versions

Toutes les évolutions notables de Studio OS. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation [SemVer](https://semver.org/lang/fr/). Calendrier et politique de maintenance : [docs/RELEASES.md](docs/RELEASES.md).

## [Non publié]

- Tutoriel et guide : vocabulaire « commerce » à la place de « restaurant », fenêtre d’accueil de la visite guidée ajustée aux écrans de téléphone.

## [1.0.0] — 2026-11-14 · Lancement officiel

Première version stable, opérationnelle en production depuis le samedi 14 novembre 2026.

### Plateforme

- **Multi-commerces** : restauration, beauté, commerce de détail, BTP, services et autres activités. Le vocabulaire des écrans s’adapte au métier.
- **Monolithe modulaire** : un core toujours présent, des modules compris dans l’abonnement et des add-ons activables ou désactivables par commerce, sans perte de données ([docs/MONOLITHE-MODULAIRE.md](docs/MONOLITHE-MODULAIRE.md)).
- **Organisations à plusieurs établissements**, données cloisonnées par la base (RLS) pour chaque commerce.
- **Abonnement Studio** à 39 € TTC par mois et par établissement, 7 jours d’essai gratuits, paiement Stripe, boutique d’add-ons, crédits Studio et crédits IA.

### Modules compris

- Vue d’ensemble, activité, commandes, cuisine et bar, réservations, catalogue, stock simple, outils métier par famille d’activité.
- Équipe et rôles, finance et rapports, rapprochement bancaire, versements, sécurité opérationnelle.
- Site internet avec studio d’édition, modèles, référencement et publication versionnée (désactivable), boutique en ligne.

### Add-ons

- Plan de salle, recettes, fournisseurs et réceptions, présences et paie, comptabilité, dépenses, factures clients et fournisseurs, fidélité, QR codes, audience, estimation, CRM, mode hors ligne, connexions, assistant IA.

### Accompagnement

- Visite guidée interactive « Bien démarrer » et guide d’utilisation complet sur `/guide`.
- Démonstration publique sur données fictives.

## [0.1.x] — 2026-11-03 au 2026-11-12 · Préversions

- 0.1.3 : modèles de sites, optimisation des images, service worker.
- 0.1.4 et 0.1.5 : découpage en monolithe modulaire, add-ons et écrans de chargement, consolidation du pilotage.
- 0.1.6 et 0.1.7 : consolidation des modules, paiements et CRM, site public, administration de la plateforme, facturation Stripe des abonnements et des add-ons, campagnes marketing.

Le commit du 3 novembre 2026 intitulé « V1.0.0 » posait la structure de la plateforme. Il a été publié ensuite sous forme de préversions 0.1.x, jusqu’au lancement officiel du 14 novembre.

## [0.0.1] — 2026-10-14 · Starter

- Premier socle : commandes, réservations, personnel et stocks.
- Plusieurs niveaux d’utilisateurs avec des droits d’accès distincts.
- Site public et réservation visuelle.
