# Lot 2 — Droits commerciaux en comparaison

Le moteur pur `src/core/modules/entitlements.ts` sépare les identifiants basic/pro/premium des montants historiques. Il résout des capacités commerciales, sans remplacer permissions, contexte d'entreprise, configuration, quotas ou règles métier.

Les attributions supplémentaires sont des entrées serveur vérifiées, limitées à une organisation et éventuellement un établissement, avec début inclus et fin exclue. Elles sont dédupliquées et ne réactivent pas une organisation suspendue. Aucun stockage d'add-ons ni achat n'est encore livré.

## Observation

`STUDIO_OS_ENTITLEMENTS_SHADOW=true` permet à `requirePlan` de comparer le résultat historique au nouveau modèle. Par défaut cette observation est désactivée. En cas d'écart, un avertissement sans identifiant client est produit ; la décision historique reste seule exécutée. Aucun déploiement ni configuration d'environnement n'a été changé.

La comparaison porte uniquement sur les seuils commerciaux 39/69/99 ; le seuil 0 n'est pas comparable. Le seuil 69 utilise website comme représentant du groupe historiquement inclus : cela n'autorise pas un utilisateur à éditer un site ni ne remplace la vérification de sa permission. Les comparaisons directes ailleurs dans le code et dans SQL ne sont pas encore instrumentées.

## Validation

Tests des 12 combinaisons forfait/seuil existantes, forfait inconnu, seuil non comparable, séparation des entreprises et établissements, dates limites, droits dédupliqués, suspension et contexte invalide. Les trois tests du registre restent inclus dans la vérification ciblée. Aucun changement d'interface ; les écarts navigateur du lot zéro restent ouverts.

## Suite

Étendre la comparaison aux capacités détaillées de Salle et aux permissions individuelles d'aménagement, puis aux autres services. Avant activation réelle : provenance persistante et vérifiée des attributions, migration additive, gestion de la configuration/dépendances, tests SQL et de parcours. Ne jamais utiliser une préférence personnelle ou une réponse du navigateur comme preuve d'achat ou d'autorisation.

## Suite — Salle : droits individuels

Le plan Add-ons et Crédits Studio est validé par le propriétaire du projet. L'activation payante et la recharge demeurent des étapes futures ; cette validation ne change pas les soldes existants.

La capacité `floor.arrange` dispose désormais d'une décision explicable indépendante : propriétaire, rôle insuffisant, refus individuel, accès par défaut ou accord individuel. La comparaison est branchée dans `canArrange`, sous le même indicateur `STUDIO_OS_ENTITLEMENTS_SHADOW`. Elle ne modifie pas la réponse historique et ne produit pas d'identifiant personnel dans le journal.

La requête conserve le couple établissement/utilisateur. Un accord individuel ne suffit pas sans permission métier. Les propriétaires conservent leur droit, les rôles cumulés sont pris en compte. Cette couche ne prouve ni l'appartenance à l'entreprise ni l'abonnement : le cadrage serveur, les droits commerciaux et les règles SQL restent indispensables et inchangés.

Tests ajoutés : tous les rôles avec trois états d'autorisation individuelle, cumul de rôles, profil vide, branchement serveur en observation, paramètres du périmètre et absence de requête superflue pour propriétaire/profil refusé. Les tests métier Salle sont relancés avec le registre et le moteur commercial.

Restent au lot 2 : capacités de consultation/état/réservation, attribution persistante des add-ons et comparaison sur les autres domaines. Le lot 3 de renommage n'a pas commencé.

## Suite — Consultation et opérations de salle

`floor.view` est observé sur les projections tables/zones du snapshot ; `floor.status` sur la mutation de l'état de table ; `table-booking.manage` sur les transitions de réservation. Les contrôles historiques restent exécutoires, y compris vérification de périmètre, table occupée, transitions et disponibilité. L'observation n'ajoute pas de requête ni de droit.

Attention : l'accès historique à l'état des tables repose sur `orders`, pas sur `floor`. Un cuisinier peut consulter les tables via ce droit mais n'a pas de droit de gestion des réservations. Cette distinction est conservée et testée. Le registre ne doit pas fusionner arbitrairement ces permissions.

Les disponibilités et demandes publiques restent hors de ces règles d'équipe : leur protection ne peut pas être remplacée par une permission de salarié. Les tarifs et activations persistantes restent inchangés.

La vérification ciblée couvre tous les rôles, rôles cumulés, profil sans rôle et un écart volontaire : l'avertissement ne contient que la capacité, et la décision historique est conservée. Les parcours Salle, réservation, plateforme et service sont relancés avec l'observation activée.

## Suite — Services à capacités nommées

Le contrôle `requireCommercialCapability` reçoit une capacité au lieu d'un montant. Une table de compatibilité conserve strictement les seuils actuels ; elle ne lit encore aucune attribution payante persistante. Les capacités inconnues sont refusées avant accès à la base. L'observation compare la capacité exacte (finance, fidélité, etc.), sans employer website comme substitut.

Services raccordés : studio CMS, finance et indicateurs, factures clients/fournisseurs, paiements marchands, commandes internes/publiques, administration site/SEO/fidélité et configuration boutique. Les permissions métier, vérifications de stock, disponibilité des prestataires et politiques SQL restent inchangées. Aucun droit supplémentaire n'est accordé.

Les anciens appels à `requirePlan` restent pour les autres parcours (dont modération), ainsi que les conditions dans les projections et SQL. Ne pas supprimer la compatibilité tant que ces chemins ne sont pas migrés et testés. Les fonctions actuelles ne suffisent pas à activer un add-on payé hors forfait : persistance et parité des accès publics/SQL restent nécessaires.

Test de parité : cinq états de forfait (dont absence de plan) × cinq capacités, comparaison des réponses et erreurs historiques, contrôle du paramètre établissement, refus de capacités inconnues et noms hérités d'Object. La suite métier complète est exécutée en mode observation pour vérifier les services raccordés.
