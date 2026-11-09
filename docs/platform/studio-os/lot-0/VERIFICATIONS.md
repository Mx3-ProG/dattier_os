# Vérifications du lot zéro — 8 novembre 2026

## Périmètre et méthode

Référence Git : `d084b3ce68dd09371ae575fe3dfeb7898f669b01`, branche `codex/atacuisine-consolidation`, complétée par l'état local non commité décrit dans REFERENCE.json (523 fichiers). Les empreintes incluent les fonctionnalités récentes de paiement, banque, RH et facturation. Les fichiers applicatifs ne sont pas modifiés par ce lot.

Les tests métier utilisent leurs bases de test. La compilation et les tests navigateur utilisent une copie isolée dans `/private/tmp/studio-os-lot0-rvcht70p`, sans fichiers `.env`, sans données habituelles et sans autres copies de travail. Les dépendances installées du dépôt sont réutilisées. Données navigateur : `/private/tmp/studio-os-lot0-rvcht70p/demo-data`. Serveur : `http://127.0.0.1:3198`.

## Résultats

| Contrôle | Résultat observé |
| --- | --- |
| Tests métier et intégration — `npm test` | **227 réussis**, 0 échec, 0 ignoré ; environ 92 secondes |
| Typage — `npx tsc --noEmit --incremental false` | **Réussi**, code de sortie 0 ; pas d'écriture de cache incrémental |
| Style — `npm run lint` dans le dépôt | **Échec de périmètre** : ESLint parcourt `.claude/worktrees/tenant-isolation/.next` et rencontre un fichier généré disparu (`ENOENT`) |
| Style — même commande sur copie isolée | **Réussi**, code de sortie 0 |
| Compilation — `npm run build -- --webpack` sur copie isolée | **Réussie**, Next.js 16.4.4, code de sortie 0 |
| Parcours navigateur — 14 tests existants sur copie compilée | **8 réussis, 6 échoués**, environ 5,6 minutes, code de sortie 1 |
| `git diff --check` | **Réussi** lors du contrôle |
| Comparaison des 523 empreintes après tests métier/compilation | **Aucun fichier de référence modifié** |

La première tentative de lancement local a été bloquée par une restriction d'ouverture de port (`EPERM`). Le premier lancement Playwright n'a donc pas constitué un contrôle fonctionnel exploitable. Serveur et navigateur ont ensuite été relancés avec l'autorisation d'exécution adaptée, toujours contre la copie isolée.

## Écarts navigateur à traiter avant bascule

| Scénario | Observation factuelle | Suite nécessaire |
| --- | --- | --- |
| Préférences personnelles (`appearance.spec.ts:63`) | Le sélecteur `.workspace` trouve deux éléments sur l'administration ; Playwright refuse l'ambiguïté | Déterminer le conteneur de thème de référence et vérifier l'imbrication avant correction du test ou de l'interface |
| Cycle manager (`extensions.spec.ts:49`) | La couche de tutoriel intercepte le clic sur « Ajouter un produit » | Définir explicitement l'état du guide dans ce scénario ; conserver les tests du guide séparés |
| Service complet (`journey.spec.ts:21`) | Le bouton de table 08 attendu n'est pas trouvé ; la capture montre l'espace QR et le guide d'accueil | Rendre l'entrée dans la salle explicite et vérifier le comportement initial du profil Salle |
| Deux profils (`journey.spec.ts:149`) | Attente du bouton table 07 jusqu'au délai maximal | Même vérification de navigation ; synchronisation et isolement non validés par ce scénario interrompu |
| Création de site mobile (`studio-creation.spec.ts`) | Bouton « Guide de création » attendu non trouvé | Vérifier le parcours/nom accessible actuel et la disponibilité du guide |
| Studio et sécurité (`studio-security.spec.ts:20`) | Bouton « Domaines » attendu non trouvé | Vérifier le type de contrôle et la navigation actuelle ; ne pas conclure à un succès publication/sécurité |

Les huit scénarios réussis couvrent les deux parcours d'accessibilité/apparence publique, l'API de préférences, cache/compte/impression, palette violet et navigation, PWA hors ligne avec rejeu, et les tutoriels jour/nuit. Ils ne compensent pas les étapes non atteintes dans les six scénarios échoués.

Ces écarts sont observés sur la référence non modifiée. Ils ne sont pas corrigés dans le lot zéro et ne prouvent pas tous un défaut métier : certains concernent des sélecteurs ou des préconditions de test. Leur résolution doit précéder la validation de non-régression des parcours touchés par les prochains lots.

## Portée réelle des preuves

- Le succès des tests PGlite ne remplace pas un test PostgreSQL réel avec les rôles de production.
- Les tests paiements utilisent Stripe simulé ; aucune transaction réelle ni activation d'abonnement n'est faite.
- Les tests d'extraction documentaire ne démontrent pas la précision d'un prestataire IA sur des factures réelles.
- Pas de revalidation OIDC/Keycloak réel, S3 distant, e-mail/SMS réel, domaine public/HTTPS, connexion bancaire ou transmission comptable.
- Pas de restauration coordonnée base/identités/médias, ni test de charge de production pendant ce lot.
- Les validations historiques de `docs/platform/VALIDATION.md` restent historiques et ne sont pas requalifiées comme résultats du jour.
- Aucun déploiement, commit, changement de secrets, migration d'une base existante ou modification des abonnements.

## Reproduction

Dans le dépôt, hors variables de connexion à une base réelle :

```sh
npm test
npx tsc --noEmit --incremental false
```

Pour lint/build/E2E, utiliser une copie des sources, tests, migrations, ressources publiques et configurations, sans `.env`, `.data`, `.next`, `.git`, copies de travail imbriquées ou secrets. Installer les dépendances du lockfile ou réutiliser les dépendances identiques localement. Prévoir un dossier `docs` pour les captures des tests historiques.

```sh
npm run lint
ATACUISINE_DEMO=true ATACUISINE_DATA_DIR=/private/tmp/studio-os-validation-demo NEXT_TELEMETRY_DISABLED=1 npm run build -- --webpack
ATACUISINE_DEMO=true ATACUISINE_DATA_DIR=/private/tmp/studio-os-validation-demo APP_URL=http://127.0.0.1:3198 npm run start -- --port 3198
# Dans un autre terminal, depuis la même copie isolée :
E2E_URL=http://127.0.0.1:3198 npm run test:e2e
```

Les tests navigateur réinitialisent la démo : ne pas remplacer cette URL par celle d'un environnement partagé. Les journaux retenus se trouvent dans `preuves/`. Les chemins temporaires ne sont pas des sauvegardes durables.
