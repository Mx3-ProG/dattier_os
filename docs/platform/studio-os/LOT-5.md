# Lot 5 — Navigation modulaire, premier branchement

## Livré

Le tableau de bord utilise un catalogue de contributions, séparé de son rendu React. Les 29 entrées actuelles conservent leurs noms, ordre, icônes, groupes, permissions et liens. La même liste résolue alimente le menu latéral, la navigation mobile et les modules transmis au guide.

Le contrat `src/core/navigation/registry.ts` décrit identifiant, libellé, groupe, icône, permission, capacité commerciale nommée et éventuel add-on. Les seuils de compatibilité proviennent de la table commune `legacyMinimum`. L’enregistrement refuse les identifiants invalides ou dupliqués et les seuils invalides. Les données du registre sont protégées contre les mutations des appelants par copies indépendantes.

Les 29 entrées sont déclarées dans les fichiers `navigation.ts` de leurs 19 domaines fonctionnels. Le catalogue restauration compose ces contributions dans l’ordre historique. Salle et Réservation de tables ont été les premiers domaines raccordés ; les autres sont désormais extraits également. L’association des icônes React reste dans l’interface ; le contrat ne transporte ni composants, ni services serveur.

La résolution préserve l’exception Factures fournisseurs : l’add-on vérifié dans le snapshot peut rendre son entrée accessible hors forfait supérieur, mais ne remplace jamais la permission finance et ne débloque pas Banque ou les autres rubriques financières. La sélection de page conserve les liens directs, les pages par défaut Cuisine/Bar et le repli vers une entrée autorisée si la page demandée n’est pas accessible.

## Limites et compatibilité

Le catalogue est une configuration restauration, pas une preuve que les configurations coiffure/BTP existent. Les contributions sont séparées ; l’extraction complète des services et interfaces métier reste progressive. Les pages et leurs chargements différés restent en place ; aucun moteur métier n’est réécrit.

Les seuils historiques sont explicitement une passerelle de compatibilité : ce lot n’étend pas les offres payantes, ne change pas les tarifs et ne remplace pas le moteur de droits serveur. Le registre de navigation est un outil de présentation ; cacher une entrée ne protège pas une route. Les contrôles serveur, périmètres d’établissement et règles SQL demeurent exécutoires.

Il n’y a pas encore de nouvelle commande permettant de désactiver commercialement Salle ou Réservations. Le branchement aux états persistants d’activation doit couvrir services, projections, navigation, commandes en cours et dépendances avant d’être proposé. Aucune suspension factice par simple masquage n’est ajoutée.

Les écarts navigateur du lot zéro restent documentés ; les sélecteurs de ce lot ciblent les entrées de navigation existantes et neutralisent uniquement le tutoriel déjà vu pour le scénario de test. Aucun succès de la suite navigateur complète n’est revendiqué.

## Vérification locale

- 250 tests métier réussis. Le jeu de référence du menu antérieur est conservé dans `tests/fixtures/workspace-navigation-legacy.json`.
- Comparaison des décisions pour les neuf rôles, un profil sans rôle et des rôles cumulés, cinq niveaux de forfait et quatre combinaisons d’add-ons ; contrôle des liens directs, replis, doublons et copies indépendantes.
- Typage, ESLint ciblé et compilation de production Webpack réussis.
- Parcours navigateur ciblés consignés après exécution sur une copie temporaire sans secrets, avec base de démonstration isolée.
- Aucune migration supplémentaire, aucun déploiement ni changement d’abonnement.

## Correction issue du contrôle mobile

Le bouton flottant de démonstration « Voir les offres » recouvrait le dernier choix du menu mobile (Réservations). Il est désormais masqué seulement pendant l’ouverture de ce menu, puis réapparaît à sa fermeture. Cette correction ciblée conserve l’offre visible hors navigation et évite de contourner un obstacle réel dans le test.

### Résultats navigateur finaux

Deux parcours Playwright réussis après correction : navigation ordinateur pour propriétaire, cuisine, bar, manager et comptable ; liens directs autorisés et refusés ; navigation mobile propriétaire/comptable avec mêmes contributions, ouverture de Réservations et disparition/réapparition du bouton promotionnel. Aucun échec restant dans ces deux parcours ciblés. Compilation relancée avec la correction CSS et réussie. Aucun déploiement effectué.


