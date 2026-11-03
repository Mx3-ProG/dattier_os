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

- Offre **Essentiel** : une structure par organisation.
- Offre **Premium** (`organizations.plan='premium'`) : jusqu’à 10 structures dans la même organisation.
- Un compte propriétaire ne peut posséder des structures que dans une seule organisation (pas de contournement en créant une seconde organisation).
- Ces règles sont imposées par des déclencheurs SQL (migration `017_tenancy_plans.sql`), quel que soit le chemin de création.
- Seul le Super Admin plateforme a une vue transverse ; le rôle `SUPER_ADMIN` ne peut pas être attribué à un membre de structure.

Démo : Nadia (Premium, Le Dattier + L’Atelier), Hugo (Essentiel, Le Bistrot de Hugo), Slimane (Super Admin plateforme).

La permission `floor` (aménagement du plan de salle : ajouter, modifier les places/l’état, déplacer, archiver, supprimer une table) est accordée à SUPER_ADMIN, OWNER, MANAGER, WAITER et BARTENDER. Une table occupée ne peut ni changer d’état manuellement ni être archivée ; une table avec historique ne peut qu’être archivée ; réduire les places est refusé si une réservation à venir dépasse la nouvelle capacité.

Tous les profils peuvent consulter les notifications de leur établissement et pointer leur propre service. Les confirmations de réservation ne sont pas publiques. Le public ne peut demander qu’une réservation ou une commande à confirmer. Les profils publics de `/demo` ne sont disponibles que lorsque la démo locale est activée.

Les jetons ne contiennent aucun rôle choisi par le navigateur ; le serveur relit le profil et son affectation. La définition du seed attribue explicitement SUPER_ADMIN à l’identifiant `slimane` : aucune règle sur le prénom ou l’adresse électronique n’existe en production, dont l’authentification reste à implémenter.

Premier administrateur de production : procédure à ajouter côté serveur hors HTTP public. Créer l’identité Auth, vérifier explicitement son UUID, utiliser une commande CLI de bootstrap exécutée par l’opérateur avec accès à la base, interdire le bootstrap si un admin existe déjà, tracer l’attribution, puis retirer les droits de bootstrap. Ne jamais transposer le sélecteur démo en mécanisme de production.

Les permissions `catalog` et `payments` sont distinctes de `settings` et `orders`. OWNER, MANAGER et SUPER_ADMIN gèrent la carte. OWNER, MANAGER, SUPER_ADMIN et WAITER déclarent les règlements (avec code nominatif éventuel). Les permissions clients permettent l’attribution et l’annulation de codes ; les profils de salle ne voient au règlement que les identifiants/noms des clients et doivent saisir le code fourni par son titulaire. Les jetons des fiches privées ne sont jamais renvoyés aux rôles cuisine/bar/salle.
