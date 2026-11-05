# Versions, calendrier et maintenance

Dattier OS est un logiciel maintenu dans la durée : une mise à jour importante **tous les 6 mois**, des correctifs entre les deux, et une annonce publique de chaque date. Ce document est la référence ; le calendrier affiché sur `/source` et sur l’accueil vient de [`src/lib/releases.ts`](../src/lib/releases.ts), à garder aligné avec ce fichier.

**Version actuelle : 1.0.0** (publiée le 3 novembre 2026).

## Numérotation

Les versions suivent le format `MAJEURE.MINEURE.CORRECTIVE` ([Semantic Versioning](https://semver.org/lang/fr/)) :

| Type       | Exemple           | Contenu                                                                                              | Rythme                                                                             |
| ---------- | ----------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Majeure    | 1.x → **2.0.0**   | Changement profond (structure des données, parcours revus). Peut demander une migration accompagnée. | Annoncée au moins 6 mois à l’avance, pas de date fixée aujourd’hui                 |
| Mineure    | 1.0.x → **1.1.0** | Nouvelles fonctionnalités, mise à niveau du socle technique. Compatible avec la version précédente.  | Tous les 6 mois, à date fixe                                                       |
| Corrective | 1.1.0 → **1.1.1** | Corrections de bugs et de sécurité uniquement.                                                       | Le premier mardi du mois si nécessaire ; immédiatement pour une faille de sécurité |

Exemple : on passe de la 1.0.1 (correctifs) à la 1.1.0 au printemps, puis à la 1.2.0 à l’automne.

## Calendrier

Les mises à jour mineures sortent le **premier mardi de mai et de novembre**. Les dates à venir sont prévisionnelles : elles ne bougent qu’avec une annonce publique au moins un mois avant.

| Version   | Date                | Statut                        | Contenu                                                                                                                               |
| --------- | ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0.0.1     | 14 octobre 2026     | Publiée                       | Starter : commandes, réservations, équipe, stocks, niveaux d’accès                                                                    |
| **1.0.0** | **3 novembre 2026** | **Publiée, version actuelle** | Plateforme multi-structures cloisonnée, offres Essentiel et Premium, studio de site, boutique, espace client, sécurité opérationnelle |
| 1.1.0     | 4 mai 2027          | Prévue                        | Retours des restaurateurs, mise à niveau des dépendances                                                                              |
| 1.2.0     | 2 novembre 2027     | Prévue                        | Fonctionnalités annoncées au printemps 2027, mise à niveau du socle                                                                   |
| 1.3.0     | 2 mai 2028          | Prévue                        | Contenu défini six mois avant                                                                                                         |
| 1.4.0     | 7 novembre 2028     | Prévue                        | Contenu défini six mois avant                                                                                                         |

Le contenu de chaque version mineure est arrêté **six mois avant sa sortie**, c’est-à-dire au moment de la version précédente.

## Maintenance et support

- **Version mineure la plus récente** : toutes les corrections (bugs et sécurité).
- **Version mineure précédente** : correctifs de sécurité pendant 6 mois après la sortie de la suivante. Chaque version est donc maintenue environ 12 mois.
- **Failles de sécurité** : correctif publié dès qu’il est prêt, sans attendre le calendrier. Signalement : voir [SECURITY.md](../SECURITY.md).
- **Instances hébergées** : mises à jour appliquées par nos soins, sans action du restaurateur.
- **Instances auto-hébergées** : mise à jour avec `git pull`, `npm run db:migrate`, puis redémarrage (voir [SELF_HOSTING.md](platform/SELF_HOSTING.md)). Les migrations de base sont toujours fournies et passent d’une version à la suivante.

| Version | Support complet jusqu’au | Correctifs de sécurité jusqu’au |
| ------- | ------------------------ | ------------------------------- |
| 1.0.x   | 4 mai 2027               | 2 novembre 2027                 |
| 1.1.x   | 2 novembre 2027          | 2 mai 2028                      |
| 1.2.x   | 2 mai 2028               | 7 novembre 2028                 |

## Publier une version

1. Mettre à jour `version` dans `package.json`.
2. Mettre à jour `CURRENT_VERSION` et passer `released: true` sur la version dans `src/lib/releases.ts`.
3. Ajouter l’entrée dans [CHANGELOG.md](../CHANGELOG.md) et mettre à jour les tableaux ci-dessus.
4. Vérifier : `npm run typecheck && npm run lint && npm test && npm run build`.
5. Créer le tag Git `vX.Y.Z` et la release correspondante sur le dépôt.
6. Pour une mineure : ajouter la mineure suivante au calendrier (6 mois plus tard) et arrêter son contenu.
