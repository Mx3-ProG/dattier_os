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

La permission `floor` donne accès au plan de salle. Le propriétaire peut gérer le droit d’aménagement de chaque membre. Le forfait Exploitation permet 50 tables actives par établissement.

## Isolation des structures (SaaS)

Chaque structure (établissement) appartient à une seule organisation cliente. Un propriétaire, son équipe et son site ne voient et ne modifient que les structures de leur organisation : contrôle applicatif (`scope`) et RLS PostgreSQL (`app.has_restaurant`).

- Nombre de structures : places de l’abonnement Studio de l’organisation (`app.configure_organization_plan`, déclencheur `check_restaurant_seat`). Les offres Essentiel / Premium envisagées le 3 novembre 2026 ont été remplacées par la formule unique Studio (9 novembre 2026).
- L’équipe plateforme n’a pas de vue transverse permanente : elle accède à une structure par une autorisation de support limitée dans le temps et journalisée (`support_grants`).
- `SUPER_ADMIN` reste un rôle d’établissement (super admin de la structure, gestion des add-ons).

Démo : Nadia (Studio Restau + L’Atelier), Hugo (client indépendant, Le Bistrot de Hugo).

Tous les profils peuvent consulter les notifications de leur établissement et pointer leur propre service. Les confirmations de réservation ne sont pas publiques. Le public ne peut demander qu’une réservation ou une commande à confirmer. Les profils publics de `/demo` ne sont disponibles que lorsque la démo locale est activée.

Les jetons ne contiennent aucun rôle choisi par le navigateur ; le serveur relit le profil et son affectation. La définition du seed attribue explicitement SUPER_ADMIN à l’identifiant `slimane` : aucune règle sur le prénom ou l’adresse électronique n’existe en production, dont l’authentification reste à implémenter.

Premier administrateur de production : procédure à ajouter côté serveur hors HTTP public. Créer l’identité Auth, vérifier explicitement son UUID, utiliser une commande CLI de bootstrap exécutée par l’opérateur avec accès à la base, interdire le bootstrap si un admin existe déjà, tracer l’attribution, puis retirer les droits de bootstrap. Ne jamais transposer le sélecteur démo en mécanisme de production.

Les permissions `catalog` et `payments` sont distinctes de `settings` et `orders`. OWNER, MANAGER et SUPER_ADMIN gèrent la carte. OWNER, MANAGER, SUPER_ADMIN et WAITER déclarent les règlements (avec code nominatif éventuel). Les permissions clients permettent l’attribution et l’annulation de codes ; les profils de salle ne voient au règlement que les identifiants/noms des clients et doivent saisir le code fourni par son titulaire. Les jetons des fiches privées ne sont jamais renvoyés aux rôles cuisine/bar/salle.

La permission `payroll` couvre contrats, coûts, clôture et export de paie : Propriétaire, Super Admin et Comptabilité. Le Manager gère heures et absences mais ne voit pas les rémunérations.
