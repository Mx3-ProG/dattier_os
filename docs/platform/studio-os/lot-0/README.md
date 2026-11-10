# STUDIO OS — Lot zéro : référence avant modularisation

Date : 8 novembre 2026. Périmètre : état local de Dattier OS / atacuisine, incluant les modifications non commitées. Ce dossier documente l'existant ; il n'active aucun module, ne modifie aucun tarif et ne migre aucune donnée.

## Décision produit retenue

Un **add-on est une fonctionnalité utile et cohérente**, par exemple « Plan de salle » : création et placement des tables, zones, états, visualisation et liens avec l'accueil/réservation. Un dossier technique n'est pas nécessairement un produit à vendre.

- Le propriétaire ou un administrateur autorisé compose l'environnement de son entreprise. Son équipe bénéficie des capacités souscrites selon ses permissions.
- La sélection personnelle d'écrans est une préférence d'affichage : elle ne crée ni abonnement ni autorisation supplémentaire.
- Chaque métier propose un socle prédéfini, modifiable dans les limites de ses dépendances.
- Une future boutique présente bénéfice, démonstration isolée, compatibilité, prérequis, prix total, consommation, périmètre et conséquences de l'arrêt.
- Une dépendance technique obligatoire est comprise dans l'activation ; elle ne constitue pas un achat forcé supplémentaire.
- Les droits commerciaux, permissions utilisateur, disponibilité technique et préférence d'affichage restent distincts.
- Les tarifs et le contenu des offres existantes restent inchangés durant ce lot.
- L'identité cible est STUDIO OS, édité par Studio ATS, avec STUDIO VOICE. Le renommage appartient à un lot suivant.

## Livrables

| Document | Usage |
| --- | --- |
| [REFERENCE.json](REFERENCE.json) | Commit, branche, date et empreintes SHA-256 de l'état de travail, y compris fichiers non suivis |
| [ETAT-GIT.txt](ETAT-GIT.txt) | Liste initiale des changements existants ; ne pas les écraser lors des prochains lots |
| [FONCTIONNALITES.md](FONCTIONNALITES.md) | Découpage fonctionnel, maturité, dépendances et accès actuels |
| [DEPENDANCES.md](DEPENDANCES.md) | Relevé statique des imports entre domaines et premières frontières à clarifier |
| [NON-REGRESSION.md](NON-REGRESSION.md) | Parcours, invariants et tests à préserver |
| [VERIFICATIONS.md](VERIFICATIONS.md) | Résultats observés de cette exécution, limites et reproduction |

Les chemins des sources dans les tableaux sont relatifs à la racine du dépôt. Le manifeste exclut les secrets, dépendances installées, données d'exploitation et ce dossier. Il identifie une version locale : **ce n'est ni une sauvegarde des données ni un commit reproductible à lui seul**. Aucun historique financier, média client ou compte n'est copié ici.

## Architecture constatée

Application Next.js/React/TypeScript, services sous `src/features`, accès SQL transactionnel via `src/lib/database`, PGlite pour la démonstration et PostgreSQL pour l'installation hébergée. Authentification OIDC/Keycloak ; stockage S3 compatible ; worker persistant. Ne pas ajouter une migration Supabase à la modularisation sans besoin distinct.

Les organisations, établissements, affectations, RLS et contraintes de références existent. Le moteur commercial utilise encore les montants 0/39/69/99 comme identifiants et seuils d'accès. Les abonnements sont activés manuellement. Le code Stripe marchand ne constitue pas Stripe Billing pour STUDIO OS.

Points à traiter avant extraction :

1. `src/lib/actions.ts` centralise des mutations de plusieurs domaines.
2. `src/lib/snapshot.ts` rassemble des projections et calculs liés au restaurant.
3. `src/components/workspace.tsx`, la navigation d'administration, l'assistant et les guides maintiennent plusieurs listes d'écrans.
4. `orders/service.ts` fournit aussi journalisation et notifications à de nombreux domaines.
5. Le catalogue impose recette et station cuisine/bar ; la disponibilité dépend des ingrédients.
6. Les réservations reposent sur tables, capacité, services et heure de Paris.
7. Le Pilotage financier lit directement banque, facturation et RH ; isoler ses fournisseurs d'indicateurs sans supprimer les écrans.
8. Les modèles `site` et `cms` coexistent. Préserver publications et versions des deux jusqu'à une migration explicite.
9. Les règles de forfait apparaissent aussi en SQL : remplacer seulement les menus ne suffira pas.

## Frontières futures à préparer

Socle : identité, organisations/établissements, autorisation, audit, fichiers, registre, tâches. Modules : catalogue, clients, ventes, stocks, achats, planning, RH, finance, facturation, banque, CMS, communication, fidélité, assistant. Extension restauration : salle, tables, recettes, production cuisine/bar et règles de réservation. Les autres métiers ne sont pas déclarés disponibles.

La salle et la réservation doivent pouvoir être présentées séparément sans casser leur intégration : les règles d'allocation des tables restent une dépendance lorsque la réservation visuelle les utilise. Désactiver l'éditeur de salle ne doit pas supprimer les tables ou invalider des réservations existantes. Le comportement exact de suspension et de consultation historique sera contractualisé au lot 1.

## Porte de sortie du lot zéro

- Référence des fichiers et changements existants capturée.
- Fonctionnalités, droits et parcours décrits avec leurs limites.
- Vérifications exécutées et échecs consignés sans les masquer ni modifier les attentes pour obtenir du vert.
- Aucun changement applicatif, tarifaire ou de base requis pour livrer cette référence.

Le lot zéro peut livrer une référence avec écarts connus ; il ne certifie pas la production. Avant une bascule fonctionnelle, les régressions du parcours concerné doivent être corrigées ou explicitement bornées et les tests correspondants exécutés.

## Suite : lot 1

Définir les contrats de modules et le registre en conservant les parcours existants. Commencer par l'add-on Salle comme exemple de produit fonctionnel : capacité, navigation, guide, permissions, dépendances, historique et désactivation. Introduire ensuite les droits explicites en mode comparaison avec les seuils actuels. Aucune boutique réelle, facturation automatique, suppression de fonction ou changement des offres n'est inclus dans le lot zéro.
