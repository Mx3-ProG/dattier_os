# Lot 4 — Pilotage configurable et préférences de compte

## Fonctionnement livré

La vue d’ensemble propose « Personnaliser mon pilotage ». Les quatre indicateurs et six blocs existants restent visibles par défaut. Chacun peut être masqué individuellement ; « Tout réafficher » restaure la vue complète, y compris après avoir tout masqué.

Les choix peuvent être enregistrés dans le compte par établissement via « Enregistrer dans mon compte ». Ils sont récupérés à l’ouverture de la vue sur un autre appareil. Le navigateur conserve un aperçu local et synchronise cet aperçu entre ses onglets. Les choix locaux antérieurs sont proposés pour une première sauvegarde explicite, sans import automatique. Un contenu local invalide rétablit les valeurs par défaut.

## Architecture et conservation

`src/features/pilotage/catalog.ts` décrit les dix contributions existantes avec identifiant stable, libellé, type et source fonctionnelle. Les sources décrivent leur provenance ; elles ne prétendent pas être des modules déjà activables dans la boutique. Le hook de préférences est séparé de ce catalogue et du rendu des blocs. Les identifiants inconnus sont ignorés.

Les calculs métier, droits commerciaux et contenus du snapshot sont conservés. La synchronisation ajoute une table privée et une route protégée de préférences, décrites ci-dessous. Le Pilotage financier détaillé conserve ses périodes, indicateurs et exports. Masquer une carte ne désactive pas un module, n'arrête pas sa facturation et ne constitue pas une protection des données. Les autorisations continuent de relever du serveur.

Cette première étape prépare des contributions modulaires sans annoncer une configuration métier universelle déjà opérationnelle. La sélection des contributions selon les modules réellement activés, et les futures configurations métier restent à réaliser. Les calculs et rendus historiques restent dans leur composant actuel.

## Validation de la première étape locale

Résultats de vérification locale consignés après les contrôles. Aucun déploiement ni migration de production.

- 242 tests métier réussis, aucun échec, dont validation des préférences, valeurs par défaut et séparation des clés établissement/personne.
- TypeScript, ESLint ciblé et compilation de production Webpack réussis.
- Parcours Playwright ciblé réussi dans une copie temporaire sans secrets : masquage, rechargement, synchronisation entre onglets, isolation propriétaire/comptable, masquage intégral et restauration. Contrôle de largeur à 390 px et capture mobile examinée.
- Les premières tentatives du test ont identifié des préconditions : tutoriel d'accueil à marquer comme déjà vu et profil disposant réellement de `finance` (le manager n'accède pas à la vue d'ensemble). Aucun droit n'a été élargi pour le test.
- Le test durable est `tests/e2e/pilotage.spec.ts`. La séparation entre établissements est couverte par les tests de clés ; le parcours navigateur utilise un seul établissement.
- À cette première étape, la synchronisation entre appareils, l’achat Stripe et la désactivation effective des modules n’étaient pas validés. La synchronisation est ajoutée ci-dessous ; Stripe et la désactivation restent hors périmètre.


## Suite — Synchronisation du compte

Migration additive 044 : `pilotage_preferences`, clé établissement/profil, liste bornée de blocs et numéro de révision. L’enregistrement utilise la révision lue : deux appareils ne peuvent pas écraser silencieusement la même version. Un conflit propose de recharger les préférences ; les choix restent visibles pour permettre de les comparer avant de les remplacer.

La route GET/PUT `/api/restaurants/[restaurant]/pilotage` applique session, périmètre d’établissement et permission finance (celle de la vue d’ensemble). Le profil provient de la session, jamais du corps envoyé. L’en-tête de compte refuse une sauvegarde issue d’un onglet dont la session a changé. Origine, taille du corps, validation stricte et limite de requêtes protègent les écritures. La base restreint les lignes au profil et à l’établissement courant, hors accès public.

Les réponses tardives après changement de profil ou d’établissement sont ignorées. Un échec réseau laisse les choix non enregistrés et permet de réessayer. La mémoire du navigateur permet de travailler lorsque son stockage local est interdit ; la persistance entre appareils dépend toujours d’une sauvegarde serveur réussie. « Recharger mes préférences » remplace l’aperçu par les choix du compte. Les modifications d’un autre appareil sont récupérées au rechargement, pas poussées en temps réel.

Migration préparée et testée uniquement en local, aucune application à la production. Les essais utilisent une copie temporaire sans secrets et une base de démonstration isolée.

### Vérification de la synchronisation

- 245 tests métier réussis ; nouveaux tests de persistance, validation, conflits de révision, rôles, isolation profil/établissement et refus du canal public au niveau SQL.
- Deux parcours navigateur réussis : conservation et restauration des choix, isolation propriétaire/comptable, deux contextes indépendants simulant deux appareils, conflit entre sauvegardes, rechargement, échec réseau puis nouvelle tentative, refus d’un compte d’onglet périmé et d’une origine étrangère.
- TypeScript, ESLint ciblé, compilation de production Webpack et contrôle des espaces du diff réussis.
- Les premiers essais navigateur ont nécessité de préciser le sélecteur de statut (le thème possède aussi un statut accessible) et de sauvegarder explicitement la restauration dans l’ancien test. Les deux parcours finaux passent.
- Validation locale PGlite et navigateur ; aucune connexion à une base de production, aucun déploiement. Cette étape ne valide pas les paiements Stripe ni la désactivation commerciale des modules.
