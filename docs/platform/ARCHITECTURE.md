# Architecture plateforme

## Exécution

Next.js/React/TypeScript sont conservés. Les services commandes, lots, réservations, catalogue et fidélité restent transactionnels. `DB` expose `query`/`exec` ; `Database` ajoute `transaction` et `close`. Deux adaptateurs partagent ce contrat : PGlite pour la démonstration, PostgreSQL/pg avec pool pour l’installation hébergée.

En production, `DATABASE_URL` est obligatoire et ne peut appartenir à un propriétaire des tables, un superutilisateur ou un rôle BYPASSRLS. `MIGRATION_DATABASE_URL` n’est transmis qu’au service de migration. Le worker utilise un autre compte ; son droit de récupérer les tâches n’est pas accordé à l’application.

Chaque transaction pose son contexte avec `set_config(..., true)` : utilisateur, établissement, canal public et identité client éventuelle. L’état est local à la transaction et ne fuit pas à travers le pool. Le même contexte existe dans l’adaptateur de démonstration.

## Organisation des données

Une organisation possède plusieurs établissements. Les droits d’organisation OWNER/ADMIN permettent leur administration ; les affectations d’établissement conservent les métiers et peuvent cumuler plusieurs rôles. L’administrateur de plateforme n’obtient aucun accès automatique aux restaurants. Un accès support exige un accord du restaurateur, une raison, une échéance de 60 minutes au maximum et une trace.

Les comptes clients ont une identité OIDC, puis un rattachement distinct dans chaque organisation. Une fiche opérationnelle est conservée par établissement ; un portefeuille d’organisation peut mutualiser les points. Les consentements de fidélité et de communication sont distincts. Changer le périmètre des points avec un solde existant nécessite un rapprochement préalable.

RLS assure le périmètre locataire. Les permissions métier sont vérifiées par les services. Les fonctions SQL SECURITY DEFINER sont ciblées, ont un search_path fixé et ne donnent pas d’accès général aux tables. Les triggers contrôlent les liens entre tables indirectes : commande/produit, recette/ingrédient, réservation/table, règlement/client, quota/lot, achats et inventaires.

Les canaux publics utilisent un contexte d’établissement explicite. Ils n’exposent que les projections prévues par les routes : aucune connexion SQL n’est distribuée aux navigateurs. Ils ne constituent pas une politique SQL de lecture anonyme universelle utilisable directement par des clients externes.

## API

Les réponses privées ont `Cache-Control: private, no-store`. Les nouvelles erreurs ont `{error:{code,message}}`. L’API historique `/api/v1` garde son format pour les écrans métier existants.

| Interface                                       | Usage                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `/api/platform`                                 | Lecture des organisations/établissements, création, invitations et affectations   |
| `/api/restaurants/:id/:module`                  | Modules `team`, `shop`, `site`, `inventory`, `security`, `integrations`, `events` |
| `/api/restaurants/:id/offline`                  | Appareil, quota, synchronisation et réconciliation                                |
| `/api/store/:id/:action`                        | Catalogue, commande, suivi par jeton, compte et avis                              |
| `/api/restaurants/:id/exports`                  | Ventes déclarées ou pointages, période bornée, CSV                                |
| `/api/restaurants/:id/media`                    | Import d’image authentifié                                                        |
| `/api/media/:id/:asset`                         | Média public référencé par un site publié                                         |
| `/auth/login`, `/auth/callback`, `/auth/logout` | OIDC avec état, nonce, PKCE et session HttpOnly                                   |
| `/api/cms/:id` et `/api/cms/:id/media`          | Studio, versions et médiathèque image/vidéo                                       |
| `/api/ops-security/:id`                         | Journal, incidents, corrections et archives du centre complet                     |
| `/api/health`                                   | Disponibilité de la base, sans données métier                                     |

Les schémas Zod dans les services sont les contrats exécutables. Les chemins historiques sont compatibles ; les nouveaux clients doivent utiliser les chemins contenant explicitement l’établissement. Une clé d’idempotence appartient à un établissement et son contenu est vérifié.

## Tâches et actualisation

La boîte d’envoi est persistante, avec unicité établissement/type/clé. Le worker récupère les tâches avec `FOR UPDATE SKIP LOCKED`, jeton de location et tentatives bornées. Les traitements non implémentés échouent explicitement. Les notifications utilisent un identifiant stable pour supporter un redémarrage.

Les mutations produisent des événements sans données clients détaillées. Le tableau de bord interroge un curseur toutes les cinq secondes et ne recharge ses projections que si nécessaire ; une relecture complète toutes les trente secondes permet le rattrapage. Les commandes et journaux sont bornés. Ce mécanisme n’est pas un service push.

## Croissance

Les processus applicatifs sont réplicables grâce au pool, aux transactions et aux tâches persistantes. Le registre `organization_placements` prépare la localisation des organisations ; le routage vers plusieurs clusters et le déplacement en ligne ne sont pas implémentés. L’installation de référence reste sur un hôte. Toute promesse de capacité nécessite un test HTTP et métier représentatif, une analyse des coûts et des procédures d’exploitation.

Le contexte de transaction et le contexte de journalisation utilisent chacun un singleton AsyncLocalStorage partagé entre les bundles de routes Next.js. Les services CMS et sécurité exécutent aussi les politiques RLS en démonstration au moyen du rôle non propriétaire `dattier_app`. Les relations incident/correction/événement portent une contrainte composite d’établissement.
