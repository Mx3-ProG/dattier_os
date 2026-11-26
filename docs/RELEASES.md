# Versions, calendrier et maintenance

## La V1 est lancée

**Studio OS 1.0.0 est officiellement lancé.** Depuis le **samedi 14 novembre 2026**, la V1 est opérationnelle et fonctionnelle en production. Elle permet dès aujourd’hui aux commerçants de gagner un temps réel au quotidien. Commandes, catalogue, stock, équipe, finance, site internet et boutique en ligne sont réunis dans un seul outil. Une information saisie une fois est à jour partout : plus de ressaisie entre plusieurs logiciels, plus de tableurs le soir.

Studio OS est un logiciel maintenu dans la durée. Il reçoit une mise à jour importante **tous les 6 mois**, des correctifs entre les deux, et chaque date est annoncée publiquement.

**Version actuelle : 1.0.0**, en production depuis le 14 novembre 2026.

## Numérotation

Les versions suivent le format `MAJEURE.MINEURE.CORRECTIVE` ([Semantic Versioning](https://semver.org/lang/fr/)) :

| Type | Exemple | Contenu | Rythme |
| --- | --- | --- | --- |
| Majeure | 1.x → **2.0.0** | Changement profond (structure des données, parcours revus). Peut demander une migration accompagnée. | Annoncée au moins 6 mois à l’avance. Aucune n’est prévue aujourd’hui. |
| Mineure | 1.0.x → **1.1.0** | Nouvelles fonctionnalités, nouveaux modules ou add-ons, mise à niveau du socle technique. Compatible avec la version précédente. | Tous les 6 mois, à date fixe |
| Corrective | 1.1.0 → **1.1.1** | Corrections de bugs et de sécurité uniquement. | Le premier mardi du mois si nécessaire ; tout de suite pour une faille de sécurité |

Exemple : on passe de la 1.0.1 (correctifs) à la 1.1.0 au printemps, puis à la 1.2.0 à l’automne.

## Calendrier

Les mises à jour mineures sortent le **premier mardi de mai et de novembre**. Les dates à venir sont prévisionnelles : elles ne changent qu’avec une annonce publique au moins un mois avant.

| Version | Date | Statut | Contenu |
| --- | --- | --- | --- |
| 0.0.1 | 14 octobre 2026 | Préversion | Premier socle : commandes, réservations, équipe, stocks, niveaux d’accès |
| 0.1.x | 3 au 12 novembre 2026 | Préversions | Plateforme multi-commerces, monolithe modulaire, boutique d’add-ons, facturation Stripe, modèles de sites |
| **1.0.0** | **14 novembre 2026** | **Lancement officiel, version actuelle** | V1 opérationnelle en production (voir le [journal des versions](../CHANGELOG.md)) |
| 1.1.0 | 4 mai 2027 | Prévue | Retours des premiers commerçants, nouveaux add-ons, mise à niveau des dépendances |
| 1.2.0 | 2 novembre 2027 | Prévue | Fonctionnalités annoncées au printemps 2027, mise à niveau du socle |
| 1.3.0 | 2 mai 2028 | Prévue | Contenu arrêté six mois avant |
| 1.4.0 | 7 novembre 2028 | Prévue | Contenu arrêté six mois avant |

Le contenu de chaque version mineure est arrêté **six mois avant sa sortie**, c’est-à-dire à la sortie de la version précédente.

## Maintenance et support

- **Version mineure la plus récente** : toutes les corrections (bugs et sécurité).
- **Version mineure précédente** : correctifs de sécurité pendant 6 mois après la sortie de la suivante. Chaque version est donc maintenue environ 12 mois.
- **Failles de sécurité** : correctif publié dès qu’il est prêt, sans attendre le calendrier. Pour signaler une faille, voir [SECURITY.md](../SECURITY.md).
- **Offre hébergée** : les mises à jour sont appliquées par nos soins, sans action du commerçant. Les modules et add-ons activés restent activés.
- **Auto-hébergement** : `git pull`, `npm run db:migrate`, puis redémarrage (voir [SELF_HOSTING.md](platform/SELF_HOSTING.md)). Les migrations de base sont toujours fournies d’une version à la suivante.

| Version | Support complet jusqu’au | Correctifs de sécurité jusqu’au |
| --- | --- | --- |
| 1.0.x | 4 mai 2027 | 2 novembre 2027 |
| 1.1.x | 2 novembre 2027 | 2 mai 2028 |
| 1.2.x | 2 mai 2028 | 7 novembre 2028 |

## Publier une version

1. Mettre à jour `version` dans `package.json`.
2. Ajouter l’entrée dans [CHANGELOG.md](../CHANGELOG.md) et mettre à jour les tableaux ci-dessus.
3. Vérifier : `npm run typecheck && npm run lint && npm test && npm run build`.
4. Créer le tag Git `vX.Y.Z` et la release correspondante sur le dépôt.
5. Pour une mineure : ajouter la mineure suivante au calendrier (6 mois plus tard) et arrêter son contenu.
