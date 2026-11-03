# Rôles et permissions

Source centrale : `src/lib/permissions.ts`. Les contrôles sont exécutés côté serveur après validation de l’appartenance, indépendamment des boutons visibles.

| Rôle | Accès |
| --- | --- |
| SUPER_ADMIN | Administrateur de la plateforme (table `platform_admins`) : vue sur toutes les structures, seul à pouvoir réinitialiser la démo et à lever les verrous du Studio. N’est membre d’aucune structure. |
| OWNER | Opérations, finances, configuration et établissements autorisés |
| MANAGER | Opérations, carte/recettes, équipe, achats, clients et codes promo, audit ; pas de coûts ni finances |
| WAITER | Tables, commandes, service, déclarations de règlement, réservations |
| CHEF | Préparations cuisine, plan de salle, prise/service/annulation de commandes, lecture stock et pertes ; pas de règlement ni corrections d’inventaire |
| BARTENDER | Préparations bar, plan de salle, prise/service/annulation de commandes, lecture stock et pertes ; pas de règlement ni corrections d’inventaire |
| STOCK_MANAGER | Stocks, inventaires, pertes, achats |
| PURCHASING | Fournisseurs, commandes et réceptions |
| ACCOUNTANT | Rapports financiers et dépenses |

## Isolation des structures (SaaS)

Chaque structure (établissement) appartient à une seule organisation cliente. Un propriétaire, son équipe et son site ne voient et ne modifient que les structures de leur organisation : contrôle applicatif (`scope`) et politiques RLS en base (`app.has_restaurant`).

- Offre **Essentiel** : une structure par organisation, 50 tables actives au plan de salle.
- Offre **Premium** (`organizations.plan='premium'`) : jusqu’à 10 structures dans la même organisation, sans plafond de tables.
- Un compte propriétaire ne peut posséder des structures que dans une seule organisation (pas de contournement en créant une seconde organisation).
- Ces règles sont imposées par des déclencheurs SQL (migration `017_tenancy_plans.sql`), quel que soit le chemin de création.
- Seul le Super Admin plateforme a une vue transverse ; le rôle `SUPER_ADMIN` ne peut pas être attribué à un membre de structure.

Démo : Nadia (Premium, Le Dattier + L’Atelier), Hugo (Essentiel, Le Bistrot de Hugo), Slimane (Super Admin plateforme).

La permission `floor` donne accès au plan de salle (SUPER_ADMIN, OWNER, MANAGER, WAITER, BARTENDER). Le **droit de modifier le plan** (créer, renommer, réordonner, supprimer des zones ; ajouter, modifier, déplacer, tourner, archiver, supprimer une table) se décide membre par membre :

- OWNER, SUPER_ADMIN et l’administrateur de l’organisation l’ont toujours ;
- MANAGER, WAITER et BARTENDER l’ont par défaut ; le propriétaire le retire ou le rend dans Administration › Équipe (« Peut modifier le plan de salle »), stocké dans `floor_layout_access` ;
- le contrôle est fait par le serveur (`src/features/floor/access.ts`, appelé par chaque action d’aménagement) et la politique RLS de `floor_layout_access` n’autorise que le propriétaire ou l’administrateur à écrire ce droit. Un membre sans droit continue le service (états des tables, commandes).

Règles du plan : une table occupée ne peut ni changer d’état manuellement ni être archivée ; une table avec historique ne peut qu’être archivée ; réduire les places est refusé si une réservation à venir dépasse la nouvelle capacité ; une zone qui contient des tables avec historique ne peut pas être supprimée sans déplacer ou archiver ces tables (les tables sans historique partent avec la zone) ; il reste toujours au moins une zone. L’angle des tables (0–359°, sens horaire) est enregistré et affiché sur le plan public de réservation, chaises comprises.

Plafond de tables (migration `020_floor_architect.sql`, déclencheur SQL `table_quota` doublé d’un message côté serveur) : **50 tables actives par structure en offre Essentiel**, toutes zones confondues (les tables archivées ne comptent pas, restaurer une table compte). **L’offre Premium ne prévoyait rien sur les tables** (seulement jusqu’à 10 structures) : elle est sans plafond de tables, les numéros restant limités à 1–999.

Tous les profils peuvent consulter les notifications de leur établissement et pointer leur propre service. Les confirmations de réservation ne sont pas publiques. Le public ne peut demander qu’une réservation ou une commande à confirmer. Les profils publics de `/demo` ne sont disponibles que lorsque la démo locale est activée.

Les jetons ne contiennent aucun rôle choisi par le navigateur ; le serveur relit le profil et son affectation. La définition du seed attribue explicitement SUPER_ADMIN à l’identifiant `slimane` : aucune règle sur le prénom ou l’adresse électronique n’existe en production, dont l’authentification reste à implémenter.

Premier administrateur de production : procédure à ajouter côté serveur hors HTTP public. Créer l’identité Auth, vérifier explicitement son UUID, utiliser une commande CLI de bootstrap exécutée par l’opérateur avec accès à la base, interdire le bootstrap si un admin existe déjà, tracer l’attribution, puis retirer les droits de bootstrap. Ne jamais transposer le sélecteur démo en mécanisme de production.

Les permissions `catalog` et `payments` sont distinctes de `settings` et `orders`. OWNER, MANAGER et SUPER_ADMIN gèrent la carte. OWNER, MANAGER, SUPER_ADMIN et WAITER déclarent les règlements (avec code nominatif éventuel). Les permissions clients permettent l’attribution et l’annulation de codes ; les profils de salle ne voient au règlement que les identifiants/noms des clients et doivent saisir le code fourni par son titulaire. Les jetons des fiches privées ne sont jamais renvoyés aux rôles cuisine/bar/salle.