## Suite — Toutes les contributions appartiennent à leur fonctionnalité

Le catalogue central ne contient plus de libellés, permissions ou règles commerciales par entrée : il assemble des exports explicites, ce qui conserve un ordre stable et vérifiable. Aucune découverte automatique de fichiers ni exécution de code externe n’est ajoutée.

| Domaine | Entrées |
| --- | --- |
| Add-ons, Pilotage, QR | Boutique, vue d’ensemble, QR codes |
| Sécurité opérationnelle | Activité, sécurité |
| Salle, Réservations | Plan de salle, réservations |
| Commandes | Commandes, cuisine, bar |
| Inventaire | Stocks, recettes |
| Approvisionnement | Fournisseurs, livraisons |
| Ressources humaines | Équipe, présences, heures/absences, paie |
| Finance | Finances, opérations à vérifier, dépenses |
| Facturation, factures fournisseurs, banque, paiements | Factures clients, factures fournisseurs, banque, versements |
| Fidélité, catalogue, plateforme, CMS | Clients, carte, établissements, site web |

Les dossiers Inventaire et Approvisionnement introduisent uniquement la propriété de leurs déclarations de navigation : leurs opérations existantes restent dans `lib/actions.ts` et `Management`. Les fonctionnalités n’ont pas été déplacées ni réécrites.

Les contributions utilisent désormais les capacités `finance`, `website` et `loyalty` du moteur commercial existant. La correspondance historique 39/69/99 reste centralisée ; aucune nouvelle offre n’est déduite. La permission paie conserve son contrôle commercial finance historique. Les entrées auparavant sans seuil restent sans seuil supplémentaire. Une capacité inconnue est refusée à l’enregistrement du catalogue.

Validation de cette suite : cinq tests ciblés réussis, dont 240 combinaisons de rôles/forfaits/add-ons comparées au menu antérieur ; typage, ESLint ciblé, compilation de production et contrôle du diff réussis. La suite métier complète de 250 tests a été exécutée au volet précédent ; elle n’est pas revendiquée comme relancée pour ce déplacement de déclarations. Aucun déploiement, aucune migration supplémentaire, aucun changement des droits serveur.

Les deux parcours navigateur ordinateur/mobile ont également été relancés avec succès sur la copie isolée : pages par rôle, liens directs, repli autorisé, menus mobiles et absence de chevauchement du bouton promotionnel.

## Ajustement demandé — Add-ons en bas de Configuration

L’entrée Add-ons est déplacée après Sécurité opérationnelle, dans la même section Configuration. La section Configuration isolée en haut du menu disparaît. Les règles d’accès restent identiques ; seule cette position est volontairement différente de la référence historique. Les tests de comparaison conservent la référence d’origine et appliquent explicitement ce déplacement attendu.

La page s’ouvre sur « Mes add-ons », qui regroupe les fonctionnalités incluses dans le forfait de l’établissement et les abonnements actifs non expirés. « Boutique d’add-ons » montre les autres fonctionnalités du catalogue, avec paiement en attente ou disponibilité future clairement indiqués. Les compteurs et états vides sont gérés. Une fonctionnalité incluse et également souscrite n’est affichée qu’une fois ; une demande de paiement n’est pas assimilée à un abonnement actif.

Crédits Studio conserve sa vue séparée. Le forfait renvoyé par le serveur des add-ons est utilisé pour le classement. Le classement est une présentation : il ne change ni permissions, ni facturation, ni activation. Aucun suivi d’utilisation ni interrupteur de désactivation n’est inventé. Les fonctionnalités incluses mais non utilisées restent dans Mes add-ons.

Validation locale : sept tests ciblés réussis (classement, expiration, paiement en attente, inclusion, unicité et parité des droits de navigation), typage, ESLint et compilation réussis. Quatre parcours navigateur réussis : emplacement du menu et Configuration unique, forfait démo réel avec catalogue entièrement inclus, états basic/abonnement actif/paiement en attente simulés par réponse API de test sur mobile, navigation ordinateur/mobile existante. Aucun paiement réel ou Stripe de bout en bout effectué. Aucun déploiement.
