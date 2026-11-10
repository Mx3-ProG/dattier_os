# Lot 7 — Activation effective des modules

## État local au 9 novembre 2026

Les modules **Salle** et **Réservation de tables** disposent d’un état demandé et d’un état appliqué par établissement. Un administrateur de l’organisation peut les suspendre et les réactiver dans Add-ons. La demande et l’application sont deux opérations distinctes, chacune avec une révision contrôlée. L’absence de réglage conserve le comportement historique. Les offres Basic, Pro et Premium incluent toujours ces deux modules.

L’application refuse une suspension qui laisserait des services de table ouverts, des commandes de table actives ou des réservations à venir. La dépendance Réservations → Salle est contrôlée. La décision appliquée est lue dans les actions serveur, le calendrier et les disponibilités, les projections et la navigation. Les nouvelles réservations et sessions de table sont aussi bloquées par des déclencheurs SQL, dans la transaction de changement d’état. Les droits de chaque membre restent nécessaires.

Les migrations 047 et 050 créent le journal des demandes, l’état appliqué et les garde-fous transactionnels. La route `/api/restaurants/[restaurant]/modules` fournit l’aperçu, le précontrôle, la demande et l’application. Les changements ne concernent que l’établissement sélectionné.

## Vérification

Tests ciblés PGlite et TypeScript réussis. Migrations 001 à 052 appliquées sur une base PostgreSQL 16 locale vierge, puis contrôles PostgreSQL de l’isolation, des rôles, des modules et des autres domaines réussis. Aucun parcours navigateur hébergé ni déploiement sur `atacuisine.vercel.app` n’a été réalisé : cette adresse est l’application existante, et les changements du dépôt ne sont pas encore committés.

## Suite

Étendre le même mécanisme aux autres modules après avoir raccordé leurs droits commerciaux, dépendances et points d’entrée serveur. Vérifier le parcours navigateur complet sur une préproduction isolée avant ouverture commerciale.
